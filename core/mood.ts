// Признаки текста + фото + аудио → непрерывный MoodProfile. Чистая функция.
import type { AudioFeatures, MoodProfile, PhotoFeatures, TextFeatures } from './types';
import { clamp, lerp } from './color';

type W = [value: number, weight: number];
const wavg = (...xs: W[]) => {
  let s = 0, w = 0;
  for (const [v, k] of xs) { s += v * k; w += k; }
  return w ? clamp(s / w) : 0.5;
};

export const tempoNorm = (bpm: number) => clamp((bpm - 60) / 120);

/** Доверие к признакам песни: анализ файла и ручной ввод — 1; оценка по метаданным — до 0,4 и пропорционально её
 *  уверенности (жанр не распознан → почти ничего не знаем → почти не влияет, а не тянет день к «средним» 104 BPM). */
export const audioTrust = (audio?: AudioFeatures) =>
  !audio ? 0 : audio.source === 'meta' ? 0.4 * clamp(audio.confidence / 0.3) : 1;

export function buildMood(text: TextFeatures, photo?: PhotoFeatures, audio?: AudioFeatures): MoodProfile {
  const aw = audioTrust(audio);
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

  // темп дня: из текста (энергия слов и событий), песня подмешивается с весом доверия к ней — анализ файла задаёт
  // темп сам, а оценка по ссылке (вес ≤ 0,4) лишь сдвигает темп текста, а не заменяет его средними ~104 BPM
  const textTempo = 70 + arousal * 80;
  const tempo = audio ? (aw >= 1 ? audio.bpm : Math.round(lerp(textTempo, audio.bpm, aw))) : Math.round(textTempo);

  return {
    valence, arousal, warmth, density,
    tempo,
    mode, daypart, contrast,
    motifs: text.motifs, quote: text.quote, title: text.title,
    voiceStyle: { pace: arousal < 0.38 ? 'slow' : arousal > 0.62 ? 'fast' : 'mid', warmth },
  };
}
