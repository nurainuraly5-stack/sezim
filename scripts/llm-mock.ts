// Локальный mock Anthropic Messages API — ДЛЯ ТЕСТОВ (без ключа и сети). Не используется приложением.
// Режим ответа переключается на лету: POST /__mode {"mode":"slow"}; GET /__stats — сколько запросов пришло.
// Отдельный запуск для проверки в браузере: `node --import ./scripts/ts-hooks.mjs scripts/llm-mock.ts 8787`,
// затем сервер Sezim с LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=mock ANTHROPIC_BASE_URL=http://127.0.0.1:8787.
import { createServer, type Server } from 'node:http';

export type MockMode = 'ok' | 'clamp' | 'badTitle' | 'badJson' | 'slow' | 'auth' | 'rate' | 'refusal' | 'error500' | 'noMotifs';

export const MOCK_REPLY = {
  valence: 0.62, arousal: 0.3, warmth: 0.81, density: 0.4, contrast: 0.55,
  daypart: 'dusk', motifs: ['какао', 'плед', 'первый снег'], warmMotifs: ['какао', 'плед'], coldMotifs: ['первый снег'],
  quote: 'дома было тёплое какао', title: 'Какао после первого снега', voicePace: 'slow',
};

export function startMock(port = 0, slowMs = 11000): Promise<{ server: Server; url: string; setMode: (m: MockMode) => void; stats: () => { requests: number; lastBody?: unknown } }> {
  let mode: MockMode = 'ok';
  let requests = 0;
  let lastBody: unknown;
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', async () => {
      if (req.url === '/__mode' && req.method === 'POST') { mode = JSON.parse(raw).mode; res.end('{}'); return; }
      if (req.url === '/__stats') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ requests, mode })); return; }
      if (!req.url?.startsWith('/v1/messages')) { res.statusCode = 404; res.end(); return; }
      requests++;
      try { lastBody = JSON.parse(raw); } catch { lastBody = raw; }
      const json = (status: number, body: unknown) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
      const err = (status: number, type: string) => json(status, { type: 'error', error: { type, message: type } });
      const message = (text: string, stop = 'end_turn') => json(200, {
        id: 'msg_mock', type: 'message', role: 'assistant', model: 'mock', stop_reason: stop, stop_sequence: null,
        content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 10 },
      });
      switch (mode) {
        case 'ok': return message(JSON.stringify(MOCK_REPLY));
        case 'clamp': return message(JSON.stringify({ ...MOCK_REPLY, valence: 1.4, warmth: -0.2, motifs: [...MOCK_REPLY.motifs, 'лампа', 'окно', 'ветер', 'остановка'] }));
        case 'noMotifs': return message(JSON.stringify({ ...MOCK_REPLY, motifs: [], warmMotifs: [], coldMotifs: [] }));
        case 'badTitle': return message(JSON.stringify({ ...MOCK_REPLY, title: 'Какао' }));
        case 'badJson': return message('{"valence": 0.5, "arousal": ');
        case 'slow': await new Promise((r) => setTimeout(r, slowMs)); if (!res.destroyed) message(JSON.stringify(MOCK_REPLY)); return;
        case 'auth': return err(401, 'authentication_error');
        case 'rate': return err(429, 'rate_limit_error');
        case 'refusal': return message('', 'refusal');
        case 'error500': return err(500, 'api_error');
      }
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const addr = server.address();
    const p = typeof addr === 'object' && addr ? addr.port : port;
    resolve({ server, url: `http://127.0.0.1:${p}`, setMode: (m) => { mode = m; }, stats: () => ({ requests, lastBody }) });
  }));
}

if (process.argv[1]?.endsWith('llm-mock.ts')) {
  const port = Number(process.argv[2] || 8787);
  startMock(port).then(({ url }) => console.log(`LLM mock: ${url} (POST /__mode {"mode":"ok|slow|badTitle|..."})`));
}
