// Дизайн-токены Sezim — единственный источник размеров, весов, цветов, радиусов и сетки.
// Компоненты не задают свои кегли/веса/радиусы: только отсюда (через CSS-переменные или импорт).

/** Один шрифт везде: Manrope (variable, кириллица), fallback — системный. */
export const font = {
  family: 'var(--font-sans), system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;

type TypeStyle = { size: number; weight: number; line: number; tracking: number };

/**
 * Типографическая шкала (px). Веса: заголовки 800, дата/названия/UI 700,
 * текст 500–600 (не тоньше 500), подписи 600 и не мельче 12px.
 * tracking — в em; у крупных заголовков −1…−2%.
 */
export const type = {
  display: { size: 56, weight: 800, line: 1.04, tracking: -0.02 }, // «Твой мир воспоминаний», заголовок дня
  h1: { size: 40, weight: 800, line: 1.08, tracking: -0.018 },
  h2: { size: 26, weight: 800, line: 1.15, tracking: -0.012 },
  h3: { size: 19, weight: 700, line: 1.25, tracking: -0.006 },
  title: { size: 16, weight: 700, line: 1.3, tracking: -0.004 }, // название дня под сферой
  date: { size: 13, weight: 700, line: 1.3, tracking: 0.01 },
  body: { size: 16, weight: 500, line: 1.6, tracking: 0 },
  bodyStrong: { size: 16, weight: 600, line: 1.6, tracking: 0 },
  ui: { size: 15, weight: 700, line: 1.2, tracking: 0 }, // кнопки, навигация, чипы
  caption: { size: 13, weight: 600, line: 1.4, tracking: 0.01 },
  micro: { size: 12, weight: 600, line: 1.35, tracking: 0.02 }, // минимум для подписей
} as const satisfies Record<string, TypeStyle>;

/** На телефоне крупные кегли ужимаются; остальное — как на ноутбуке. */
export const typeMobile: Partial<Record<keyof typeof type, Partial<TypeStyle>>> = {
  display: { size: 36 },
  h1: { size: 30 },
  h2: { size: 22 },
};

/**
 * Цвет. Светлая основа; текст на светлом не светлее #3A3550, на тёмном — не темнее #EDE9F5
 * (проверка WCAG AA: npm run check:tokens).
 */
export const color = {
  light: {
    bg: '#F6F3FA',
    bgGradient: 'radial-gradient(120% 80% at 18% 0%, #FBEDE6 0%, rgba(251,237,230,0) 55%), radial-gradient(90% 70% at 100% 10%, #E6E9FB 0%, rgba(230,233,251,0) 60%), #F6F3FA',
    surface: 'rgba(255,255,255,0.62)', // полупрозрачная карточка + зерно, не glassmorphism
    surfaceStrong: 'rgba(255,255,255,0.84)',
    line: 'rgba(58,53,80,0.12)',
    ink: '#1F1B2E',
    inkSoft: '#3A3550', // самый светлый допустимый цвет текста
    accent: '#5B4BC4', // фокус, ссылки, активная навигация
    onAccent: '#FFFFFF',
  },
  dark: {
    bg: '#120F1C',
    surface: 'rgba(28,24,40,0.6)',
    surfaceStrong: 'rgba(28,24,40,0.86)',
    line: 'rgba(237,233,245,0.14)',
    ink: '#F7F5FB',
    inkSoft: '#EDE9F5', // самый тёмный допустимый цвет текста на тёмном
    accent: '#C9BEFF',
    onAccent: '#120F1C',
  },
  /** Градиент логотипа и редких акцентов: персик → лаванда → голубой. */
  brand: ['#F7B79B', '#C6A6EE', '#9DC4F3'],
} as const;

/** Минимальные контрасты (WCAG 2.1 AA). */
export const contrastMin = { text: 4.5, large: 3 } as const;

/** Радиусы — одна шкала на всё. */
export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 } as const;

/** Отступы — шаг 4px. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;

/** Сетка: сайдбар, контент, панель дня, поля. */
export const layout = {
  sidebar: 232,
  panel: 400, // панель открытого дня в архиве
  contentMax: 1180,
  gutter: { mobile: 16, tablet: 24, desktop: 40 },
  breakpoint: { md: 768, lg: 1100 },
} as const;

/** Фактура карточек: шум 3–5%. */
export const surfaceNoise = { opacity: 0.04 } as const;

export const shadow = {
  card: '0 1px 0 rgba(255,255,255,0.7) inset, 0 18px 40px -24px rgba(45,35,90,0.28)',
  float: '0 30px 60px -30px rgba(45,35,90,0.35)',
} as const;

export const motion = {
  fast: 0.18,
  base: 0.35,
  slow: 0.8,
  ease: 'cubic-bezier(.22,1,.36,1)',
} as const;

/**
 * Постоянная геометрия сферы (одинакова у всех — «один автор»).
 * Доли стороны квадратного кадра сферы: центр тела, радиус, место тени.
 * Подпись (дата + название) всегда под кадром, не на сфере.
 */
export const orbFrame = {
  cx: 0.5,
  cy: 0.42,
  radius: 0.3,
  shadowY: 1.55, // в радиусах ниже центра
} as const;

/** Размеры сфер (видимый диаметр тела, px). */
export const orbSize = {
  archive: { desktop: 150, mobile: 104 },
  hero: { desktop: 360, mobile: 240 },
  preview: { desktop: 300, mobile: 220 },
  thumb: 384, // сторона кэш-миниатюры (px)
} as const;

/** CSS-переменные из токенов — подключаются в layout один раз. */
export function cssVariables(): Record<string, string> {
  const v: Record<string, string> = {};
  for (const [k, t] of Object.entries(type)) {
    v[`--t-${k}-size`] = `${t.size}px`;
    v[`--t-${k}-weight`] = String(t.weight);
    v[`--t-${k}-line`] = String(t.line);
    v[`--t-${k}-tracking`] = `${t.tracking}em`;
  }
  for (const [k, t] of Object.entries(typeMobile)) if (t.size) v[`--t-${k}-size-m`] = `${t.size}px`;
  for (const [k, r] of Object.entries(radius)) v[`--r-${k}`] = `${r}px`;
  for (const [k, c] of Object.entries(color.light)) v[`--c-${k}`] = c;
  for (const [k, c] of Object.entries(color.dark)) v[`--c-dark-${k}`] = c;
  color.brand.forEach((c, i) => { v[`--c-brand-${i}`] = c; });
  v['--noise-opacity'] = String(surfaceNoise.opacity);
  v['--sidebar-w'] = `${layout.sidebar}px`;
  v['--panel-w'] = `${layout.panel}px`;
  v['--shadow-card'] = shadow.card;
  v['--ease'] = motion.ease;
  return v;
}
