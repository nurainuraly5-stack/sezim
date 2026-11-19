// Цветовые утилиты. Всё детерминированно, без словарей «эмоция = цвет».

export type RGB = [number, number, number]; // 0..255
export type HSL = [number, number, number]; // h 0..360, s,l 0..1

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
}

export function rgbToHsl([r, g, b]: RGB): HSL {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb([h, s, l]: HSL): RGB {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

export const hexToHsl = (hex: string) => rgbToHsl(hexToRgb(hex));
export const hslToHex = (hsl: HSL) => rgbToHex(hslToRgb(hsl));

/** Температура цвета 0 (холодный, сине-голубой) .. 1 (тёплый, оранжево-красный). */
export function temperature(hex: string): number {
  const [r, , b] = hexToRgb(hex);
  const [, s] = hexToHsl(hex);
  const t = 0.5 + (r - b) / 510;
  return clamp(lerp(0.5, t, clamp(s * 1.6)));
}

export const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

/** Сдвиг оттенка к тёплому (35°) или холодному (215°) полюсу на долю amt. */
export function shiftTemperature(hex: string, towardWarm: boolean, amt: number): string {
  const [h, s, l] = hexToHsl(hex);
  const target = towardWarm ? 32 : 214;
  let d = target - h;
  if (d > 180) d -= 360; if (d < -180) d += 360;
  return hslToHex([h + d * clamp(amt), s, l]);
}

export function adjust(hex: string, { sat = 1, light = 0 }: { sat?: number; light?: number }): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex([h, clamp(s * sat), clamp(l + light)]);
}

export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
}

export const hexToVec3 = (hex: string): [number, number, number] => {
  const [r, g, b] = hexToRgb(hex);
  return [r / 255, g / 255, b / 255];
};

/** Стабильный хэш строки (FNV-1a) — для кэша и детерминированных сидов. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
