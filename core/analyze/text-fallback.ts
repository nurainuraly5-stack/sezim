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

// Не детали дня: дата («8 ноября» — не холод) и обращение к дневнику («Дорогой дневник» — не дорога).
const NOT_DETAIL = /\d+\s*(январ|феврал|март|апрел|ма[йяе]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-яё]*|дорог(ой|ая|ие)\s+дневник[а-яё]*/gi;
const stripNonDetails = (text: string) => text.replace(NOT_DETAIL, ' ');

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

// Название без LLM — только слова самого текста (никаких шаблонов и словарей «настроение → фраза»), всегда 3–7 слов.
// 1) Смешанный день (противоречие ≥ 0.4) с холодной и тёплой фразой «прилагательное + существительное»:
//    «первый снег» + «тёплое какао» → «Первый снег и тёплое какао».
// 2) Иначе — лучшая клауза текста (между знаками препинания) длиной 3–7 слов: сенсорные/тёплые/холодные детали
//    и такие фразы — плюс, служебное начало («потом», «и», «но») срезается.
// 3) Иначе — отрезок вокруг первой детали, добранный до 3 слов соседними словами текста.
// 4) Текст короче трёх слов — его слова + честное «— запись дня» («Тихо, чай — запись дня»).
const ADJ_END = /(ый|ий|ой|ая|яя|ое|ее|ые|ие|ую|юю|ого|его|ом|ем)$/;
const NOT_ADJ = new Set(['какой', 'такой', 'другой', 'мой', 'твой', 'свой', 'этой', 'какая', 'такая', 'другая', 'моя', 'твоя', 'своя',
  'все', 'всё', 'самый', 'каждый', 'любой', 'весь', 'всем', 'потом', 'домой', 'порой', 'вдвоем', 'втроем', 'целое', 'другие', 'такие', 'какие',
  'свои', 'мои', 'твои', 'его', 'нее', 'нем', 'ней', 'чем', 'тем', 'всем', 'одном', 'этом', 'том', 'всего', 'ничего', 'чего', 'того', 'сегодня']);
const FUNC = new Set(['и', 'а', 'но', 'в', 'во', 'на', 'с', 'со', 'к', 'ко', 'по', 'за', 'из', 'от', 'до', 'у', 'о', 'об', 'для', 'при', 'под',
  'над', 'про', 'что', 'как', 'так', 'же', 'ли', 'бы', 'не', 'ни', 'было', 'был', 'была', 'были', 'это', 'то', 'всё', 'все', 'еще', 'ещё', 'уже']);
// срезаем в начале только союзы и вводные слова — предлоги («в голове шум») остаются
const LEAD = new Set([...STOP, 'и', 'а', 'но', 'да', 'зато', 'однако', 'хотя', 'вот', 'ну', 'тогда', 'затем', 'наконец', 'ещё', 'еще', 'уже',
  'что', 'ведь', 'чтобы', 'если', 'пока']);
const DETAIL = [...LEX.sensory, ...LEX.warm, ...LEX.cold];
const wc = (s: string) => s.split(/\s+/).filter(Boolean).length;
const hasStem = (s: string, stems: string[]) => countHits(norm(s), stems) > 0;

/** Фразы «прилагательное + существительное» в исходной форме (как в тексте). */
function adjPhrases(text: string): string[] {
  const out: string[] = [];
  for (const clause of text.split(/[.,;:!?…—–()\n]+/)) {
    const w = clause.trim().split(/\s+/).map((x) => x.replace(/[«»"“”]/g, '')).filter(Boolean);
    for (let i = 0; i + 1 < w.length; i++) {
      const a = norm(w[i]), b = norm(w[i + 1]);
      if (a.length < 4 || !ADJ_END.test(a) || NOT_ADJ.has(a) || FUNC.has(b) || b.length < 3) continue;
      if (ADJ_END.test(b) && !/(ие|ое|ее)$/.test(b)) continue; // два прилагательных подряд — берём со следующего
      if (/(л|ла|ли|ло|ть|ся|сь)$/.test(b)) continue;        // «первая проснулась» — не фраза
      out.push(`${w[i]} ${w[i + 1]}`.toLowerCase());
    }
  }
  return uniq(out);
}

/** Привести к 3–7 словам: срезать служебное начало/конец, добрать словами текста. */
function fit(words: string[], pool: string[]): string[] {
  let w = [...words];
  while (w.length > 3 && LEAD.has(norm(w[0]))) w.shift();
  if (w.length > 7) w = w.slice(0, 7);
  while (w.length > 3 && FUNC.has(norm(w[w.length - 1]))) w.pop();
  for (const p of pool) { if (w.length >= 3) break; if (!w.some((x) => norm(x) === norm(p))) w.push(p); }
  return w;
}

export function fallbackTitle(text: string, contrast = 0): string {
  const phrases = adjPhrases(text);
  const cold = phrases.find((p) => hasStem(p, LEX.cold) && !hasStem(p, LEX.warm));
  const warm = phrases.find((p) => hasStem(p, LEX.warm) && !hasStem(p, LEX.cold));
  if (contrast >= 0.4 && cold && warm) return cap(`${cold} и ${warm}`);

  const clauses = splitSentences(text).flatMap((s) => s.split(/[,;:—–(]/)).map((c) => clean(c)).filter(Boolean)
    .map((c) => fit(c.split(/\s+/), []).join(' '));
  const score = (c: string) => countHits(norm(c), DETAIL) * 2 + (phrases.some((p) => norm(c).includes(norm(p))) ? 1.5 : 0)
    - Math.abs(wc(c) - 4.5) * 0.25;
  const fits = clauses.filter((c) => wc(c) >= 3 && wc(c) <= 7);
  if (fits.length) return cap(fits.reduce((b, c) => (score(c) > score(b) ? c : b)).toLowerCase());

  // короткий или без пунктуации текст: отрезок вокруг первой детали, добранный словами текста
  const all = clean(text.replace(/[.!?…,;:—–]+/g, ' ')).split(/\s+/).filter(Boolean);
  const distinct = uniq(all.map(norm));
  if (distinct.length < 3) {
    // слов на название не хватает — не выдумываем, а честно помечаем
    const own = uniq(all.map((w) => w.toLowerCase())).slice(0, 2).join(', ');
    return own ? cap(`${own} — запись дня`) : 'Запись дня без слов';
  }
  let at = all.findIndex((w) => hasStem(w, DETAIL));
  if (at < 0) at = 0;
  const start = Math.max(0, Math.min(at - 2, all.length - 5));
  const pool = uniq([...all.filter((w) => !FUNC.has(norm(w))), ...all]);
  return cap(fit(all.slice(start, start + 5), pool).join(' ').toLowerCase());
}

export function analyzeTextFallback(text: string): TextFeatures {
  const detail = stripNonDetails(text); // для маркеров и деталей; название и цитата — из исходного текста
  const tn = norm(detail);
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

  // плотность событий: и сколько их (абсолютно), и как часто они идут (событий на слово) — короткая запись,
  // набитая действиями («прыгали, кричали, танцевали»), плотная, хотя слов в ней мало; объём записи — отдельный признак
  const eventRate = events / Math.max(wordCount, 1);
  const density = clamp(0.4 * Math.min(events / 10, 1) + 0.35 * Math.min(eventRate / 0.25, 1)
    + 0.1 * Math.min(wordCount / 160, 1) + 0.15 * Math.min(commas / Math.max(1, sentences.length) / 3, 1));
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

  const warmMotifs = uniq(wordsWith(detail, LEX.warm)).slice(0, 4);
  const coldMotifs = uniq(wordsWith(detail, LEX.cold)).slice(0, 4);
  let motifs = uniq([...wordsWith(detail, LEX.sensory), ...warmMotifs, ...coldMotifs]).slice(0, 6);
  if (motifs.length < 3) {
    const extra = uniq(words.map((w) => norm(clean(w))).filter((w) => w.length > 5 && !STOP.has(w)))
      .sort((a, b) => b.length - a.length);
    motifs = uniq([...motifs, ...extra]).slice(0, Math.max(3, motifs.length));
  }

  const ranked = [...sentences].sort((a, b) => scoreSentence(b) - scoreSentence(a));
  const bestSentence = ranked[0] || text || 'Тихий день';
  const qWords = clean(bestSentence).split(/\s+/);
  const quote = cap(qWords.length > 14 ? qWords.slice(0, 14).join(' ') + '…' : clean(bestSentence));
  const title = fallbackTitle(text, contrast);

  return {
    valence, arousal, warmth, density, daypart, contrast,
    motifs, quote, title,
    voiceStyle: { pace: arousal < 0.38 ? 'slow' : arousal > 0.62 ? 'fast' : 'mid', warmth },
    warmMotifs, coldMotifs, wordCount, engine: 'fallback',
  };
}
