// Выбор техники на крайних случаях и влияние текста: `npm run test:techniques`. Без сети: упрощённый анализ текста
// (детерминирован) + синтетические признаки фото и песни. Проверяет общие правила, а не конкретные дни.
import fs from 'node:fs';
import { analyzeTextFallback } from '../core/analyze/text-fallback';
import { mergeText, type LlmTextFeatures } from '../core/analyze/merge-text';
import { buildMood } from '../core/mood';
import { buildStyle, chooseTechnique, scoreTechniques, TECHNIQUES } from '../core/style-engine';
import type { AudioFeatures, PhotoFeatures, SongMeta, TechniqueId } from '../core/types';

let fails = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; };

const photo = (brightness: number, count = 1, warmth = 0.5): PhotoFeatures => ({
  palette: [{ hex: '#6a5a4a', weight: 0.5 }, { hex: '#2a2a33', weight: 0.3 }, { hex: '#c9b9a0', weight: 0.2 }],
  brightness, contrast: 0.4, saturation: 0.35, warmth, count,
});
const linkSong: AudioFeatures = { bpm: 104, energy: 0.5, brightness: 0.5, mode: 'unknown', confidence: 0.12, source: 'meta' } as AudioFeatures;

function run(text: string, p?: PhotoFeatures, a?: AudioFeatures, meta?: SongMeta) {
  const tf = analyzeTextFallback(text);
  const mood = buildMood(tf, p, a);
  const input = { mood, text: tf, photo: p, audio: a, meta };
  return { tf, mood, input, t: chooseTechnique(input), s: scoreTechniques(input), style: buildStyle(input) };
}
const name = (id: TechniqueId) => TECHNIQUES[id].name;
const seen = new Set<TechniqueId>();
function expect(label: string, r: ReturnType<typeof run>, want: TechniqueId[], not: TechniqueId[] = []) {
  seen.add(r.t.id);
  const top = Object.entries(r.s).sort((a, b) => b[1].score - a[1].score).map(([k, v]) => `${TECHNIQUES[k as TechniqueId].name.split(' ')[0]} ${v.score.toFixed(2)}`).join(', ');
  ok(want.includes(r.t.id) && !not.includes(r.t.id), `${label} → ${name(r.t.id)} (${r.t.why.join('; ')}) [${top}]`);
}

// 1. Очень короткий текст, без фото и песни — пустота «ма»
expect('очень короткий текст «Тишина. Чай.»', run('Тишина. Чай.'), ['ma']);

// 2. Очень длинный событийный текст + много фото — коллаж (плотная память), не тишина
const long = Array.from({ length: 6 }, (_, i) => [
  `Утром мы поехали на вокзал, потом бежали на электричку, успели в последний момент.`,
  `Днём гуляли по рынку, купили мандарины, встретили одноклассников, долго смеялись и фотографировались.`,
  `Потом зашли в кафе, пили горячий чай, смотрели в окно на снег, обсуждали поездку и строили планы.`,
  `Вечером ${i % 2 ? 'играли в настольные игры' : 'готовили ужин'}, пели песни под гитару, звонили бабушке.`,
].join(' ')).join(' ');
const rLong = run(long, photo(0.55, 6));
expect(`очень длинный текст (${rLong.tf.wordCount} слов) + 6 фото`, rLong, ['collage'], ['ma', 'softStrokes']);

// 3. Ночной, но энергичный: ночь и тёмный снимок не делают громкий день «тихим ночным»
const rNightLoud = run('Ночью на концерте мы прыгали, кричали, танцевали до трёх! Толпа, шум, огни, адреналин, бежали к сцене, громко пели!', photo(0.08, 1));
expect('ночной, но энергичный текст + тёмное фото', rNightLoud, ['geometric', 'collage'], ['filmNight']);

// 4. Дневной, но тихий: светло, тепло, спокойно — мягкие мазки, не напряжение
const rDayQuiet = run('Днём сидела у окна с книгой и пледом, пила тёплый чай, солнце медленно грело руки. Тихо и спокойно, хорошо.', photo(0.7, 1, 0.7));
expect('дневной, но тихий текст + светлое фото', rDayQuiet, ['softStrokes', 'ma'], ['geometric', 'filmNight']);

// 5. Тихая тяжёлая ночь — тут плёночная ночь уместна
const rNightQuiet = run('Ночью не спала, сидела одна в темноте у окна. Тоска, тишина, фонарь за стеклом, было грустно и пусто.', photo(0.1, 1, 0.3));
expect('тихая тяжёлая ночь + тёмное фото', rNightQuiet, ['filmNight']);

// 6. Напряжённый плотный день — геометрия
const rTense = run('Дедлайн! Бежал на совещание, потом созвон, нервы, проект горел, спорили, кричали, но успел сдать код за минуту до конца. Работа, такси, метро, снова работа.', photo(0.5, 1));
expect('напряжённый плотный день', rTense, ['geometric']);

ok(seen.size === 5, `достижимы все 5 техник: ${[...seen].map(name).join(', ')}`);

// --- причины не противоречат числам (на кейсах и на демо-днях из фикстуры, обоими анализами текста)
type FixDay = { id: string; text: string; llm: LlmTextFeatures | null; photo?: PhotoFeatures; audio?: AudioFeatures; meta?: SongMeta };
const fix = JSON.parse(fs.readFileSync(new URL('./fixtures/seed-v2-features.json', import.meta.url), 'utf8')) as { days: FixDay[] };
const all: string[] = [];
for (const r of [rLong, rNightLoud, rDayQuiet, rNightQuiet, rTense]) all.push(...r.style.explain);
for (const d of fix.days) for (const llm of [d.llm, null]) {
  const tf = mergeText(analyzeTextFallback(d.text), llm);
  all.push(...buildStyle({ mood: buildMood(tf, d.photo, d.audio), text: tf, photo: d.photo, audio: d.audio, meta: d.meta }).explain);
}
const bad = all.flatMap((line) => [
  ...[...line.matchAll(/спокойный день \(возбуждение (\d+)%\)/g)].filter((m) => +m[1] > 40),
  ...[...line.matchAll(/энергичный день \(возбуждение (\d+)%\)/g)].filter((m) => +m[1] < 60),
  ...[...line.matchAll(/светлое настроение \((\d+)%\)/g)].filter((m) => +m[1] < 60),
  ...[...line.matchAll(/тяжёлый день \(светлость (\d+)%\)/g)].filter((m) => +m[1] > 40),
  ...[...line.matchAll(/много событий \(плотность (\d+)%\)/g)].filter((m) => +m[1] < 60),
  ...[...line.matchAll(/мало событий \(плотность (\d+)%\)/g)].filter((m) => +m[1] > 40),
].map((m) => m[0]));
ok(bad.length === 0, `формулировки причин соответствуют числам (${all.length} строк «Почему»)${bad.length ? ': ' + bad.join(', ') : ''}`);

// --- текст реально влияет: те же фото и песня по ссылке, два разных текста
const P = photo(0.4, 2, 0.5);
const A = run('Тихое утро, лежала с книгой под пледом, пила чай, никуда не спешила. Спокойно и тепло.', P, linkSong);
const B = run('Весь день бегом: экзамен, потом тренировка, концерт, толпа, кричали и прыгали до ночи! Устала, но счастлива.', P, linkSong);
const ta = A.style.tokens, tb = B.style.tokens;
const changed = [
  ta.technique !== tb.technique && 'техника',
  ta.palette.join() !== tb.palette.join() && 'палитра',
  ta.rhythm !== tb.rhythm && 'ритм кадров',
  ta.orb.core !== tb.orb.core && 'ядро сферы',
  Math.abs(ta.grain - tb.grain) > 0.03 && 'зерно',
  Math.abs(ta.sharpness - tb.sharpness) > 0.03 && 'резкость',
].filter(Boolean);
ok(changed.length >= 4, `тот же снимок и песня по ссылке, другой текст → изменились: ${changed.join(', ')}`);
ok(Math.abs(A.mood.tempo - B.mood.tempo) >= 10, `темп дня следует за текстом при песне по ссылке: ${A.mood.tempo} → ${B.mood.tempo} BPM`);
const fileSong = { ...linkSong, source: 'audio', confidence: 1 } as AudioFeatures;
ok(run('Тихое утро с книгой.', P, fileSong).mood.tempo === 104, 'при анализе файла темп — темп песни (текст его не перебивает)');

console.log(fails ? `\n✗ провалено проверок: ${fails}` : '\n✓ все проверки пройдены');
process.exit(fails ? 1 : 0);
