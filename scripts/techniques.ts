// Таблица выбора техники по демо-дням: `npm run table:techniques` (с ответами LLM из фикстуры) или `-- --fallback`
// (упрощённый анализ текста). Входы — scripts/fixtures/seed-v2-features.json: текст, ответ модели, признаки фото и
// песни, снятые с production. Считает настоящим кодом: mergeText → buildMood → scoreTechniques / chooseTechnique.
import fs from 'node:fs';
import { analyzeTextFallback } from '../core/analyze/text-fallback';
import { mergeText, type LlmTextFeatures } from '../core/analyze/merge-text';
import { buildMood } from '../core/mood';
import { chooseTechnique, scoreTechniques, TECHNIQUES } from '../core/style-engine';
import type { AudioFeatures, PhotoFeatures, SongMeta, TechniqueId } from '../core/types';

type FixDay = { id: string; text: string; llm: LlmTextFeatures | null; photo?: PhotoFeatures; audio?: AudioFeatures; meta?: SongMeta };
const fix = JSON.parse(fs.readFileSync(new URL('./fixtures/seed-v2-features.json', import.meta.url), 'utf8')) as { days: FixDay[] };
const useLlm = !process.argv.includes('--fallback');
const IDS = Object.keys(TECHNIQUES) as TechniqueId[];
const short: Record<TechniqueId, string> = { softStrokes: 'Soft', geometric: 'Geom', filmNight: 'Film', ma: 'Ma', collage: 'Coll' };

console.log(`Анализ текста: ${useLlm ? 'LLM (ответы из фикстуры)' : 'упрощённый'}\n`);
console.log(`| день | ${IDS.map((k) => short[k]).join(' | ')} | техника | причины |`);
console.log(`|---|${IDS.map(() => '---:').join('|')}|---|---|`);
const picked = new Set<TechniqueId>();
for (const d of fix.days) {
  const text = mergeText(analyzeTextFallback(d.text), useLlm ? d.llm : null);
  const mood = buildMood(text, d.photo, d.audio);
  const input = { mood, text, photo: d.photo, audio: d.audio, meta: d.meta };
  const s = scoreTechniques(input);
  const t = chooseTechnique(input);
  picked.add(t.id);
  const cells = IDS.map((k) => (k === t.id ? `**${s[k].score.toFixed(2)}**` : s[k].score.toFixed(2)));
  console.log(`| ${d.id.replace('seed-v2-', '')} | ${cells.join(' | ')} | ${TECHNIQUES[t.id].name} | ${t.why.slice(0, 3).join('; ')} |`);
}
console.log(`\nразных техник: ${picked.size} из 5`);
