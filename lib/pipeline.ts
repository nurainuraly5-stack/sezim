// Клиентский конвейер: ввод → признаки → MoodProfile → StyleTokens + explain → сохранение.
import type { AudioFeatures, DayEntry, PhotoFeatures, SongMeta, TextFeatures } from '@/core/types';
import { analyzeTextFallback } from '@/core/analyze/text-fallback';
import { buildMood } from '@/core/mood';
import { buildStyle } from '@/core/style-engine';
import { hashString } from '@/core/color';
import { cacheGet, cacheSet, newId, putDay } from './db';
import { ORB_RENDER_VERSION, renderOrbBlob } from '@/components/orb-engine';
import { orbParams } from '@/core/orb';
import { orbSize } from '@/design/tokens';

export type DraftInputs = {
  text: string;
  photos: Blob[];
  photoFeatures?: PhotoFeatures;
  song: { kind: 'file' | 'link'; url?: string; file?: Blob; fileName?: string; meta?: SongMeta };
  audio?: AudioFeatures;
  date: string;
};

/** Мгновенный локальный расчёт — для живого превью. */
export function previewStyle(text: string, photo?: PhotoFeatures, audio?: AudioFeatures, meta?: SongMeta) {
  const tf = analyzeTextFallback(text || ' ');
  const mood = buildMood(tf, photo, audio);
  return { text: tf, mood, ...buildStyle({ mood, text: tf, photo, audio, meta }) };
}

type AnalyzeResponse = {
  llm: (Omit<TextFeatures, 'voiceStyle' | 'wordCount' | 'engine'> & { voicePace: 'slow' | 'mid' | 'fast' }) | null;
  llmReason?: string;
  songMeta: { title?: string; artist?: string } | null;
};

/** /api/analyze с кэшем по хэшу ввода и жёстким таймаутом; падение → fallback. */
export async function analyzeRemote(text: string, songUrl?: string): Promise<AnalyzeResponse | null> {
  const key = 'analyze:' + hashString(text + '|' + (songUrl || ''));
  const cached = await cacheGet<AnalyzeResponse>(key);
  if (cached) return cached;
  try {
    const r = await fetch('/api/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, songUrl: songUrl || undefined }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as AnalyzeResponse;
    if (j.llm) await cacheSet(key, j);
    return j;
  } catch {
    return null;
  }
}

export function mergeText(fallback: TextFeatures, llm: AnalyzeResponse['llm']): TextFeatures {
  if (!llm) return fallback;
  return {
    ...fallback,
    valence: llm.valence, arousal: llm.arousal, warmth: llm.warmth, density: llm.density, contrast: llm.contrast,
    daypart: llm.daypart, motifs: llm.motifs.length >= 3 ? llm.motifs : fallback.motifs,
    warmMotifs: llm.warmMotifs, coldMotifs: llm.coldMotifs,
    quote: llm.quote, title: llm.title.replace(/[«»"]/g, '').trim(),
    voiceStyle: { pace: llm.voicePace, warmth: llm.warmth },
    engine: 'llm',
  };
}

/** Предрендер озвучки; null → в просмотре используется голос браузера. */
export async function renderVoice(script: string, pace: 'slow' | 'mid' | 'fast', warmth: number): Promise<Blob | undefined> {
  try {
    const r = await fetch('/api/tts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: script.slice(0, 700), pace, warmth }),
      signal: AbortSignal.timeout(16000),
    });
    if (!r.ok) return undefined;
    const b = await r.blob();
    return b.size > 1000 ? b : undefined;
  } catch {
    return undefined;
  }
}

/** Настроен ли TTS на сервере (кэш на сессию вкладки). */
let ttsConfigured: Promise<boolean> | null = null;
export function isTtsConfigured(): Promise<boolean> {
  ttsConfigured ??= fetch('/api/tts', { signal: AbortSignal.timeout(4000) })
    .then((r) => (r.ok ? r.json() : { configured: false }))
    .then((j: { configured?: boolean }) => !!j.configured)
    .catch(() => false);
  return ttsConfigured;
}

/** Текст озвучки: название и цитата; если цитата начинается с названия — без повтора. */
export function voiceScript(title: string, quote: string) {
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N} ]/gu, '').trim();
  const q = quote.trim().replace(/[.…!?]*$/, '.');
  return norm(quote).startsWith(norm(title)) ? q : `${title.replace(/[.…]+$/, '')}. ${q}`;
}

export async function createDay(input: DraftInputs, opts: { titleOverride?: string; seed?: boolean; id?: string; createdAt?: number } = {}): Promise<DayEntry> {
  const fallback = analyzeTextFallback(input.text);
  const remote = opts.seed ? null : await analyzeRemote(input.text, input.song.kind === 'link' ? input.song.url : undefined);
  const text = mergeText(fallback, remote?.llm ?? null);
  const meta: SongMeta | undefined = input.song.meta || remote?.songMeta
    ? { ...(remote?.songMeta ?? {}), ...stripEmpty(input.song.meta) }
    : undefined;
  if (opts.titleOverride?.trim()) text.title = opts.titleOverride.trim();

  const mood = buildMood(text, input.photoFeatures, input.audio);
  const { tokens, explain } = buildStyle({ mood, text, photo: input.photoFeatures, audio: input.audio, meta });
  const voice = opts.seed || !(await isTtsConfigured()) ? undefined : await renderVoice(voiceScript(mood.title, mood.quote), mood.voiceStyle.pace, mood.voiceStyle.warmth);
  const createdAt = opts.createdAt ?? Date.now();
  // миниатюра сферы рендерится один раз при создании дня — архив показывает её без живого шейдера
  const thumb = await renderOrbBlob(orbParams({
    text: input.text, createdAt, mood, tokens, photo: input.photoFeatures, audio: input.audio, meta,
  }), orbSize.thumb).catch(() => undefined);

  const day: DayEntry = {
    id: opts.id ?? newId(), date: input.date, text: input.text, photos: input.photos,
    song: { ...input.song, meta, analysis: input.audio },
    mood, tokens, explain, voice, thumb, thumbV: thumb ? ORB_RENDER_VERSION : undefined, createdAt,
    analysisEngine: text.engine, photoFeatures: input.photoFeatures, seed: opts.seed,
  };
  await putDay(day);
  return day;
}

function stripEmpty<T extends object>(o?: T): Partial<T> {
  if (!o) return {};
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== null)) as Partial<T>;
}
