// POST /api/analyze — LLM-анализ текста (zod, таймаут 9 с) + oEmbed-метаданные ссылки на песню.
// Если LLM недоступен — { llm: null }, клиент работает на fallback-движке.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeWithLlm } from '@/lib/server/llm';

export const runtime = 'nodejs';
// модель — до 9 с, oEmbed — до 3,5 с параллельно; явный предел не зависит от того, включён ли на Vercel Fluid compute
export const maxDuration = 15;

// llm:false — флаг «LLM выключен» с клиента (демо работы без LLM): модель не вызывается
const Body = z.object({ text: z.string().max(8000).optional(), songUrl: z.string().url().max(500).optional(), llm: z.boolean().optional() });

type OEmbed = { title?: string; author_name?: string };

async function oembed(url: string): Promise<{ title?: string; artist?: string } | null> {
  let endpoint: string | null = null;
  const host = new URL(url).hostname.replace(/^www\.|^m\.|^music\./, '');
  if (host === 'youtu.be' || host.endsWith('youtube.com')) endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  else if (host === 'open.spotify.com') endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
  else if (host === 'soundcloud.com') endpoint = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  if (!endpoint) return null;
  try {
    const r = await fetch(endpoint, { signal: AbortSignal.timeout(3500) });
    if (!r.ok) return null;
    const j = (await r.json()) as OEmbed;
    return parseOembedTitle(j.title, j.author_name);
  } catch {
    return null;
  }
}

const loose = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** YouTube: «Исполнитель - Песня (Official video)» → исполнитель и песня. Если после тире стоит имя канала
 *  («Трек — afterhours.sound»), это не исполнитель: песня — начало, исполнитель — канал. */
function parseOembedTitle(raw?: string, author?: string): { title?: string; artist?: string } {
  let title = raw, artist = author?.replace(/ - Topic$/, '');
  if (title && / [-–—] /.test(title)) {
    const parts = title.split(/ [-–—] /);
    if (artist && loose(parts[parts.length - 1]) === loose(artist)) title = parts.slice(0, -1).join(' - ');
    else { artist = parts[0].trim(); title = parts.slice(1).join(' - '); }
  }
  title = title?.replace(/\s*[([][^)\]]*?(official|video|audio|lyrics|клип)[^)\]]*?[)\]]/gi, '').trim();
  return { title: title || undefined, artist: artist || undefined };
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const { text, songUrl, llm: llmWanted } = parsed.data;

  const [llm, meta] = await Promise.all([
    text && text.trim().length > 8 && llmWanted !== false ? analyzeWithLlm(text) : Promise.resolve(null),
    songUrl ? oembed(songUrl) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    llm: llm?.ok ? llm.data : null,
    llmReason: llmWanted === false ? 'disabled by client' : llm && !llm.ok ? llm.reason : undefined,
    songMeta: meta,
  });
}
