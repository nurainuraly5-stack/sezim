// Контракт LLM-анализа без ключа и сети: `npm run test:llm`.
// Настоящий lib/server/llm.ts + настоящий Anthropic SDK, но API — локальный mock (scripts/llm-mock.ts).
// Проверяет: валидный ответ проходит zod; значения вне 0..1 обрезаются; нарушение схемы / битый JSON / отказ /
// 401 / 429 / 500 → { ok:false } (клиент уходит в «упрощённый анализ»); медленный ответ обрывается по таймауту 8 с;
// LLM_PROVIDER=none и пустой ключ — без запроса.
// Что НЕ проверяет: качество ответа настоящей модели и совместимость с живым API (нужен ключ).
import { startMock, MOCK_REPLY } from './llm-mock';

let fails = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; };

const mock = await startMock();
process.env.ANTHROPIC_BASE_URL = mock.url;
process.env.ANTHROPIC_API_KEY = 'mock-key';
process.env.LLM_PROVIDER = 'anthropic';
const { analyzeWithLlm } = await import('../lib/server/llm');
const TEXT = 'Утром первый снег и серый ноябрь, холодно. Вечером дома было тёплое какао и плед.';

mock.setMode('ok');
let r = await analyzeWithLlm(TEXT);
ok(r.ok && r.data.title === MOCK_REPLY.title && r.data.warmth === MOCK_REPLY.warmth, 'валидный ответ проходит zod, поля на месте');
const body = mock.stats().lastBody as { model?: string; output_config?: { format?: { type?: string } }; system?: string };
ok(body?.output_config?.format?.type === 'json_schema', `запрос: structured output (json_schema), модель ${body?.model}`);

mock.setMode('clamp');
r = await analyzeWithLlm(TEXT);
ok(r.ok && r.data.valence === 1 && r.data.warmth === 0 && r.data.motifs.length === 6, 'вне 0..1 → обрезано до границ; мотивов > 6 → первые 6');

for (const [mode, reason] of [['badTitle', 'validation'], ['badJson', 'invalid json'], ['refusal', 'refusal'], ['auth', 'auth'], ['rate', 'rate limit'], ['error500', 'api 500']] as const) {
  mock.setMode(mode);
  r = await analyzeWithLlm(TEXT);
  ok(!r.ok && r.reason.startsWith(reason), `${mode} → { ok:false, reason: "${r.ok ? '—' : r.reason}" }`);
}

mock.setMode('slow');
const t0 = performance.now();
r = await analyzeWithLlm(TEXT);
const dt = (performance.now() - t0) / 1000;
ok(!r.ok && r.reason === 'timeout' && dt >= 7.9 && dt < 9, `ответ через 9,5 с → обрыв по таймауту за ${dt.toFixed(2)} с (reason: ${r.ok ? '—' : r.reason})`);

const before = mock.stats().requests;
process.env.LLM_PROVIDER = 'none';
r = await analyzeWithLlm(TEXT);
ok(!r.ok && r.reason === 'LLM_PROVIDER=none', 'LLM_PROVIDER=none → без LLM');
process.env.LLM_PROVIDER = 'anthropic'; process.env.ANTHROPIC_API_KEY = '';
r = await analyzeWithLlm(TEXT);
ok(!r.ok && r.reason === 'ANTHROPIC_API_KEY missing', 'нет ключа → без LLM');
ok(mock.stats().requests === before, 'в обоих случаях запрос в API не уходит');

mock.server.close();
console.log(fails ? `\n✗ провалено проверок: ${fails}` : '\n✓ все проверки пройдены');
process.exit(fails ? 1 : 0);
