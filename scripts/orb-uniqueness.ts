// Тест уникальности сфер: `npm run test:orbs`.
//
// 1. 200 случайных DayEntry (текст, палитра фото, песня, createdAt) → настоящий конвейер
//    (analyzeTextFallback → buildMood → buildStyle → orbParams) → визуальные дескрипторы.
//    Каждая пара должна различаться: суммарное расстояние ≥ 1 порога (ORB_JND).
// 2. 60 дней с ОДИНАКОВЫМ текстом, фото и песней (одно настроение), разные только даты создания —
//    тоже попарно различимы (различие даёт сид).
// 3. Детерминизм: один и тот же день → одинаковые параметры.
// 4. Seed-дневник (scripts/fixtures/seed-days.json — признаки, снятые в браузере с production-сборки):
//    ≥ 4 визуально разных настроения, среди них тёмное/тяжёлое и смешанное.
//
// Пороги: палитра — средний ΔE в OKLab 0.04 (≈ 2 порога различимости цвета 0.02);
// структура — 0.15 в пространстве весов/фаз (≈ сдвиг рисунка на 1/7 периода или смена веса слоя на 15%);
// форма — 0.12 (другое число колец, наклон или амплитуда деформации).
import { readFileSync } from 'node:fs';
import { analyzeTextFallback } from '../core/analyze/text-fallback';
import { buildMood } from '../core/mood';
import { buildStyle } from '../core/style-engine';
import { orbDescriptor, orbDistance, orbMoodClass, orbParams, type OrbSource } from '../core/orb';
import type { AudioFeatures, PhotoFeatures } from '../core/types';
import { hslToHex } from '../core/color';

let fails = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; };

// Детерминированный ГПСЧ, чтобы прогон был воспроизводим
let s0 = 20261122;
const rand = () => { s0 = (s0 + 0x6d2b79f5) >>> 0; let t = s0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];

const PARTS = {
  when: ['Утром', 'Днём', 'Вечером', 'Ночью', 'На рассвете', 'После обеда', 'Поздно вечером'],
  where: ['на кухне', 'у моря', 'в метро', 'в лесу', 'на балконе', 'в офисе', 'на крыше', 'в парке', 'у окна', 'на вокзале'],
  what: ['пили чай', 'смеялись до слёз', 'сдавали проект', 'молчали', 'танцевали', 'гуляли под дождём', 'пекли пирог', 'ждали поезд', 'читали книгу', 'спорили'],
  sense: ['пахло кофе', 'шёл снег', 'светило солнце', 'дул холодный ветер', 'играла гитара', 'горели фонари', 'было тихо', 'шумела толпа', 'стоял туман', 'грел плед'],
  feel: ['было спокойно', 'было тревожно', 'стало легко', 'очень устала', 'было счастье', 'немного грустно', 'сердце колотилось', 'всё как будто оттаяло', 'было пусто', 'хотелось плакать'],
  turn: ['но', 'хотя', 'а потом', 'и всё же', 'зато'],
} as const;

function randomText() {
  const n = 1 + Math.floor(rand() * 4);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const s = `${pick(PARTS.when)} ${pick(PARTS.where)} ${pick(PARTS.what)}, ${pick(PARTS.sense)}`;
    out.push(rand() < 0.4 ? `${s}, ${pick(PARTS.turn)} ${pick(PARTS.feel)}.` : `${s}. ${pick(PARTS.feel)[0].toUpperCase()}${pick(PARTS.feel).slice(1)}.`);
  }
  return out.join(' ');
}

function randomPhoto(): PhotoFeatures {
  const count = 1 + Math.floor(rand() * 6);
  const baseHue = rand() * 360;
  const palette = Array.from({ length: 5 }, () => ({
    hex: hslToHex([baseHue + (rand() - 0.5) * 160, 0.15 + rand() * 0.7, 0.12 + rand() * 0.75]),
    weight: rand(),
  })).sort((a, b) => b.weight - a.weight);
  const sum = palette.reduce((s, p) => s + p.weight, 0);
  palette.forEach((p) => { p.weight /= sum; });
  return { palette, brightness: rand(), contrast: rand(), saturation: rand(), warmth: rand(), count };
}

function randomAudio(): AudioFeatures | undefined {
  if (rand() < 0.1) return undefined;
  const source = rand() < 0.75 ? 'audio' : 'meta';
  return {
    source, bpm: Math.round(60 + rand() * 120), energy: rand(), brightness: rand(),
    mode: pick(['major', 'minor', 'unknown'] as const), confidence: source === 'audio' ? 0.6 + rand() * 0.4 : 0.3,
  };
}

function makeSource(text: string, photo: PhotoFeatures, audio: AudioFeatures | undefined, createdAt: number): OrbSource {
  const tf = analyzeTextFallback(text);
  const mood = buildMood(tf, photo, audio);
  const { tokens } = buildStyle({ mood, text: tf, photo, audio });
  return { text, createdAt, mood, tokens, photo, audio };
}

function pairwise(sources: OrbSource[], label: string) {
  const desc = sources.map((s) => orbDescriptor(orbParams(s)));
  let min = { total: Infinity, palette: 0, structure: 0, shape: 0 }, minPair = [0, 0];
  let below = 0, pairs = 0;
  const aspect = { palette: 0, structure: 0, shape: 0 };
  for (let i = 0; i < desc.length; i++) for (let j = i + 1; j < desc.length; j++) {
    const d = orbDistance(desc[i], desc[j]);
    pairs++;
    if (d.total < 1) below++;
    if (d.palette >= 0.04) aspect.palette++;
    if (d.structure >= 0.15) aspect.structure++;
    if (d.shape >= 0.12) aspect.shape++;
    if (d.total < min.total) { min = d; minPair = [i, j]; }
  }
  const pc = (n: number) => `${((n / pairs) * 100).toFixed(1)}%`;
  console.log(`  ${label}: ${pairs} пар; минимум ${min.total.toFixed(2)} порога (палитра ${min.palette.toFixed(3)}, структура ${min.structure.toFixed(3)}, форма ${min.shape.toFixed(3)}) — пара #${minPair[0]}/#${minPair[1]}`);
  console.log(`  пар, различных по палитре ${pc(aspect.palette)}, по структуре ${pc(aspect.structure)}, по форме ${pc(aspect.shape)}`);
  return below;
}

// 1. 200 случайных дней
console.log('\n1. 200 случайных дней');
const randomDays = Array.from({ length: 200 }, () => makeSource(randomText(), randomPhoto(), randomAudio(), Date.UTC(2026, 0, 1) + Math.floor(rand() * 330 * 864e5)));
ok(pairwise(randomDays, 'случайные') === 0, 'все пары различаются выше порога');

// 2. одно настроение, разные дни
console.log('\n2. Один текст, одни фото и песня, разные даты создания (60 дней)');
const text = 'Утром проснулась рано, за окном первый снег. Холодно, но дома тёплое какао и плед.';
const photo = randomPhoto(), audio = randomAudio();
const same = Array.from({ length: 60 }, (_, i) => makeSource(text, photo, audio, Date.UTC(2026, 10, 1) + i * 3_600_000 + 1));
ok(pairwise(same, 'одно настроение') === 0, 'дни с одинаковым настроением всё равно различаются');

// 3. детерминизм
console.log('\n3. Детерминизм');
const a = orbParams(randomDays[7]), b = orbParams({ ...randomDays[7] });
ok(JSON.stringify(a) === JSON.stringify(b), 'один день → одни и те же параметры');

// 4. seed-дневник
console.log('\n4. Seed-дневник (признаки сняты в браузере)');
type SeedDump = { title: string; text: string; createdAt: number; mood: OrbSource['mood']; tokens: OrbSource['tokens']; photoFeatures?: PhotoFeatures; audio?: AudioFeatures; meta?: OrbSource['meta'] }[];
const seed: SeedDump = JSON.parse(readFileSync(new URL('./fixtures/seed-days.json', import.meta.url), 'utf8'));
const classes = seed.map((d) => {
  const p = orbParams({ text: d.text, createdAt: d.createdAt, mood: d.mood, tokens: d.tokens, photo: d.photoFeatures, audio: d.audio, meta: d.meta });
  const c = orbMoodClass(p);
  console.log(`  ${d.title.padEnd(34)} ${c.key.padEnd(22)} темнота ${p.depth.toFixed(2)}, противоречие ${d.mood.contrast.toFixed(2)}`);
  return c;
});
const distinct = new Set(classes.map((c) => c.key));
ok(distinct.size >= 4, `визуально разных настроений: ${distinct.size} (нужно ≥ 4)`);
ok(classes.some((c) => c.tone === 'dark'), 'есть тёмное/тяжёлое');
ok(classes.some((c) => c.temp === 'mixed'), 'есть смешанное (холодная оболочка + тёплое ядро или наоборот)');

console.log(fails ? `\n✗ провалено проверок: ${fails}` : '\n✓ все проверки пройдены');
process.exit(fails ? 1 : 0);
