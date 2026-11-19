// Проверка дизайн-токенов: `npm run check:tokens`.
// Контраст WCAG 2.1 AA для всех пар «текст / фон», минимальные кегли и веса, трекинг заголовков.
import { color, contrastMin, dayTheme, type, typeMobile } from '../design/tokens';
import { hslToHex } from '../core/color';

let fails = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; };

type RGBA = [number, number, number, number];
function parse(c: string): RGBA {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) { const [r, g, b, a = '1'] = m[1].split(',').map((s) => s.trim()); return [+r, +g, +b, +a]; }
  const h = c.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
}
/** Полупрозрачная поверхность поверх фона → итоговый цвет. */
const over = (top: string, base: string): string => {
  const [r, g, b, a] = parse(top), [R, G, B] = parse(base);
  return `rgba(${r * a + R * (1 - a)},${g * a + G * (1 - a)},${b * a + B * (1 - a)},1)`;
};
function lum(c: string) {
  const [r, g, b] = parse(c).map((v, i) => (i < 3 ? v / 255 : v));
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

console.log('Контраст (AA: текст ≥ 4.5)');
for (const theme of ['light', 'dark'] as const) {
  const t = color[theme];
  const grounds = { bg: t.bg, surface: over(t.surface, t.bg), surfaceStrong: over(t.surfaceStrong, t.bg) };
  for (const [gName, g] of Object.entries(grounds)) {
    for (const ink of ['ink', 'inkSoft', 'accent'] as const) {
      const r = ratio(t[ink], g);
      ok(r >= contrastMin.text, `${theme}: ${ink} на ${gName} — ${r.toFixed(2)}`);
    }
  }
  const r = ratio(t.onAccent, t.accent);
  ok(r >= contrastMin.text, `${theme}: onAccent на accent — ${r.toFixed(2)}`);
}

console.log('\nТема страницы дня: 2000 случайных палитр');
let worst = Infinity;
for (let i = 0; i < 2000; i++) {
  const pal = Array.from({ length: 5 }, (_, k) => hslToHex([(i * 37 + k * 71) % 360, ((i * 13 + k * 29) % 100) / 100, ((i * 17 + k * 23) % 100) / 100]));
  const th = dayTheme(pal, (i % 10) / 10, i % 7 === 0 ? 'night' : 'day');
  const t = th.dark ? color.dark : color.light;
  for (const ground of [th.bg, over(t.surface, th.bg)]) worst = Math.min(worst, ratio(t.inkSoft, ground), ratio(t.accent, ground));
}
ok(worst >= contrastMin.text, `худший контраст текста на фоне дня — ${worst.toFixed(2)}`);

console.log('\nГраницы цвета текста');
ok(lum(color.light.inkSoft) <= lum('#3A3550') + 1e-9 && lum(color.light.ink) <= lum('#3A3550'), 'на светлом текст не светлее #3A3550');
ok(lum(color.dark.inkSoft) >= lum('#EDE9F5') - 1e-9 && lum(color.dark.ink) >= lum('#EDE9F5'), 'на тёмном текст не темнее #EDE9F5');

console.log('\nШкала шрифта');
for (const [k, s] of Object.entries(type)) {
  const m = typeMobile[k as keyof typeof type];
  const size = Math.min(s.size, m?.size ?? s.size);
  ok(size >= 12, `${k}: кегль ${size}px ≥ 12`);
  ok(s.weight >= 500, `${k}: вес ${s.weight} ≥ 500`);
}
ok([type.display, type.h1].every((s) => s.weight === 800 && s.tracking <= -0.01 && s.tracking >= -0.02), 'крупные заголовки: 800, трекинг −1…−2%');
ok(type.h2.weight === 800, 'h2: 800');
ok([type.title, type.date, type.ui].every((s) => s.weight === 700), 'название, дата, UI: 700');
ok(type.body.weight >= 500 && type.body.weight <= 600 && type.bodyStrong.weight <= 600, 'основной текст 500–600');
ok(type.caption.weight === 600 && type.micro.weight === 600, 'подписи: 600');

console.log(fails ? `\n✗ провалено проверок: ${fails}` : '\n✓ все проверки пройдены');
process.exit(fails ? 1 : 0);
