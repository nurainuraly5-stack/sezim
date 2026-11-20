// Тест анализа аудио на треках с известным темпом и тональностью: `npm run test:audio`.
//
// 1. WAV-файлы (scripts/fixtures/audio, параметры песен seed-дневника): чтение файла → тот же analyzeAudioBuffer,
//    что в браузере. Темп ±2 BPM и тональность — строго, 6 из 6.
// 2. Матрица 192 синтетических треков: 12 тоник × мажор/минор × 4 тембра × 2 типа гармонии
//    (каденция I–IV–V–I и поп-петля I–V–vi–IV / i–VI–III–VII), темп 66–172, 22,05 и 44,1 кГц.
//    - каденции: тональность верна ≥ 95%;
//    - все 192: ответ честный — тональность верна, ИЛИ помечена приблизительной (≈) с верной альтернативой /
//      хотя бы помечена, ИЛИ «лад не ясен». Уверенно-неверных ответов — 0;
//    - темп верен с точностью до октавы (×2 / ÷2) — 100%; строгое совпадение печатается.
// Ограничение: всё синтетическое (CC0). На живых записях с вокалом, ударными и сведением точность ниже — не проверено.
import { readFileSync } from 'node:fs';
import { analyzeAudioBuffer, MODE_SURE } from '../core/analyze/audio';
import { AUDIO_FIXTURES, decodeWav, synthTrack, type Timbre } from './audio-synth';

let fails = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; };
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const approx = (r: { modeConfidence?: number }) => (r.modeConfidence ?? 1) < MODE_SURE;

console.log('\n1. WAV-файлы с известным темпом и тональностью');
let fileOk = 0;
for (const f of AUDIO_FIXTURES) {
  const t0 = performance.now();
  const r = await analyzeAudioBuffer(decodeWav(readFileSync(new URL(`./fixtures/audio/${f.file}`, import.meta.url))));
  const good = r.key === f.key && Math.abs(r.bpm - f.bpm) <= 2 && !approx(r);
  if (good) fileOk++;
  console.log(`  ${good ? '·' : '✗'} ${f.file.padEnd(26)} ожидалось ${f.bpm} BPM, ${f.key.padEnd(8)} → ${r.bpm} BPM, ${(r.key ?? 'лад не ясен').padEnd(8)} уверенность лада ${(r.modeConfidence ?? 0).toFixed(2)}, ${Math.round(performance.now() - t0)} мс`);
}
ok(fileOk === AUDIO_FIXTURES.length, `файлы: ${fileOk} из ${AUDIO_FIXTURES.length} (темп ±2 BPM, тональность, уверенно)`);

console.log('\n2. Матрица синтетических треков');
type Row = { n: number; key: number; flagged: number; unknown: number; wrongSure: number; tempo: number; tempoOct: number };
const rows: Record<string, Row> = {};
const wrongSure: string[] = [];
let i = 0;
for (const prog of ['cadence', 'pop'] as const) for (const timbre of ['triangle', 'saw', 'piano', 'organ'] as Timbre[]) for (const mode of ['major', 'minor'] as const) for (let pc = 0; pc < 12; pc++) {
  const bpm = [66, 78, 90, 104, 118, 128, 140, 150, 172][i++ % 9];
  const root = 48 + pc + (pc < 4 ? 12 : 0);
  const sr = i % 2 ? 22050 : 44100;
  const r = await analyzeAudioBuffer(synthTrack({ name: '', bpm, root, mode, timbre, energy: 0.3 + (i % 5) * 0.15, seconds: 10, prog, sr }));
  const want = `${NOTES[root % 12]} ${mode}`;
  const k = `${prog === 'cadence' ? 'каденция' : 'поп-петля'} ${mode === 'major' ? 'мажор' : 'минор'}`;
  const row = (rows[k] ??= { n: 0, key: 0, flagged: 0, unknown: 0, wrongSure: 0, tempo: 0, tempoOct: 0 });
  row.n++;
  if (r.key === want) row.key++;
  if (r.mode === 'unknown') row.unknown++;
  else if (approx(r)) row.flagged++;
  if (r.mode !== 'unknown' && r.key !== want && !approx(r)) { row.wrongSure++; wrongSure.push(`${k}, ${timbre}: ${want} → ${r.key}`); }
  if (Math.abs(r.bpm - bpm) <= 2) row.tempo++;
  if ([1, 2, 0.5].some((m) => Math.abs(r.bpm - bpm * m) <= 2 * m)) row.tempoOct++;
}
const total = Object.values(rows).reduce((s, r) => ({ n: s.n + r.n, key: s.key + r.key, wrongSure: s.wrongSure + r.wrongSure, tempo: s.tempo + r.tempo, tempoOct: s.tempoOct + r.tempoOct }), { n: 0, key: 0, wrongSure: 0, tempo: 0, tempoOct: 0 });
for (const [k, r] of Object.entries(rows)) {
  console.log(`  ${k.padEnd(18)} тональность ${r.key}/${r.n}, помечено «≈» ${r.flagged}, «не ясен» ${r.unknown}, уверенно-неверно ${r.wrongSure}; темп строго ${r.tempo}/${r.n}, до октавы ${r.tempoOct}/${r.n}`);
}
wrongSure.forEach((w) => console.log(`    ✗ ${w}`));
const cad = Object.entries(rows).filter(([k]) => k.startsWith('каденция')).reduce((s, [, r]) => [s[0] + r.key, s[1] + r.n], [0, 0]);
ok(cad[0] / cad[1] >= 0.95, `каденции: тональность верна ${cad[0]}/${cad[1]} (нужно ≥ 95%)`);
ok(total.wrongSure === 0, `уверенно-неверных тональностей: ${total.wrongSure} из ${total.n}`);
ok(total.tempoOct === total.n, `темп с точностью до октавы: ${total.tempoOct}/${total.n}`);
console.log(`  (строго ±2 BPM: ${total.tempo}/${total.n} — остальное ошибки в октаву: 172 → 86, 150 → 75, 140 → 70)`);

console.log(fails ? `\n✗ провалено проверок: ${fails}` : '\n✓ все проверки пройдены');
process.exit(fails ? 1 : 0);
