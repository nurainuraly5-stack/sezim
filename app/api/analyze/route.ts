// POST /api/analyze — LLM-анализ текста (zod, таймаут 8 с) + oEmbed-метаданные ссылки на песню.
// Если LLM недоступен — { llm: null }, клиент работает на fallback-движке.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeWithLlm } from '@/lib/server/llm';

export const runtime = 'nodejs';

const Body = z.object({ text: z.string().max(8000).optional(), songUrl: z.string().url().max(500).optional() });

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
    let title = j.title, artist = j.author_name;
    // YouTube: «Исполнитель - Песня»
    if (title && / [-–—] /.test(title)) {
      const [a, ...rest] = title.split(/ [-–—] /);
      artist = a.trim(); title = rest.join(' - ').replace(/\s*[([].*?(official|video|audio|lyrics|клип).*?[)\]]/gi, '').trim();
    }
    artist = artist?.replace(/ - Topic$/, '');
    return { title, artist };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const { text, songUrl } = parsed.data;

  const [llm, meta] = await Promise.all([
    text && text.trim().length > 8 ? analyzeWithLlm(text) : Promise.resolve(null),
    songUrl ? oembed(songUrl) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    llm: llm?.ok ? llm.data : null,
    llmReason: llm && !llm.ok ? llm.reason : undefined,
    songMeta: meta,
  });
}
