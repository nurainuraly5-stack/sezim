// Детерминированный синтез тестовых треков в Node (без Web Audio) — для `npm run test:audio`.
// Треки с ИЗВЕСТНЫМ темпом и ладом: аккорды по каденции, бас на тонике аккорда, бочка на доли, хэт.
// Тембры с обертонами (пила, «пиано») — как у живых инструментов; 3-я гармоника тянет хрому к доминанте,
// поэтому на таких тембрах ошибки лада видны, а на чистых синусах — нет.

export type Timbre = 'triangle' | 'saw' | 'piano' | 'organ';
export type TestTrack = {
  name: string; bpm: number; root: number; // MIDI-нота тоники
  mode: 'major' | 'minor'; timbre: Timbre; energy: number; seconds?: number;
  /** другая каденция: по умолчанию I–IV–V–I; 'pop' — I–V–vi–IV (мажор) / i–VI–III–VII (минор, натуральный) */
  prog?: 'cadence' | 'pop';
  sr?: number;
  melody?: boolean;
  drums?: boolean;
};

/** Простейшая замена AudioBuffer (то, что читает analyzeAudioBuffer). */
export function fakeBuffer(data: Float32Array[], sampleRate: number): AudioBuffer {
  return {
    sampleRate, length: data[0].length, numberOfChannels: data.length, duration: data[0].length / sampleRate,
    getChannelData: (c: number) => data[c],
  } as unknown as AudioBuffer;
}

const midiHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

const HARM: Record<Timbre, number[]> = {
  triangle: [1, 0, 1 / 9, 0, 1 / 25, 0, 1 / 49],
  saw: [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8],
  piano: [1, 0.55, 0.32, 0.22, 0.12, 0.08, 0.05],
  organ: [1, 0.7, 0.5, 0.35, 0.25, 0.3, 0.15, 0.2],
};

// детерминированный шум
function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1; }

export function synthTrack(t: TestTrack): AudioBuffer {
  const sr = t.sr ?? 22050;
  const secs = t.seconds ?? 16;
  const n = Math.floor(sr * secs);
  const out = new Float32Array(n);
  const beat = 60 / t.bpm;
  const harm = HARM[t.timbre];
  const major = [0, 2, 4, 5, 7, 9, 11];
  const harmMinor = [0, 2, 3, 5, 7, 8, 11];
  const natMinor = [0, 2, 3, 5, 7, 8, 10];
  const scale = t.mode === 'major' ? major : t.prog === 'pop' ? natMinor : harmMinor;
  const prog = t.prog === 'pop' ? (t.mode === 'major' ? [0, 4, 5, 3] : [0, 5, 2, 6]) : [0, 3, 4, 0];
  const triad = (deg: number) => [0, 2, 4].map((k) => { const d = deg + k; return t.root + scale[d % 7] + 12 * Math.floor(d / 7); });

  const tone = (hz: number, t0: number, dur: number, amp: number, h: number[], attack = 0.01, decay = 0) => {
    const i0 = Math.max(0, Math.floor(t0 * sr)), i1 = Math.min(n, Math.floor((t0 + dur) * sr));
    for (let i = i0; i < i1; i++) {
      const tt = i / sr - t0;
      const env = Math.min(1, tt / attack) * (decay > 0 ? Math.exp(-tt / decay) : Math.max(0, 1 - tt / dur));
      let v = 0;
      for (let k = 0; k < h.length; k++) if (h[k] && hz * (k + 1) < sr / 2) v += h[k] * Math.sin(2 * Math.PI * hz * (k + 1) * tt);
      out[i] += amp * env * v;
    }
  };

  const bars = Math.ceil(secs / (beat * 4));
  for (let b = 0; b < bars; b++) {
    const t0 = b * beat * 4;
    const ch = triad(prog[b % 4]);
    for (const note of ch) tone(midiHz(note), t0, beat * 4, 0.07, harm, 0.05);
    tone(midiHz(ch[0] - 12), t0, beat * 4, 0.22, [1, 0.3, 0.1], 0.01, beat * 2);
  }
  if (t.melody !== false) {
    const steps = Math.floor(secs / beat);
    for (let s = 0; s < steps; s += 2) {
      const deg = [0, 2, 4, 6, 4, 2, 1, 4][(s / 2) % 8];
      tone(midiHz(t.root + 12 + scale[deg % 7]), s * beat, beat * 1.5, 0.09, harm, 0.005, beat * 0.6);
    }
  }
  if (t.drums !== false) {
    const rnd = lcg(t.bpm * 31 + t.root);
    const steps = Math.floor(secs / beat);
    for (let s = 0; s < steps; s++) {
      const t0 = s * beat;
      const i0 = Math.floor(t0 * sr);
      // бочка: падающий синус
      let ph = 0;
      for (let i = 0; i < Math.floor(0.25 * sr) && i0 + i < n; i++) {
        const tt = i / sr;
        const f = 45 + 95 * Math.exp(-tt / 0.04);
        ph += (2 * Math.PI * f) / sr;
        out[i0 + i] += (0.35 + t.energy * 0.6) * Math.exp(-tt / 0.06) * Math.sin(ph);
      }
      if (t.energy > 0.3) {
        const j0 = Math.floor((t0 + beat / 2) * sr);
        let prev = 0;
        for (let i = 0; i < Math.floor(0.05 * sr) && j0 + i < n; i++) {
          const w = rnd(); const hp = w - prev; prev = w; // грубый ВЧ-фильтр
          out[j0 + i] += (0.05 + t.energy * 0.15) * Math.exp(-(i / sr) / 0.015) * hp;
        }
      }
    }
  }
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = 0.8 / (peak || 1);
  for (let i = 0; i < n; i++) out[i] *= g;
  return fakeBuffer([out], sr);
}

/** WAV PCM16 моно/стерео ← буфер (для фикстур). */
export function encodeWav(buf: AudioBuffer): Uint8Array {
  const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
  w(36, 'data'); out.setUint32(40, len * ch * 2, true);
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
    const v = Math.max(-1, Math.min(1, buf.getChannelData(c)[i]));
    out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
  }
  return new Uint8Array(out.buffer);
}

/** WAV PCM16 → буфер (в браузере это делает decodeAudioData). */
export function decodeWav(bytes: Uint8Array): AudioBuffer {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV');
  let o = 12, ch = 1, sr = 44100, bits = 16;
  while (o + 8 <= bytes.length) {
    const id = tag(o), size = v.getUint32(o + 4, true);
    if (id === 'fmt ') { ch = v.getUint16(o + 10, true); sr = v.getUint32(o + 12, true); bits = v.getUint16(o + 22, true); }
    if (id === 'data') {
      if (bits !== 16) throw new Error('only PCM16');
      const n = Math.floor(size / (2 * ch));
      const data = Array.from({ length: ch }, () => new Float32Array(n));
      for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) data[c][i] = v.getInt16(o + 8 + (i * ch + c) * 2, true) / 0x8000;
      return fakeBuffer(data, sr);
    }
    o += 8 + size + (size & 1);
  }
  throw new Error('no data chunk');
}

/** WAV-фикстуры test:audio: параметры песен seed-дневника (lib/seed.ts), но с обертонами — на таких тембрах
 *  «Пирог, лес и все свои» (G major) определялся как G minor, а E minor — как F major. */
export const AUDIO_FIXTURES: (TestTrack & { file: string; key: string })[] = [
  { file: 'snow-74-a-minor.wav', name: 'Первый снег', bpm: 74, root: 57, mode: 'minor', key: 'A minor', timbre: 'piano', energy: 0.25 },
  { file: 'deadline-140-d-minor.wav', name: 'Deadline Pulse', bpm: 140, root: 50, mode: 'minor', key: 'D minor', timbre: 'saw', energy: 0.9 },
  { file: 'morning-72-c-major.wav', name: 'Утро на кухне', bpm: 72, root: 60, mode: 'major', key: 'C major', timbre: 'piano', energy: 0.18 },
  { file: 'sea-96-d-major.wav', name: 'Солёный закат', bpm: 96, root: 62, mode: 'major', key: 'D major', timbre: 'organ', energy: 0.45 },
  { file: 'show-118-e-minor.wav', name: 'After the Show', bpm: 118, root: 52, mode: 'minor', key: 'E minor', timbre: 'saw', energy: 0.6 },
  { file: 'pie-112-g-major.wav', name: 'Семейный стол', bpm: 112, root: 55, mode: 'major', key: 'G major', timbre: 'triangle', energy: 0.65 },
];
