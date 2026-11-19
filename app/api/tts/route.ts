// POST /api/tts — предрендер озвучки (mp3). TTS_PROVIDER = openai | elevenlabs | none.
// 501 → клиент использует speechSynthesis браузера. Голоса только синтезированные.
import { z } from 'zod';

export const runtime = 'nodejs';

const Body = z.object({
  text: z.string().min(1).max(700),
  pace: z.enum(['slow', 'mid', 'fast']),
  warmth: z.number().min(0).max(1),
});

function activeProvider(): 'openai' | 'elevenlabs' | null {
  const p = (process.env.TTS_PROVIDER || 'none').toLowerCase();
  if (p === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
  if (p === 'elevenlabs' && process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) return 'elevenlabs';
  return null;
}

/** GET → настроен ли синтез (без раскрытия ключей); клиент решает, предлагать ли синтезированный голос. */
export function GET() {
  return Response.json({ configured: activeProvider() !== null });
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return new Response('bad request', { status: 400 });
  const { text, pace, warmth } = parsed.data;
  const provider = activeProvider();
  const signal = AbortSignal.timeout(15000);

  try {
    if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST', signal,
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.TTS_MODEL || 'gpt-4o-mini-tts',
          voice: warmth > 0.55 ? 'coral' : 'sage',
          input: text,
          response_format: 'mp3',
          speed: pace === 'slow' ? 0.88 : pace === 'fast' ? 1.08 : 1,
          instructions: `Russian text. Read as a quiet personal memory, ${pace === 'slow' ? 'slowly, with pauses' : pace === 'fast' ? 'lively but soft' : 'at an even pace'}, ${warmth > 0.55 ? 'warm and close' : 'cool, airy and calm'}. No theatrics.`,
        }),
      });
      if (!r.ok) return new Response('tts failed', { status: 502 });
      return new Response(r.body, { headers: { 'Content-Type': 'audio/mpeg' } });
    }
    if (provider === 'elevenlabs') {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(process.env.ELEVENLABS_VOICE_ID!)}?output_format=mp3_44100_128`, {
        method: 'POST', signal,
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY!, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text, model_id: process.env.TTS_MODEL || 'eleven_multilingual_v2',
          voice_settings: { stability: pace === 'fast' ? 0.35 : 0.6, similarity_boost: 0.7, style: warmth * 0.4, speed: pace === 'slow' ? 0.9 : pace === 'fast' ? 1.07 : 1 },
        }),
      });
      if (!r.ok) return new Response('tts failed', { status: 502 });
      return new Response(r.body, { headers: { 'Content-Type': 'audio/mpeg' } });
    }
  } catch {
    return new Response('tts timeout', { status: 504 });
  }
  return new Response('tts not configured', { status: 501 });
}
