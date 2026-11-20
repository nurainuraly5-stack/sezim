// Реальный анализ аудиофайла в браузере (без внешних библиотек):
// BPM (автокорреляция огибающей spectral flux), энергия (RMS), яркость (spectral centroid),
// лад (хрома + профили Крумхансла–Кесслер).
import type { AudioFeatures } from '../types';
import { clamp } from '../color';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

function pearson(a: number[], b: number[]) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db || 1);
}

export async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  const buf = await blob.arrayBuffer();
  const Ctx = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const ctx = new Ctx(1, 1, 44100);
  return await ctx.decodeAudioData(buf);
}

/** Разрывы с параллельной тональностью (те же звуки), при которых лад уверенный: по гармонии и по басу.
 *  Подобраны на синтетических треках (`npm run test:audio`): каденции I–IV–V–I дают ≥ 0.33 / ≥ 0.25,
 *  поп-петли I–V–vi–IV / i–VI–III–VII — −0.2…0.26 / −0.2…0.2 (их помечаем «≈»). */
const REL_CHROMA_SURE = 0.36;
const REL_BASS_SURE = 0.26;
/** Ниже — лад показывается как приблизительный («≈», с альтернативой). */
export const MODE_SURE = 0.65;

const tick = () => new Promise((r) => setTimeout(r, 0));

export async function analyzeAudioBuffer(ab: AudioBuffer, maxSeconds = 45): Promise<AudioFeatures> {
  const sr0 = ab.sampleRate;
  // моно
  const len0 = ab.length;
  const mono = new Float32Array(len0);
  for (let c = 0; c < ab.numberOfChannels; c++) {
    const d = ab.getChannelData(c);
    for (let i = 0; i < len0; i++) mono[i] += d[i] / ab.numberOfChannels;
  }
  // сегмент: пропускаем вступление, берём ≤ maxSeconds
  const dur = len0 / sr0;
  const startSec = dur > maxSeconds + 10 ? Math.min(dur * 0.15, dur - maxSeconds) : 0;
  const s0 = Math.floor(startSec * sr0), s1 = Math.min(len0, s0 + Math.floor(maxSeconds * sr0));
  // даунсэмпл ×2 при 44.1/48 кГц
  const ds = sr0 >= 32000 ? 2 : 1;
  const sr = sr0 / ds;
  const x = new Float32Array(Math.floor((s1 - s0) / ds));
  for (let i = 0; i < x.length; i++) {
    let acc = 0; for (let k = 0; k < ds; k++) acc += mono[s0 + i * ds + k] || 0;
    x[i] = acc / ds;
  }

  const N = 2048, HOP = 512, half = N / 2;
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const re = new Float32Array(N), im = new Float32Array(N);
  let prev = new Float32Array(half);
  const flux: number[] = [];
  const chroma = new Array(12).fill(0);
  const bass = new Array(12).fill(0); // бас (40–260 Гц) — подсказка тоники
  let rmsSum = 0, centSum = 0, centW = 0, frames = 0;
  // Высота — по пикам спектра с параболической доводкой частоты: бин при N=2048 и 22 кГц ≈ 10,8 Гц,
  // а полутон в басу ≈ 5 Гц — без доводки E2 (82 Гц) попадал в F и ломал лад (E minor → F major).
  const binHz = sr / N;
  const mag = new Float32Array(half);
  const pcOf = (f: number) => (((Math.round(12 * Math.log2(f / 440) + 69) % 12) + 12) % 12);

  for (let start = 0; start + N <= x.length; start += HOP) {
    let e = 0;
    for (let i = 0; i < N; i++) { const v = x[start + i]; e += v * v; re[i] = v * win[i]; im[i] = 0; }
    fft(re, im);
    const cur = new Float32Array(half);
    let fl = 0, num = 0, den = 0;
    for (let b = 1; b < half; b++) {
      const m = Math.hypot(re[b], im[b]);
      mag[b] = m;
      const lm = Math.log1p(m * 10);
      cur[b] = lm;
      const d = lm - prev[b]; if (d > 0) fl += d;
      num += m * (b * binHz); den += m;
    }
    for (let b = 2; b < half - 1; b++) {
      const m = mag[b];
      if (m <= mag[b - 1] || m < mag[b + 1] || b * binHz > 2200) continue;
      const a = Math.log(mag[b - 1] + 1e-12), c = Math.log(m + 1e-12), e2 = Math.log(mag[b + 1] + 1e-12);
      const off = clamp((0.5 * (a - e2)) / (a - 2 * c + e2 || 1), -0.5, 0.5);
      const f = (b + off) * binHz;
      if (f < 38) continue;
      const pc = pcOf(f), p = m * m;
      if (f >= 130) chroma[pc] += m; // гармония — выше баса, амплитуда (не мощность): громкий бас не забивает терции
      if (f <= 260) bass[pc] += p;
    }
    prev = cur;
    flux.push(fl);
    const rms = Math.sqrt(e / N);
    rmsSum += rms;
    if (den > 0) { centSum += (num / den) * rms; centW += rms; }
    frames++;
    if (frames % 160 === 0) await tick();
  }
  if (frames < 32) throw new Error('Слишком короткий фрагмент');

  // огибающая онсетов: вычитаем скользящее среднее
  const fr = sr / HOP;
  const W = Math.round(fr * 0.5);
  const onset = flux.map((v, i) => {
    let s = 0, c = 0;
    for (let k = Math.max(0, i - W); k < Math.min(flux.length, i + W); k++) { s += flux[k]; c++; }
    return Math.max(0, v - s / c);
  });
  const minLag = Math.floor((60 / 200) * fr), maxLag = Math.ceil((60 / 55) * fr);
  const acf: number[] = [];
  let acf0 = 0;
  for (let i = 0; i < onset.length; i++) acf0 += onset[i] * onset[i];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < onset.length; i++) s += onset[i] * onset[i + lag];
    const bpm = (60 * fr) / lag;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 115) / 0.9) ** 2); // мягкий перцептивный приор
    acf.push(s * prior);
  }
  let bi = 0; for (let i = 1; i < acf.length; i++) if (acf[i] > acf[bi]) bi = i;
  // параболическая доводка
  let lag = minLag + bi;
  if (bi > 0 && bi < acf.length - 1) {
    const a = acf[bi - 1], b = acf[bi], c = acf[bi + 1];
    const p = (0.5 * (a - c)) / (a - 2 * b + c || 1);
    lag += clamp(p, -0.5, 0.5);
  }
  let bpm = (60 * fr) / lag;
  if (bpm < 60) bpm *= 2; if (bpm > 180) bpm /= 2;
  const tempoConf = clamp((acf[bi] / (acf0 || 1)) * 2.5);

  // лад: корреляция с профилями Крумхансла + вес тоники в басу (разводит параллельные мажор/минор)
  const bassMax = Math.max(...bass) || 1;
  const scoreMaj: number[] = [], scoreMin: number[] = [];
  let best = -9, bestK = 0, bestMode: 'major' | 'minor' = 'major', bestMaj = -2, bestMin = -2;
  for (let k = 0; k < 12; k++) {
    const rot = chroma.map((_, i) => chroma[(i + k) % 12]);
    const cm = pearson(rot, MAJOR), cn = pearson(rot, MINOR);
    bestMaj = Math.max(bestMaj, cm); bestMin = Math.max(bestMin, cn);
    const tonic = 0.35 * (bass[k] / bassMax);
    scoreMaj[k] = cm + tonic; scoreMin[k] = cn + tonic;
    if (cm + tonic > best) { best = cm + tonic; bestK = k; bestMode = 'major'; }
    if (cn + tonic > best) { best = cn + tonic; bestK = k; bestMode = 'minor'; }
  }
  // уверенность 1: насколько выбранный лад лучше одноимённого (та же тоника)
  const rotB = chroma.map((_, i) => chroma[(i + bestK) % 12]);
  const sep = Math.abs(pearson(rotB, MAJOR) - pearson(rotB, MINOR));
  const parallelConf = clamp(sep * 4 + Math.abs(bestMaj - bestMin) * 2);
  // уверенность 2: насколько он лучше параллельного (те же звуки: A minor ↔ C major). Петли вроде Am–F–C–G
  // звучат одинаково в обоих — по хроме их не развести, такой лад помечаем приблизительным и называем второй.
  const relK = bestMode === 'major' ? (bestK + 9) % 12 : (bestK + 3) % 12;
  const relChroma = bestMode === 'major' ? scoreMin[relK] : scoreMaj[relK];
  const tonicBest = 0.35 * (bass[bestK] / bassMax), tonicRel = 0.35 * (bass[relK] / bassMax);
  const chromaGap = best - tonicBest - (relChroma - tonicRel); // гармония без баса
  const bassGap = tonicBest - tonicRel;                         // бас: чья тоника звучит чаще
  // уверенность — по более слабому из двух свидетельств; если бас и гармония спорят — лад приблизительный
  const modeConf = Math.min(clamp(parallelConf / 0.5), clamp(chromaGap / REL_CHROMA_SURE), clamp(bassGap / REL_BASS_SURE));
  const mode: AudioFeatures['mode'] = parallelConf < 0.12 ? 'unknown' : bestMode;
  const key = mode === 'unknown' ? undefined : `${NOTES[bestK]} ${bestMode}`;
  // альтернатива — та тональность, с которой спор сильнее: одноимённая (A minor ↔ A major) или параллельная (A minor ↔ C major)
  const relConf = Math.min(clamp(chromaGap / REL_CHROMA_SURE), clamp(bassGap / REL_BASS_SURE));
  const flip = bestMode === 'major' ? 'minor' : 'major';
  const keyAlt = mode !== 'unknown' && modeConf < MODE_SURE
    ? (clamp(parallelConf / 0.5) < relConf ? `${NOTES[bestK]} ${flip}` : `${NOTES[relK]} ${flip}`) : undefined;

  const rmsMean = rmsSum / frames;
  const db = 20 * Math.log10(rmsMean + 1e-9);
  const fluxMean = flux.reduce((s, v) => s + v, 0) / flux.length;
  const energy = clamp(0.7 * clamp((db + 34) / 26) + 0.3 * clamp(fluxMean / 120));
  const brightness = clamp((centW ? centSum / centW : 1500) / 3500);

  return {
    source: 'audio', bpm: Math.round(bpm), energy, brightness, mode, key, keyAlt, modeConfidence: modeConf,
    confidence: clamp(0.5 * tempoConf + 0.5 * modeConf), duration: dur,
  };
}

/** Анализ файла с тайм-боксом. При ошибке — undefined (UI подписывает «упрощённо»). */
export async function analyzeAudioFile(blob: Blob, timeoutMs = 9000): Promise<AudioFeatures | undefined> {
  try {
    const ab = await decodeAudio(blob);
    return await Promise.race([
      analyzeAudioBuffer(ab),
      new Promise<undefined>((r) => setTimeout(() => r(undefined), timeoutMs)),
    ]);
  } catch (e) {
    console.warn('audio analysis failed', e);
    return undefined;
  }
}
