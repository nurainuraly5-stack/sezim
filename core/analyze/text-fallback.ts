// Fallback-анализ текста без LLM: русские маркеры + эвристики.
// Работает всегда; результат помечается engine: 'fallback' («упрощённый анализ»).
import type { TextFeatures } from '../types';
import { clamp } from '../color';

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

// Основы слов (префиксы). Пересечения разведены вручную (печал ≠ печк, мед ≠ медлен).
const LEX = {
  pos: ['радост', 'рад ', 'счаст', 'улыб', 'смея', 'смех', 'люб', 'нежн', 'спокойн', 'уют', 'хорош', 'прекрас', 'красив',
    'весел', 'благодар', 'легк', 'ура', 'класс', 'кайф', 'восторг', 'мечт', 'обня', 'обним', 'вкусн', 'удач', 'тепло', 'светл', 'сияв', 'дом'],
  neg: ['груст', 'печал', 'тоск', 'устал', 'одинок', 'плак', 'слез', 'боль', 'болел', 'страх', 'страшн', 'тревог', 'плох', 'тяжел',
    'злю', 'злил', 'обид', 'скуч', 'пуст', 'потерял', 'разочар', 'бесит', 'бесил', 'не спал', 'ссор', 'опозд', 'промок', 'замерз'],
  hi: ['бег', 'беж', 'спеш', 'быстр', 'шум', 'громк', 'крик', 'кричал', 'танц', 'концерт', 'драйв', 'дедлайн', 'встреч', 'совещан',
    'работ', 'проект', 'сует', 'толп', 'метро', 'вокзал', 'гонк', 'нерв', 'адреналин', 'прыг', 'энерги', 'экзамен', 'сдал', 'успел',
    'опозд', 'питч', 'хакатон', 'код', 'созвон', 'дорог', 'такси', 'летел', 'самолет', 'кричал', 'фестивал', 'стадион'],
  lo: ['тих', 'тишин', 'медлен', 'спокой', 'сон ', 'спал', 'дрем', 'лен', 'неспеш', 'плед', 'книг', 'окн', 'лежал', 'отдых',
    'молч', 'смотрел', 'слушал', 'сидел', 'пустот', 'одна', 'один', 'дышал', 'чай'],
  warm: ['тепл', 'горяч', 'солн', 'какао', 'чай', 'кофе', 'плед', 'свеч', 'огон', 'огн', 'камин', 'обня', 'обним', 'печк', 'пирог',
    'выпечк', 'бабушк', 'мам', 'уют', 'кухн', 'суп', 'лето', 'летн', 'закат', 'август', 'песок', 'жар', 'корица', 'глинтвейн',
    'варенье', 'лампа', 'абрикос', 'апельсин', 'мандарин', 'хлеб'],
  cold: ['холод', 'мороз', 'снег', 'снеж', 'лед', 'ледян', 'зим', 'ветер', 'ветр', 'дожд', 'лужи', 'лужа', 'туман', 'серый', 'серая',
    'серое', 'серо', 'ноябр', 'слякот', 'иней', 'метел', 'вьюг', 'остыл', 'бетон', 'стекл', 'промок', 'замерз', 'сквозняк', 'февраль'],
  dawn: ['рассвет', 'утр', 'рано', 'проснул', 'будильн'],
  day: ['днем', 'обед', 'полдень', 'полдн', 'в обед', 'на работе', 'днем'],
  dusk: ['вечер', 'закат', 'сумерк', 'вечером'],
  night: ['ночь', 'ночн', 'ночью', 'полноч', 'звезд', 'луна', 'луну', 'фонар', 'не спал', 'темнот'],
  sensory: ['запах', 'пах', 'звук', 'свет', 'музык', 'море', 'мор', 'лес', 'парк', 'окн', 'дорог', 'река', 'реке', 'небо', 'неб',
    'кофе', 'чай', 'какао', 'дожд', 'снег', 'ветер', 'солн', 'плед', 'свеч', 'город', 'улиц', 'крыш', 'песн', 'гитар', 'фонар',
    'трамва', 'поезд', 'листь', 'трав', 'цвет', 'руки', 'ладон', 'голос', 'шум', 'пирог', 'хлеб', 'кухн', 'балкон', 'мост'],
};

const CONTRAST_MARKERS = /(^|[\s,—-])(но|хотя|зато|однако|несмотря|все-таки|всё-таки|а потом|и все же|и всё же)(?=[\s,.!?]|$)/g;
const STOP = new Set(['который', 'которая', 'потому', 'сегодня', 'кажется', 'просто', 'очень', 'всегда', 'немного', 'вообще',
  'теперь', 'только', 'сейчас', 'почему', 'когда', 'где-то', 'что-то', 'как-то', 'потом', 'после', 'перед', 'между', 'больше']);

function countHits(textN: string, stems: string[]): number {
  let n = 0;
  for (const s of stems) {
    const re = new RegExp('(^|[^а-яa-z])' + s.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    n += (textN.match(re) || []).length;
  }
  return n;
}

function wordsWith(text: string, stems: string[]): string[] {
  const out: string[] = [];
  for (const w of text.split(/[^А-Яа-яЁёA-Za-z-]+/)) {
    const wn = norm(w);
    if (wn.length < 3) continue;
    if (stems.some((s) => wn.startsWith(s.trim()))) out.push(wn);
  }
  return out;
}

const uniq = (a: string[]) => Array.from(new Set(a));

export function splitSentences(text: string): string[] {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 1);
}

function scoreSentence(s: string) {
  const sn = norm(s);
  return countHits(sn, LEX.sensory) + countHits(sn, LEX.warm) + countHits(sn, LEX.cold)
    + (sn.match(CONTRAST_MARKERS) ? 2 : 0) - Math.max(0, s.split(' ').length - 18) * 0.2;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const clean = (s: string) => s.replace(/^(но|и|а|да|зато|однако)\s+/i, '').replace(/[«»"“”]/g, '').replace(/[\s,;:—–-]+$/g, '').replace(/[.!?…]+$/g, '').trim();

export function fallbackTitle(sentence: string, motif?: string): string {
  const words = clean(sentence).split(/\s+/).filter(Boolean);
  if (words.length <= 7) return cap(words.join(' ').toLowerCase().replace(/^./, (c) => c));
  let idx = motif ? words.findIndex((w) => norm(w).startsWith(motif.slice(0, 4))) : -1;
  if (idx < 0) idx = 0;
  const start = Math.max(0, Math.min(idx - 2, words.length - 5));
  const chunk = words.slice(start, start + 5);
  return cap(clean(chunk.join(' ')).toLowerCase());
}

export function analyzeTextFallback(text: string): TextFeatures {
  const tn = norm(text);
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const sentences = splitSentences(text);

  const pos = countHits(tn, LEX.pos), neg = countHits(tn, LEX.neg);
  const hi = countHits(tn, LEX.hi), lo = countHits(tn, LEX.lo);
  const warm = countHits(tn, LEX.warm), cold = countHits(tn, LEX.cold);
  const exclam = (text.match(/!/g) || []).length;
  const markers = (tn.match(CONTRAST_MARKERS) || []).length;
  // события ≈ глаголы прошедшего времени
  const events = (tn.match(/[а-я]{3,}(л|ла|ли|ло)(?=[\s,.!?]|$)/g) || []).length;
  const commas = (text.match(/,/g) || []).length;

  const density = clamp(0.5 * Math.min(events / 12, 1) + 0.3 * Math.min(wordCount / 160, 1)
    + 0.2 * Math.min(commas / Math.max(1, sentences.length) / 3, 1));
  const valence = clamp(0.5 + ((pos - neg) / (pos + neg + 2)) * 0.5 + Math.min(exclam, 3) * 0.02);
  const arousal = clamp(0.35 + ((hi - lo) / (hi + lo + 2)) * 0.45 + Math.min(exclam, 4) * 0.04 + density * 0.15);
  const warmth = clamp(0.5 + ((warm - cold) / (warm + cold + 2)) * 0.5);
  const contrast = clamp(0.2 * Math.min(markers, 3) + (warm > 0 && cold > 0 ? 0.4 : 0) + (pos > 0 && neg > 0 ? 0.25 : 0));

  // время суток: максимум упоминаний, при равенстве — более позднее
  const dp: [TextFeatures['daypart'], number][] = [
    ['dawn', countHits(tn, LEX.dawn)], ['day', countHits(tn, LEX.day)],
    ['dusk', countHits(tn, LEX.dusk)], ['night', countHits(tn, LEX.night)],
  ];
  let daypart: TextFeatures['daypart'] = 'unknown'; let best = 0;
  for (const [k, v] of dp) if (v > 0 && v >= best) { daypart = k; best = v; }

  const warmMotifs = uniq(wordsWith(text, LEX.warm)).slice(0, 4);
  const coldMotifs = uniq(wordsWith(text, LEX.cold)).slice(0, 4);
  let motifs = uniq([...wordsWith(text, LEX.sensory), ...warmMotifs, ...coldMotifs]).slice(0, 6);
  if (motifs.length < 3) {
    const extra = uniq(words.map((w) => norm(clean(w))).filter((w) => w.length > 5 && !STOP.has(w)))
      .sort((a, b) => b.length - a.length);
    motifs = uniq([...motifs, ...extra]).slice(0, Math.max(3, motifs.length));
  }

  const ranked = [...sentences].sort((a, b) => scoreSentence(b) - scoreSentence(a));
  const bestSentence = ranked[0] || text || 'Тихий день';
  const qWords = clean(bestSentence).split(/\s+/);
  const quote = cap(qWords.length > 14 ? qWords.slice(0, 14).join(' ') + '…' : clean(bestSentence));
  const title = fallbackTitle(bestSentence, motifs[0]) || 'Тихий день';

  return {
    valence, arousal, warmth, density, daypart, contrast,
    motifs, quote, title,
    voiceStyle: { pace: arousal < 0.38 ? 'slow' : arousal > 0.62 ? 'fast' : 'mid', warmth },
    warmMotifs, coldMotifs, wordCount, engine: 'fallback',
  };
}
