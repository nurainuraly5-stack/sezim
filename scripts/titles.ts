// Тест названий без LLM: `npm run test:titles`. Название — только из слов текста и всегда 3–7 слов.
import { analyzeTextFallback } from '../core/analyze/text-fallback';
import { readFileSync } from 'node:fs';
import { SEED_DAYS, SEED_DIR } from '../lib/seed-data';
const SEED_TEXTS = SEED_DAYS.map((d) => readFileSync(new URL(`../public${SEED_DIR}/${d.dir}/text.md`, import.meta.url), 'utf8').trim());

let fails = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; };
const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\s-]/gu, ' ');
// каждое слово названия есть в тексте (кроме «и» в паре фраз и пометки «запись дня (без слов)» для текста короче 3 слов)
const fromText = (title: string, text: string) => {
  const t = new Set(norm(text).split(/\s+/));
  return norm(title).split(/\s+/).filter(Boolean).every((w) => t.has(w) || ['и', 'запись', 'дня', 'без', 'слов'].includes(w));
};

console.log('\n1. Seed-дневник');
for (const t of SEED_TEXTS) {
  const title = analyzeTextFallback(t).title;
  console.log(`  ${String(words(title)).padStart(2)} сл. «${title}»`);
  ok(words(title) >= 3 && words(title) <= 7 && fromText(title, t), `   3–7 слов, только из текста`);
}

console.log('\n2. Крайние случаи');
const EDGE = ['Устала.', 'Тихо. Чай.', 'Море', 'Просто день', 'Сегодня было хорошо',
  'утромпроснуласьипошлагулятьдолгодолгобезпробелов', 'Long walk in the rain, then hot tea at home with friends.',
  'Шли шли шли шли шли шли шли шли шли шли шли шли шли шли шли шли шли шли шли шли',
  '!!! ??? ...', 'Холодно, но тепло.', 'Первый снег, тёплое какао, но всё равно грустно.'];
for (const t of EDGE) {
  const title = analyzeTextFallback(t).title;
  console.log(`  ${String(words(title)).padStart(2)} сл. «${title}»  ← ${JSON.stringify(t).slice(0, 50)}`);
  ok(words(title) >= 3 && words(title) <= 7, '   3–7 слов');
}

console.log('\n3. 1000 случайных текстов');
let s0 = 7;
const rand = () => { s0 = (s0 * 1103515245 + 12345) >>> 0; return s0 / 4294967296; };
const POOL = ('утром днём вечером ночью на кухне у моря в метро в лесу пили горячий чай смеялись холодный ветер тёплое какао шёл снег ' +
  'горели фонари было тихо шумела толпа очень устала стало легко но хотя а потом сердце колотилось мокрый асфальт первый снег ' +
  'дедлайн проекта кофе остыл старый двор серое небо солнце садилось медленно').split(' ');
let bad = 0, notFrom = 0;
for (let i = 0; i < 1000; i++) {
  const n = 1 + Math.floor(rand() * 40);
  const t = Array.from({ length: n }, () => POOL[Math.floor(rand() * POOL.length)] + (rand() < 0.12 ? ',' : rand() < 0.1 ? '.' : '')).join(' ');
  const title = analyzeTextFallback(t).title;
  if (words(title) < 3 || words(title) > 7) { bad++; if (bad < 4) console.log(`  ✗ «${title}» ← ${t}`); }
  if (!fromText(title, t)) notFrom++;
}
ok(bad === 0, `3–7 слов: нарушений ${bad} из 1000`);
ok(notFrom === 0, `слова только из текста: нарушений ${notFrom} из 1000`);

console.log(fails ? `\n✗ провалено проверок: ${fails}` : '\n✓ все проверки пройдены');
process.exit(fails ? 1 : 0);
