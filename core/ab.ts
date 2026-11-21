// A/B: тот же текст и те же фото, другая песня. Обе версии считаются заново одним и тем же движком
// (buildMood → buildStyle → orbParams), поэтому всё различие между ними — от музыки. Чистые функции.
import type { AudioFeatures, MoodProfile, PhotoFeatures, SongMeta, StyleTokens, TextFeatures } from './types';
import { audioTrust, buildMood } from './mood';
import { lerp } from './color';
import { buildStyle, chooseTechnique, TECHNIQUES } from './style-engine';
import { orbParams, type OrbParams } from './orb';

export type Variant = {
  mood: MoodProfile; tokens: StyleTokens; explain: string[]; orb: OrbParams;
  /** признаки текста, из которых посчитана версия (для «что изменил текст») */
  text: TextFeatures;
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
  return { mood, tokens, explain, orb, audio, meta, text, techniqueWhy: chooseTechnique(input).why };
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
  // энергия, которую движок реально использовал (оценка по названию подмешивается с весом доверия)
  const used = (v: Variant) => (v.audio ? lerp(v.mood.arousal, v.audio.energy, audioTrust(v.audio)) : v.mood.arousal);
  const ea = used(a), eb = used(b);
  out.push(`Энергия ${arrow(pct(ea), pct(eb))}: возбуждение дня ${arrow(pct(a.mood.arousal), pct(b.mood.arousal))}, зерно ${arrow(pct(a.tokens.grain), pct(b.tokens.grain))}, резкость ${arrow(pct(a.tokens.sharpness), pct(b.tokens.sharpness))}.`);

  // техника
  if (a.tokens.technique !== b.tokens.technique) {
    out.push(`Техника сменилась: ${TECHNIQUES[a.tokens.technique].name} → ${TECHNIQUES[b.tokens.technique].name} — ${b.techniqueWhy.slice(0, 2).join(', ') || 'другой баланс признаков'}.`);
  } else {
    out.push(`Техника осталась ${TECHNIQUES[b.tokens.technique].name}: её сильнее задают текст и фото, музыка поменяла параметры внутри неё.`);
  }

  // честно о доверии к источнику
  if (b.audio?.source === 'meta') out.push(`Новая песня — по ссылке: темп и лад оценены по названию, движок учитывает их с весом ${pct(audioTrust(b.audio))} от анализа файла.`);
  else if (b.audio?.source === 'manual') out.push('Темп и лад новой песни заданы вручную, звук по ссылке не анализировался.');
  return out.slice(0, 5);
}

const DAYPART: Record<string, string> = { dawn: 'утро', day: 'день', dusk: 'вечер', night: 'ночь', unknown: 'не названо' };
const quoteList = (xs: string[]) => xs.slice(0, 3).map((x) => `«${x}»`).join(', ');
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

/** «Что изменил текст»: те же фото и песня, другой текст. Только из реальных чисел и слов двух версий:
 *  сначала — что поменялось в самом тексте (слова, время суток, объём, признаки), потом — что это сделало
 *  с техникой, палитрой, ритмом и сферой. Если изменений мало — так и говорит. */
export function textDiff(a: Variant, b: Variant): string[] {
  const out: string[] = [];
  const ma = a.mood, mb = b.mood, ta = a.text, tb = b.text;

  // 1. слова и время суток
  const has = (list: string[], m: string) => list.some((x) => norm(x) === norm(m));
  const added = tb.motifs.filter((m) => !has(ta.motifs, m));
  const gone = ta.motifs.filter((m) => !has(tb.motifs, m));
  const words: string[] = [];
  if (added.length) words.push(`появились ${quoteList(added)}`);
  if (gone.length) words.push(`ушли ${quoteList(gone)}`);
  if (ta.daypart !== tb.daypart) words.push(`время суток: ${DAYPART[ta.daypart]} → ${DAYPART[tb.daypart]}`);
  if (Math.abs(ta.wordCount - tb.wordCount) >= Math.max(10, ta.wordCount * 0.3)) words.push(`объём ${ta.wordCount} → ${tb.wordCount} слов`);
  out.push(words.length ? `В тексте: ${words.join('; ')}.` : 'Детали и время суток в тексте те же.');

  // 2. признаки, которые сдвинулись заметно (≥ 8 п.п.)
  const feats: [string, number, number][] = [
    ['энергия', ma.arousal, mb.arousal], ['светлость', ma.valence, mb.valence], ['тепло', ma.warmth, mb.warmth],
    ['плотность событий', ma.density, mb.density], ['противоречие', ma.contrast, mb.contrast],
  ];
  const moved = feats.filter(([, x, y]) => Math.abs(x - y) >= 0.08).sort((p, q) => Math.abs(q[2] - q[1]) - Math.abs(p[2] - p[1]));
  out.push(moved.length
    ? `Признаки дня: ${moved.map(([n, x, y]) => `${n} ${pct(x)} → ${pct(y)}`).join(', ')}.`
    : `Признаки дня почти те же (энергия ${pct(mb.arousal)}, светлость ${pct(mb.valence)}, тепло ${pct(mb.warmth)}) — тексты близки по настроению.`);

  // 3. техника
  if (a.tokens.technique !== b.tokens.technique) {
    out.push(`Техника: ${TECHNIQUES[a.tokens.technique].name} → ${TECHNIQUES[b.tokens.technique].name} — ${b.techniqueWhy.slice(0, 2).join(', ')}.`);
  } else {
    const g = arrow(pct(a.tokens.grain), pct(b.tokens.grain)), sh = arrow(pct(a.tokens.sharpness), pct(b.tokens.sharpness));
    out.push(g.includes('→') || sh.includes('→')
      ? `Техника осталась ${TECHNIQUES[b.tokens.technique].name}: текст поменял параметры внутри неё (зерно ${g}, резкость ${sh}).`
      : `Техника та же (${TECHNIQUES[b.tokens.technique].name}), и параметры внутри неё не изменились.`);
  }

  // 4. палитра тех же фото и сфера
  const dw = mb.warmth - ma.warmth;
  const samePalette = a.tokens.palette.join() === b.tokens.palette.join();
  const sameOrb = a.tokens.orb.core === b.tokens.orb.core && a.tokens.orb.rim === b.tokens.orb.rim;
  const pal = samePalette ? 'палитра та же'
    : Math.abs(dw) >= 0.03 ? `палитра тех же фото ${dw > 0 ? 'теплее' : 'холоднее'} (тепло дня ${pct(ma.warmth)} → ${pct(mb.warmth)})`
    : `палитра ${mb.arousal < ma.arousal ? 'приглушённее' : 'насыщеннее'} — насыщенность следует за энергией`;
  const orb = sameOrb ? 'цвета сферы те же'
    : mb.contrast > 0.35 ? `сфера: оболочка ${b.tokens.orb.rim}, ядро ${b.tokens.orb.core} — смешанное состояние видно внутри`
    : `сфера: ${a.tokens.orb.core} → ${b.tokens.orb.core}, почти однородная`;
  out.push(`${pal[0].toUpperCase()}${pal.slice(1)}; ${orb}.`);

  // 5. ритм
  out.push(Math.abs(ma.tempo - mb.tempo) >= 3
    ? `Темп дня ${Math.round(ma.tempo)} → ${Math.round(mb.tempo)} BPM: кадры меняются каждые ${arrow(sec(a.tokens.rhythm), sec(b.tokens.rhythm))}${a.audio?.source === 'meta' ? ' (песня по ссылке учитывается частично, остальное — энергия текста)' : ''}.`
    : `Ритм тот же (~${Math.round(mb.tempo)} BPM, кадр ${sec(b.tokens.rhythm)}): ${a.audio && a.audio.source !== 'meta' ? 'его задаёт песня' : 'энергия текстов близка'}.`);

  // мало изменений — честно
  const changes = [a.tokens.technique !== b.tokens.technique, !samePalette, !sameOrb, Math.abs(ma.tempo - mb.tempo) >= 3, moved.length > 0].filter(Boolean).length;
  if (changes <= 1) out.unshift('Изменений мало: по энергии, теплу и плотности тексты почти одинаковы, а фото и песня те же.');
  // разные анализаторы — часть различий от них, а не от смысла текста
  if (ta.engine !== tb.engine) out.push(`Версии посчитаны разными анализаторами (${ta.engine === 'llm' ? 'LLM' : 'упрощённый'} и ${tb.engine === 'llm' ? 'LLM' : 'упрощённый'}) — часть различий от этого.`);
  return out;
}
