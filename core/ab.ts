// A/B: тот же текст и те же фото, другая песня. Обе версии считаются заново одним и тем же движком
// (buildMood → buildStyle → orbParams), поэтому всё различие между ними — от музыки. Чистые функции.
import type { AudioFeatures, MoodProfile, PhotoFeatures, SongMeta, StyleTokens, TextFeatures } from './types';
import { buildMood } from './mood';
import { buildStyle, chooseTechnique, TECHNIQUES } from './style-engine';
import { orbParams, type OrbParams } from './orb';

export type Variant = {
  mood: MoodProfile; tokens: StyleTokens; explain: string[]; orb: OrbParams;
  audio?: AudioFeatures; meta?: SongMeta;
  /** причины выбора техники — для объяснения, почему она сменилась */
  techniqueWhy: string[];
};

export function computeVariant(
  src: { text: string; createdAt: number; textFeatures: TextFeatures; photo?: PhotoFeatures },
  audio?: AudioFeatures, meta?: SongMeta,
): Variant {
  const { textFeatures: text, photo } = src;
  const mood = buildMood(text, photo, audio);
  const input = { mood, text, photo, audio, meta };
  const { tokens, explain } = buildStyle(input);
  const orb = orbParams({ text: src.text, createdAt: src.createdAt, mood, tokens, photo, audio, meta });
  return { mood, tokens, explain, orb, audio, meta, techniqueWhy: chooseTechnique(input).why };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (v: number) => `${v.toFixed(1).replace('.', ',')} с`;
const modeRu = (m?: string) => (m === 'major' ? 'мажор' : m === 'minor' ? 'минор' : m === 'mixed' ? 'смешанный лад' : 'лад не ясен');
const arrow = (a: string, b: string) => (a === b ? a : `${a} → ${b}`);

/** 3–5 строк «что изменила музыка» — из реальных чисел двух версий, по правилам движка. */
export function musicDiff(a: Variant, b: Variant): string[] {
  const out: string[] = [];
  const ta = a.mood.tempo, tb = b.mood.tempo;
  // темп → ритм кадров (8 долей на кадр) и дыхание сферы (вдох на такт)
  out.push(Math.abs(ta - tb) < 3
    ? `Темп почти тот же (~${Math.round(tb)} BPM) — ритм кадров (${sec(b.tokens.rhythm)}) и дыхание сферы не изменились.`
    : `Темп ${Math.round(ta)} → ${Math.round(tb)} BPM: кадры сцены меняются каждые ${arrow(sec(a.tokens.rhythm), sec(b.tokens.rhythm))}, сфера делает вдох раз в ${arrow(sec(1 / a.tokens.orb.breath), sec(1 / b.tokens.orb.breath))}.`);

  // лад → тёплая/холодная доля палитры и светлость
  const ma = a.audio?.mode, mb = b.audio?.mode;
  if (ma !== mb && mb && mb !== 'unknown') {
    out.push(`Лад ${modeRu(ma)} → ${modeRu(mb)}: палитру ${mb === 'major' ? 'сдвинуло в тепло' : 'охладило'}, тепло дня ${arrow(pct(a.mood.warmth), pct(b.mood.warmth))}, светлость ${arrow(pct(a.mood.valence), pct(b.mood.valence))}.`);
  } else if (ma !== mb) {
    out.push(`У новой песни лад не определён — температуру палитры задают только текст и фото (тепло ${arrow(pct(a.mood.warmth), pct(b.mood.warmth))}).`);
  } else {
    out.push(`Лад тот же (${modeRu(mb)}) — температура палитры почти не изменилась (тепло ${arrow(pct(a.mood.warmth), pct(b.mood.warmth))}).`);
  }

  // энергия → возбуждение, зерно, резкость
  const ea = a.audio?.energy ?? a.mood.arousal, eb = b.audio?.energy ?? b.mood.arousal;
  out.push(`Энергия ${arrow(pct(ea), pct(eb))}: возбуждение дня ${arrow(pct(a.mood.arousal), pct(b.mood.arousal))}, зерно ${arrow(pct(a.tokens.grain), pct(b.tokens.grain))}, резкость ${arrow(pct(a.tokens.sharpness), pct(b.tokens.sharpness))}.`);

  // техника
  if (a.tokens.technique !== b.tokens.technique) {
    out.push(`Техника сменилась: ${TECHNIQUES[a.tokens.technique].name} → ${TECHNIQUES[b.tokens.technique].name} — ${b.techniqueWhy.slice(0, 2).join(', ') || 'другой баланс признаков'}.`);
  } else {
    out.push(`Техника осталась ${TECHNIQUES[b.tokens.technique].name}: её сильнее задают текст и фото, музыка поменяла параметры внутри неё.`);
  }

  // честно о доверии к источнику
  if (b.audio?.source === 'meta') out.push('Новая песня — по ссылке: темп и лад оценены по названию, движок учитывает их с весом 40% от анализа файла.');
  else if (b.audio?.source === 'manual') out.push('Темп и лад новой песни заданы вручную, звук по ссылке не анализировался.');
  return out.slice(0, 5);
}
