// Анализ фото в браузере: ресайз ≤1600px, палитра (свой k-means, детерминированный),
// яркость / контраст / насыщенность / температура.
import type { PhotoFeatures } from '../types';
import { clamp, rgbToHex, rgbToHsl, temperature, type RGB } from '../color';

const MAX_SIDE = 1600;

async function toBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(blob);
  } catch {
    // SVG и экзотические форматы — через <img>
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);
    return img;
  }
}

/** Ресайз и перекодирование в JPEG. Возвращает уменьшенный blob. */
export async function resizePhoto(blob: Blob, maxSide = MAX_SIDE, quality = 0.88): Promise<Blob> {
  const bmp = await toBitmap(blob);
  const w0 = 'naturalWidth' in bmp ? bmp.naturalWidth || 1200 : bmp.width;
  const h0 = 'naturalHeight' in bmp ? bmp.naturalHeight || 900 : bmp.height;
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', quality));
}

async function samplePixels(blob: Blob, side = 72): Promise<RGB[]> {
  const bmp = await toBitmap(blob);
  const c = document.createElement('canvas');
  c.width = side; c.height = side;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, side, side);
  const d = ctx.getImageData(0, 0, side, side).data;
  const px: RGB[] = [];
  for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
  return px;
}

/** k-means с детерминированной инициализацией по квантилям яркости. */
export function kmeans(px: RGB[], k = 5, iters = 12): { c: RGB; n: number }[] {
  if (!px.length) return [];
  const lum = (p: RGB) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
  const sorted = [...px].sort((a, b) => lum(a) - lum(b));
  let cents: RGB[] = Array.from({ length: k }, (_, i) => [...sorted[Math.floor(((i + 0.5) / k) * sorted.length)]] as RGB);
  const assign = new Array(px.length).fill(0);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < px.length; i++) {
      let bi = 0, bd = Infinity;
      for (let j = 0; j < k; j++) {
        const dr = px[i][0] - cents[j][0], dg = px[i][1] - cents[j][1], db = px[i][2] - cents[j][2];
        const dd = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
        if (dd < bd) { bd = dd; bi = j; }
      }
      assign[i] = bi;
    }
    const sum = cents.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < px.length; i++) {
      const s = sum[assign[i]]; s[0] += px[i][0]; s[1] += px[i][1]; s[2] += px[i][2]; s[3]++;
    }
    cents = cents.map((c, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : c) as RGB);
  }
  const counts = new Array(k).fill(0);
  for (const a of assign) counts[a]++;
  return cents.map((c, j) => ({ c, n: counts[j] })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
}

export async function analyzePhotos(blobs: Blob[]): Promise<PhotoFeatures | undefined> {
  if (!blobs.length) return undefined;
  const all: RGB[] = [];
  for (const b of blobs.slice(0, 8)) all.push(...(await samplePixels(b)));

  let lumSum = 0, lumSq = 0, satSum = 0;
  for (const p of all) {
    const l = (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255;
    lumSum += l; lumSq += l * l; satSum += rgbToHsl(p)[1];
  }
  const n = all.length;
  const brightness = lumSum / n;
  const contrast = clamp(Math.sqrt(Math.max(0, lumSq / n - brightness * brightness)) * 3.2);
  const saturation = satSum / n;

  const clusters = kmeans(all, 6);
  const palette = clusters.map(({ c, n: cnt }) => ({ hex: rgbToHex(c), weight: cnt / n }));
  const warmth = clamp(palette.reduce((acc, p) => acc + temperature(p.hex) * p.weight, 0));

  return { palette, brightness, contrast, saturation, warmth, count: blobs.length };
}
