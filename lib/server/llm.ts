// Абстракция LLM-провайдера. Выбор: LLM_PROVIDER = anthropic | none. Ключи только на сервере.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

/** То, что модель обязана вернуть (форма для structured outputs). */
export const LlmTextSchema = z.object({
  valence: z.number(),
  arousal: z.number(),
  warmth: z.number(),
  density: z.number(),
  contrast: z.number(),
  daypart: z.enum(['dawn', 'day', 'dusk', 'night', 'unknown']),
  motifs: z.array(z.string()),
  warmMotifs: z.array(z.string()),
  coldMotifs: z.array(z.string()),
  quote: z.string(),
  title: z.string(),
  voicePace: z.enum(['slow', 'mid', 'fast']),
});
export type LlmText = z.infer<typeof LlmTextSchema>;

const unit = z.number().transform((v) => Math.min(1, Math.max(0, v)));
/** Пост-валидация: диапазоны и длины (то, что structured outputs не гарантирует). */
export const LlmTextChecked = LlmTextSchema.extend({
  valence: unit, arousal: unit, warmth: unit, density: unit, contrast: unit,
  motifs: z.array(z.string().min(1).max(40)).min(1).transform((a) => a.slice(0, 6)),
  warmMotifs: z.array(z.string().max(40)).transform((a) => a.slice(0, 4)),
  coldMotifs: z.array(z.string().max(40)).transform((a) => a.slice(0, 4)),
  quote: z.string().min(2).max(160),
  title: z.string().min(3).max(70).refine((t) => {
    const n = t.trim().split(/\s+/).length;
    return n >= 2 && n <= 8;
  }, 'title: 3–7 слов'),
});

const SYSTEM = `You analyse a short personal diary entry (usually Russian) for a memory-art app.
Return numeric features in 0..1 and short Russian strings.
- valence: how pleasant the day feels. arousal: calm (0) .. intense/hectic (1).
- warmth: sensory temperature of the day (cold weather, grey light → low; cocoa, sun, hugs → high). Not an emotion label.
- density: how many events/places/people are packed into the day.
- contrast: inner contradiction, mixed states ("холодно, но тёплое какао") → high.
- daypart: the part of the day that dominates the entry.
- motifs: 3–6 concrete sensory details quoted from the text in their original form (nouns/short phrases).
- warmMotifs / coldMotifs: subsets of details that feel warm / cold (may be empty).
- quote: a short phrase copied verbatim from the text (≤ 14 words) that best holds the day.
- title: a name for the day in the language of the entry, 3–7 words, calm literary tone, no quotes, no emoji, no date, no clichés like «день, который…». Grounded in a concrete detail of the entry.
- voicePace: narration pace that fits the day.
Never diagnose or make medical/psychological claims.`;

export type LlmResult = { ok: true; data: z.output<typeof LlmTextChecked>; provider: string } | { ok: false; reason: string };

export async function analyzeWithLlm(text: string, timeoutMs = 8000): Promise<LlmResult> {
  const provider = (process.env.LLM_PROVIDER || 'none').toLowerCase();
  if (provider === 'none') return { ok: false, reason: 'LLM_PROVIDER=none' };
  if (provider !== 'anthropic') return { ok: false, reason: `unknown provider ${provider}` };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, reason: 'ANTHROPIC_API_KEY missing' };

  const client = new Anthropic({ timeout: timeoutMs, maxRetries: 0 });
  try {
    // create + разбор вручную (а не messages.parse): parse бросает исключение на пустом/обрезанном тексте
    // раньше, чем виден stop_reason, — отказ и обрезку тогда не отличить от сбоя
    const res = await client.messages.create({
      model: process.env.LLM_MODEL || 'claude-opus-5-5',
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { effort: 'low', format: zodOutputFormat(LlmTextSchema) },
      messages: [{ role: 'user', content: `Diary entry:\n"""\n${text.slice(0, 6000)}\n"""` }],
    });
    if (res.stop_reason === 'refusal') return { ok: false, reason: 'refusal' };
    if (res.stop_reason === 'max_tokens') return { ok: false, reason: 'truncated' };
    const raw = res.content.find((b) => b.type === 'text')?.text ?? '';
    let json: unknown;
    try { json = JSON.parse(raw); } catch { return { ok: false, reason: 'invalid json' }; }
    const parsed = LlmTextChecked.safeParse(json);
    if (!parsed.success) return { ok: false, reason: 'validation: ' + parsed.error.issues[0]?.message };
    return { ok: true, data: parsed.data, provider: 'anthropic' };
  } catch (e) {
    if (e instanceof Anthropic.APIConnectionTimeoutError) return { ok: false, reason: 'timeout' };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, reason: 'rate limit' };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, reason: 'auth' };
    if (e instanceof Anthropic.APIError) return { ok: false, reason: `api ${e.status}` };
    return { ok: false, reason: 'error' };
  }
}
