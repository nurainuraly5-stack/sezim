// Процедурная музыка для seed-дней (CC0, сгенерирована Sezim в браузере).
// Это не мок: результат — настоящий WAV, который проходит тот же аудио-анализ, что и файлы пользователя.
export type SynthSpec = {
  bpm: number; root: number; // MIDI-нота тоники
  mode: 'major' | 'minor'; energy: number; brightness: number; seconds?: number;
};

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export async function renderSong(spec: SynthSpec): Promise<AudioBuffer> {
  const sr = 32000;
  const secs = spec.seconds ?? 18;
  const ctx = new OfflineAudioContext(2, sr * secs, sr);
  const beat = 60 / spec.bpm;
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  const scale = spec.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const prog = spec.mode === 'major' ? [0, 4, 5, 3] : [0, 5, 2, 6]; // I–V–vi–IV / i–VI–III–VII
  const triad = (deg: number) => [0, 2, 4].map((k) => {
    const d = deg + k;
    return spec.root + scale[d % 7] + 12 * Math.floor(d / 7);
  });

  // пэд: аккорды по 4 доли
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 600 + spec.brightness * 3200;
  filt.connect(master);
  const bars = Math.ceil(secs / (beat * 4));
  for (let b = 0; b < bars; b++) {
    const t = b * beat * 4;
    for (const n of triad(prog[b % 4])) {
      const o = ctx.createOscillator();
      o.type = spec.energy > 0.5 ? 'sawtooth' : 'triangle';
      o.frequency.value = midi(n);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.09, t + 0.3);
      g.gain.linearRampToValueAtTime(0.0, t + beat * 4);
      o.connect(g).connect(filt);
      o.start(t); o.stop(t + beat * 4 + 0.05);
    }
    // бас
    const bo = ctx.createOscillator();
    bo.type = 'sine';
    bo.frequency.value = midi(triad(prog[b % 4])[0] - 12);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.25, t); bg.gain.exponentialRampToValueAtTime(0.001, t + beat * 3.8);
    bo.connect(bg).connect(master);
    bo.start(t); bo.stop(t + beat * 4);
  }

  // ритм: бочка на каждую долю, хэт на слабые — громкость от энергии
  const noise = ctx.createBuffer(1, sr * 0.2, sr);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const steps = Math.floor(secs / beat);
  for (let s = 0; s < steps; s++) {
    const t = s * beat;
    const k = ctx.createOscillator();
    k.frequency.setValueAtTime(140, t); k.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.35 + spec.energy * 0.6, t); kg.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    k.connect(kg).connect(master);
    k.start(t); k.stop(t + 0.3);
    if (spec.energy > 0.3) {
      const h = ctx.createBufferSource(); h.buffer = noise;
      const hf = ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 7000;
      const hg = ctx.createGain();
      const th = t + beat / 2;
      hg.gain.setValueAtTime(0.08 + spec.energy * 0.2, th); hg.gain.exponentialRampToValueAtTime(0.001, th + 0.06);
      h.connect(hf).connect(hg).connect(master);
      h.start(th); h.stop(th + 0.08);
    }
    // мелодические щипки по ступеням лада
    if (s % 2 === 0) {
      const p = ctx.createOscillator(); p.type = 'triangle';
      const deg = [0, 2, 4, 6, 4, 2, 1, 4][(s / 2) % 8];
      p.frequency.value = midi(spec.root + 12 + scale[deg % 7]);
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(0.12, t); pg.gain.exponentialRampToValueAtTime(0.001, t + beat * 1.5);
      p.connect(pg).connect(filt);
      p.start(t); p.stop(t + beat * 1.6);
    }
  }
  return await ctx.startRendering();
}

export function toWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
  w(36, 'data'); out.setUint32(40, len * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
    const v = Math.max(-1, Math.min(1, data[c][i]));
    out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
  }
  return new Blob([out.buffer], { type: 'audio/wav' });
}
