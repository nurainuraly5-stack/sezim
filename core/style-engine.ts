// Style Engine: MoodProfile + признаки → StyleTokens + explain[].
// Чистые детерминированные функции. Никаких словарей «эмоция = цвет»:
// палитра берётся из фото и трансформируется музыкой; без фото — из непрерывной оси температуры.
import type { AudioFeatures, MoodProfile, PhotoFeatures, SongMeta, StyleTokens, TechniqueId, TextFeatures } from './types';
import {
  adjust, clamp, hexToHsl, hslToHex, lerp, luminance, mix, shiftTemperature, temperature,
} from './color';
import { metaGenreGuess } from './analyze/song-link';

export const TECHNIQUES: Record<TechniqueId, { name: string; ref: string }> = {
  softStrokes: { name: 'Soft Strokes', ref: 'импрессионизм: мазки и мягкий свет' },
  geometric: { name: 'Geometric Tension', ref: 'Кандинский: линии, пятна, жёсткая сетка' },
  filmNight: { name: 'Film Grain Night', ref: 'плёночная фотография: зерно, виньетка, ореолы' },
  ma: { name: 'Ma / Quiet Minimal', ref: 'японское «ма»: пустота как содержание' },
  collage: { name: 'Collage', ref: 'коллаж: много кадров, плотная память' },
};

export type EngineInput = {
  mood: MoodProfile; text: TextFeatures; photo?: PhotoFeatures; audio?: AudioFeatures; meta?: SongMeta;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const modeRu = (m: string) => (m === 'major' ? 'мажор' : m === 'minor' ? 'минор' : m === 'mixed' ? 'смешанный лад' : 'лад не определён');
const fmt = (n: number) => n.toFixed(1).replace('.', ',');

/** Условия включения техник — явные, со списком причин для «Почему». */
export function scoreTechniques({ mood, text, photo, audio }: EngineInput) {
  const dark = photo ? 1 - photo.brightness : mood.daypart === 'night' ? 0.7 : 0.4;
  const nightish = mood.daypart === 'night' ? 1 : mood.daypart === 'dusk' ? 0.6 : 0;
  const fast = mood.tempo > 120 ? 1 : 0;
  const few = text.wordCount < 16 ? 1 : text.wordCount < 28 ? 0.4 : 0;
  const many = (photo?.count ?? 0) >= 4 ? 1 : 0;
  const s: Record<TechniqueId, { score: number; why: string[] }> = {
    softStrokes: {
      score: (1 - mood.arousal) * 0.4 + mood.valence * 0.5 + mood.warmth * 0.4 + (mood.daypart !== 'night' ? 0.1 : 0),
      why: [`спокойный день (возбуждение ${pct(mood.arousal)})`, `светлое настроение (${pct(mood.valence)})`, mood.warmth > 0.55 ? `тёплая температура (${pct(mood.warmth)})` : ''],
    },
    geometric: {
      score: mood.arousal * 0.75 + mood.density * 0.35 + fast * 0.2 + (audio?.energy ?? 0) * 0.15,
      why: [`высокое возбуждение (${pct(mood.arousal)})`, `плотный текст (${pct(mood.density)})`, fast ? `быстрый темп ~${mood.tempo} BPM` : ''],
    },
    filmNight: {
      score: nightish * 0.55 + dark * 0.35 + (mood.mode === 'minor' ? 0.15 : 0) + (1 - mood.valence) * 0.15,
      why: [nightish ? (mood.daypart === 'night' ? 'в тексте ночь' : 'в тексте вечер') : '', photo ? `тёмные фото (яркость ${pct(photo.brightness)})` : '', mood.mode === 'minor' ? 'минорный лад' : ''],
    },
    ma: {
      score: (1 - mood.density) * 0.45 + few * 0.45 + (1 - mood.arousal) * 0.2 - (photo && photo.count > 2 ? 0.2 : 0),
      why: [few >= 0.4 ? `мало слов (${text.wordCount})` : '', `разреженный день (плотность ${pct(mood.density)})`, mood.arousal < 0.4 ? 'тихий темп жизни' : ''],
    },
    collage: {
      score: many * 0.55 + mood.density * 0.45 + Math.min((photo?.count ?? 0) / 8, 0.3),
      why: [photo ? `${photo.count} фото` : '', `высокая плотность событий (${pct(mood.density)})`],
    },
  };
  return s;
}

export function chooseTechnique(input: EngineInput): { id: TechniqueId; why: string[] } {
  const s = scoreTechniques(input);
  let best: TechniqueId = 'softStrokes';
  for (const k of Object.keys(s) as TechniqueId[]) if (s[k].score > s[best].score) best = k;
  return { id: best, why: s[best].why.filter(Boolean) };
}

/** Палитра без фото: непрерывная ось температуры, а не словарь эмоций. */
function syntheticPalette(mood: MoodProfile): string[] {
  const hue = lerp(220, 26, mood.warmth);
  const sat = lerp(0.25, 0.75, mood.arousal);
  const light = lerp(0.32, 0.62, mood.valence);
  const comp = hue + 140 + mood.contrast * 40;
  return [
    hslToHex([hue + 10, sat * 0.6, 0.1]),
    hslToHex([hue, sat * 0.8, light * 0.6]),
    hslToHex([hue - 12, sat, light]),
    hslToHex([comp, sat * (0.4 + mood.contrast * 0.6), lerp(0.45, 0.7, mood.valence)]),
    hslToHex([hue - 20, sat * 0.5, Math.min(0.92, light + 0.3)]),
  ];
}

function byLum(a: string[]) { return [...a].sort((x, y) => luminance(x) - luminance(y)); }

function closestByTemp(cands: string[], t: number) {
  return cands.reduce((best, c) => (Math.abs(temperature(c) - t) < Math.abs(temperature(best) - t) ? c : best), cands[0]);
}

export function buildStyle(input: EngineInput): { tokens: StyleTokens; explain: string[] } {
  const { mood, text, photo, audio, meta } = input;
  const technique = chooseTechnique(input);
  const energy = audio?.energy ?? mood.arousal;
  const conf = audio ? (audio.source === 'meta' ? 0.4 : 1) : 0;

  // 1. Базовая палитра
  let base = photo ? photo.palette.slice(0, 5).map((p) => p.hex) : syntheticPalette(mood);
  while (base.length < 5) base.push(mix(base[0], base[base.length - 1], 0.5 + base.length * 0.1));

  // 2. Музыка трансформирует: лад → тёплая/холодная доля, энергия → насыщенность, яркость звука → светлота
  const modeShift = audio && audio.mode !== 'unknown' ? 0.22 * conf : 0;
  base = base.map((c, i) => {
    let x = modeShift ? shiftTemperature(c, audio!.mode === 'major', modeShift * (i % 2 ? 1 : 0.6)) : c;
    x = adjust(x, { sat: 0.7 + energy * 0.6, light: ((audio?.brightness ?? 0.5) - 0.5) * 0.12 * conf });
    return x;
  });
  // тёмные ночные тона
  if (technique.id === 'filmNight') base = base.map((c, i) => (i < 2 ? adjust(c, { light: -0.08 }) : c));
  const palette = byLum(base);

  // 3. Сфера: оболочка — «внешняя» температура (фото/холодные детали), ядро — «внутренняя» (тёплые детали)
  let outerT = photo ? photo.warmth : mood.warmth;
  if (text.coldMotifs.length) outerT = Math.min(outerT, 0.32);
  let innerT = text.warmMotifs.length ? Math.max(text.warmth, 0.72) : mood.warmth;
  if (Math.abs(innerT - outerT) < 0.08) innerT = clamp(outerT + (mood.valence - 0.5) * 0.3);
  const usable = palette.slice(1);
  let rim = closestByTemp(usable, outerT);
  let core = closestByTemp(usable, innerT);
  const coreGap = innerT - temperature(core);
  if (Math.abs(coreGap) > 0.12) core = shiftTemperature(core, coreGap > 0, Math.min(1, Math.abs(coreGap) * 1.6));
  const rimGap = outerT - temperature(rim);
  if (Math.abs(rimGap) > 0.12) rim = shiftTemperature(rim, rimGap > 0, Math.min(1, Math.abs(rimGap) * 1.6));
  core = adjust(core, { sat: 1.15, light: 0.12 });
  rim = adjust(rim, { sat: 1.1, light: 0.05 });
  // при низком противоречии ядро и оболочка сближаются
  core = mix(rim, core, clamp(0.35 + mood.contrast));
  // температура видна только при насыщенности: чем дальше слой от нейтрали, тем насыщеннее он должен быть
  // (иначе «тёплое ядро» серых фото остаётся серым и смешанное состояние не читается)
  const minSat = (t: number) => clamp(Math.abs(t - 0.5) * 1.1 + mood.contrast * 0.25, 0, 0.7);
  // защита от слишком тёмных цветов слоёв (тяжесть дня передаёт затемнение сферы, а не грязный цвет)
  const [ch, cs, cl] = hexToHsl(core); core = hslToHex([ch, Math.max(cs, minSat(innerT)), Math.max(cl, 0.5)]);
  const [rh, rs, rl] = hexToHsl(rim); rim = hslToHex([rh, Math.max(rs, minSat(outerT)), Math.max(rl, 0.38)]);

  // 4. Числовые токены
  const year = meta?.year;
  const genre = meta?.genre || metaGenreGuess(meta);
  const old = year && year < 1990 ? clamp((1990 - year) / 40) : 0;
  const grain = clamp(0.1 + energy * 0.28 + (technique.id === 'filmNight' ? 0.28 : 0) + old * 0.25 + (photo ? (1 - photo.brightness) * 0.08 : 0));
  const sharpness = clamp(0.15 + energy * 0.6 + mood.arousal * 0.25);
  const brush = technique.id === 'softStrokes' ? clamp(0.45 + (1 - mood.arousal) * 0.5) : clamp((1 - sharpness) * 0.45);
  const duotoneBase: Record<TechniqueId, number> = { softStrokes: 0.08, geometric: 0.3, filmNight: 0.22, ma: 0.58, collage: 0.28 };
  const duotone = clamp(duotoneBase[technique.id] + (mood.mode === 'minor' ? 0.1 : 0) + (1 - mood.valence) * 0.12);
  const rhythm = Math.round(clamp((8 * 60) / mood.tempo, 2.5, 9) * 10) / 10;
  const typeWeight = Math.round((300 + mood.arousal * 400) / 100) * 100;
  const easing = mood.arousal > 0.6 ? 'cubic-bezier(.7,0,.3,1)' : mood.valence > 0.5 ? 'cubic-bezier(.22,1,.36,1)' : 'cubic-bezier(.45,0,.55,1)';
  const breath = Math.round((mood.tempo / 60 / 4) * 100) / 100; // один вдох на такт (4 доли)

  const tokens: StyleTokens = {
    palette, technique: technique.id, grain, brush, duotone, sharpness, rhythm, typeWeight,
    motion: { speed: Math.round((mood.tempo / 100) * (0.7 + mood.arousal * 0.6) * 100) / 100, easing },
    orb: { core, rim, glow: clamp(0.35 + mood.valence * 0.4 + energy * 0.25), breath },
  };

  // 5. explain[] — «Почему так выглядит»
  const explain: string[] = [];
  explain.push(`${TECHNIQUES[technique.id].name} (${TECHNIQUES[technique.id].ref}): ${technique.why.slice(0, 3).join(', ') || 'нейтральный день'}.`);
  if (audio?.source === 'audio') {
    explain.push(`Песня: ~${audio.bpm} BPM, ${modeRu(audio.mode)}${audio.key ? ` (${audio.key})` : ''} — анализ файла → сфера делает вдох раз в ${fmt(1 / breath)} с, кадры меняются каждые ${fmt(rhythm)} с.`);
  } else if (audio?.source === 'meta') {
    explain.push(`Песня по ссылке: темп ~${audio.bpm} и ${modeRu(audio.mode)} — оценка по названию${genre ? ` и жанру (${genre})` : ''}, не анализ аудио → ритм кадров ${fmt(rhythm)} с.`);
  } else if (audio?.source === 'manual') {
    explain.push(`Темп ${audio.bpm} BPM и ${modeRu(audio.mode)} заданы вручную → ритм кадров ${fmt(rhythm)} с.`);
  } else {
    explain.push(`Песни нет — темп выведен из текста (~${mood.tempo} BPM) → ритм кадров ${fmt(rhythm)} с.`);
  }
  if (photo) {
    const dom = photo.palette[0];
    explain.push(`Палитра — из ${photo.count} фото (доминирует ${dom.hex}, ${pct(dom.weight)})${modeShift ? `; ${audio!.mode === 'major' ? 'мажор сдвинул её в тепло' : 'минор охладил её'}` : ''}.`);
  } else {
    explain.push(`Фото нет — палитра построена по оси температуры текста (${pct(mood.warmth)} тепла)${modeShift ? ` и ${audio!.mode === 'major' ? 'согрета мажором' : 'охлаждена минором'}` : ''}.`);
  }
  if (mood.contrast > 0.35) {
    const outer = text.coldMotifs[0] ? `«${text.coldMotifs[0]}»` : photo ? 'фото' : 'текст';
    const inner = text.warmMotifs[0] ? `«${text.warmMotifs[0]}»` : 'настроение';
    explain.push(`Смешанное состояние (${pct(mood.contrast)}): холодная оболочка — ${outer}, тёплое ядро — ${inner}.`);
  } else {
    explain.push(`Сфера почти однородна: противоречий в дне мало (${pct(mood.contrast)}).`);
  }
  explain.push(`Энергия ${pct(energy)} → зерно ${pct(grain)}, резкость ${pct(sharpness)}${old ? `, плёночная фактура эпохи (${year})` : ''}.`);

  return { tokens, explain: explain.slice(0, 5) };
}
