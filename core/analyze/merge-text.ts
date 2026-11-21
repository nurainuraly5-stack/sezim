// Слияние упрощённого анализа текста с ответом LLM (/api/analyze). Чистая функция без браузерных зависимостей —
// её используют конвейер, сравнение дней и node-тест контракта LLM.
// Детали дня: если модель дала меньше трёх (в том числе ни одной на коротком тексте) — берутся из упрощённого анализа.
import type { TextFeatures } from '@/core/types';

/** Признаки текста от LLM в том виде, в каком их отдаёт /api/analyze. */
export type LlmTextFeatures = Omit<TextFeatures, 'voiceStyle' | 'wordCount' | 'engine'> & { voicePace: 'slow' | 'mid' | 'fast' };

export function mergeText(fallback: TextFeatures, llm: LlmTextFeatures | null): TextFeatures {
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
