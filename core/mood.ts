// Признаки текста + фото + аудио → непрерывный MoodProfile. Чистая функция.
import type { AudioFeatures, MoodProfile, PhotoFeatures, TextFeatures } from './types';
import { clamp } from './color';

type W = [value: number, weight: number];
const wavg = (...xs: W[]) => {
  let s = 0, w = 0;
  for (const [v, k] of xs) { s += v * k; w += k; }
  return w ? clamp(s / w) : 0.5;
};

export const tempoNorm = (bpm: number) => clamp((bpm - 60) / 120);

export function buildMood(text: TextFeatures, photo?: PhotoFeatures, audio?: AudioFeatures): MoodProfile {
  const aw = audio ? (audio.source === 'meta' ? 0.4 : 1) : 0; // оценке по метаданным доверяем меньше
  const modeVal = audio?.mode === 'major' ? 0.75 : audio?.mode === 'minor' ? 0.28 : 0.5;
  const modeWarm = audio?.mode === 'major' ? 0.66 : audio?.mode === 'minor' ? 0.34 : 0.5;
  // неуверенный лад (поп-петли, где мажор и параллельный минор звучат одинаково) влияет слабее
  const modeKnown = audio && audio.mode !== 'unknown' ? (audio.modeConfidence ?? 1) : 0;

  const valence = wavg(
    [text.valence, 0.6],
    [modeVal, 0.3 * aw * modeKnown],
    [photo ? photo.brightness * 0.6 + photo.saturation * 0.4 : 0, photo ? 0.2 : 0],
  );
  const arousal = wavg(
    [text.arousal, 0.45],
    [audio?.energy ?? 0, 0.3 * aw],
    [tempoNorm(audio?.bpm ?? 100), 0.25 * aw],
    [photo?.contrast ?? 0, photo ? 0.1 : 0],
  );
  const warmth = wavg(
    [text.warmth, 0.45],
    [photo?.warmth ?? 0, photo ? 0.4 : 0],
    [modeWarm, 0.15 * aw * modeKnown],
  );
  const density = wavg(
    [text.density, 0.6],
    [Math.min((photo?.count ?? 0) / 6, 1), photo ? 0.25 : 0],
    [audio?.energy ?? 0, 0.15 * aw],
  );
  const contrast = clamp(Math.max(
    text.contrast,
    photo ? Math.abs(photo.warmth - text.warmth) * 1.2 : 0,
    audio && modeKnown ? Math.abs(modeVal - text.valence) * 0.8 * aw * modeKnown : 0,
  ));

  let mode: MoodProfile['mode'] = audio?.mode ?? 'unknown';
  if ((mode === 'major' && text.valence < 0.35) || (mode === 'minor' && text.valence > 0.7)) mode = 'mixed';

  let daypart = text.daypart;
  if (daypart === 'unknown' && photo) daypart = photo.brightness < 0.14 ? 'night' : photo.brightness > 0.6 ? 'day' : 'unknown';

  return {
    valence, arousal, warmth, density,
    tempo: audio?.bpm ?? Math.round(70 + arousal * 80),
    mode, daypart, contrast,
    motifs: text.motifs, quote: text.quote, title: text.title,
    voiceStyle: { pace: arousal < 0.38 ? 'slow' : arousal > 0.62 ? 'fast' : 'mid', warmth },
  };
}
