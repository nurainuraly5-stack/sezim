// Процедурная сфера дня: данные дня → сид → параметры шейдера → визуальный дескриптор.
// Чистые детерминированные функции. Никаких таблиц «эмоция → цвет» и готовых сфер:
// цвета — из палитры дня (фото + музыка, см. style-engine), всё остальное — непрерывные функции признаков.
import type { AudioFeatures, DayEntry, MoodProfile, PhotoFeatures, SongMeta, StyleTokens } from './types';
import { clamp, hexToHsl, hexToRgb, hslToHex, lerp, luminance } from './color';
import { audioTrust, tempoNorm } from './mood';

/** Всё, из чего строится сфера. DayEntry подходит напрямую (см. orbSource). */
export type OrbSource = {
  text: string;
  createdAt: number;
  mood: MoodProfile;
  tokens: StyleTokens;
  photo?: PhotoFeatures;
  audio?: AudioFeatures;
  meta?: SongMeta;
};

export const orbSource = (d: DayEntry): OrbSource => ({
  text: d.text, createdAt: d.createdAt, mood: d.mood, tokens: d.tokens,
  photo: d.photoFeatures, audio: d.song.analysis, meta: d.song.meta,
});

export type Vec3 = [number, number, number];

export type OrbParams = {
  seed: number;          // 32-бит, стабильный
  offset: [number, number];      // смещение поля шума, в клетках шума (0..PATTERN_SPAN): свой рисунок у каждого дня
  swirlCenter: [number, number]; // центр вихря, доли радиуса
  core: Vec3; shell: Vec3; accent: Vec3; // 0..1 RGB
  contrast: number;      // 0..1 — насколько ядро отделено от оболочки
  depth: number;         // 0 светлая .. 1 тёмная/тяжёлая
  deform: number;        // амплитуда деформации силуэта (доля радиуса)
  deformFreq: number;
  bands: number; swirl: number; particles: number; veins: number; // 0..1 — внутренняя структура
  bandAngle: number;     // рад
  flow: 1 | -1;          // направление вихря и вращения
  grain: number;         // 0..1 — плёнка/зерно
  breath: number;        // Гц
  spin: number;          // рад/с
  light: { x: number; y: number; intensity: number; warm: number }; // блик по времени суток
  rimLight: number;      // 0..1 — подсветка по краю
  glow: number;          // 0..1
  rings: number;         // 0..3
  ringScale: number;     // радиус первого кольца в радиусах сферы
  ringTilt: number;      // сплюснутость кольца (0 — линия, 1 — круг)
  ringRot: number;       // рад
  moons: number;         // точки на кольце — «события» дня
};

/** FNV-1a 32 бита. */
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Детерминированный ГПСЧ от сида (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Сид = хэш (текст + палитра фото + аудио-признаки/метаданные песни + createdAt). */
export function orbSeed(s: OrbSource): number {
  const pal = s.photo ? s.photo.palette.map((p) => `${p.hex}:${r3(p.weight)}`).join(',') : s.tokens.palette.join(',');
  const a = s.audio;
  const audio = a ? [a.source, a.bpm, r3(a.energy), r3(a.brightness), a.mode, a.key ?? ''].join(':') : '';
  const meta = s.meta ? [s.meta.title ?? '', s.meta.artist ?? '', s.meta.year ?? '', s.meta.genre ?? ''].join(':') : '';
  return fnv([s.text.trim(), pal, audio, meta, s.createdAt].join('|'));
}

const rgb01 = (hex: string): Vec3 => { const [r, g, b] = hexToRgb(hex); return [r / 255, g / 255, b / 255]; };

/** Почти белые цвета палитры прижимаются по светлоте (оттенок и насыщенность — те же):
 *  свет, блик и подсветка края иначе выжигают сферу в белое пятно, и на светлом фоне она пропадает. */
function capLight(hex: string, maxL: number): Vec3 {
  const [h, s, l] = hexToHsl(hex);
  return rgb01(l <= maxL ? hex : hslToHex([h, Math.max(s, 0.18), maxL]));
}

/** Цвет палитры, наиболее далёкий по оттенку от ядра и оболочки — для полос и прожилок. */
function pickAccent(palette: string[], core: string, rim: string): string {
  const hd = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const [hc] = hexToHsl(core), [hr] = hexToHsl(rim);
  let best = palette[palette.length - 1], score = -1;
  for (const c of palette) {
    const [h, s, l] = hexToHsl(c);
    const v = Math.min(hd(h, hc), hd(h, hr)) * (0.3 + s) * (l > 0.08 && l < 0.95 ? 1 : 0.3);
    if (v > score) { score = v; best = c; }
  }
  return best;
}

/** Направление и сила света по времени суток (физика освещения, не настроение). */
function daylight(daypart: MoodProfile['daypart']) {
  switch (daypart) {
    case 'dawn': return { x: -0.75, y: 0.12, intensity: 0.75, warm: 0.7, rim: 0.6 };
    case 'day': return { x: -0.35, y: 0.7, intensity: 1, warm: 0.35, rim: 0.45 };
    case 'dusk': return { x: 0.7, y: 0.08, intensity: 0.8, warm: 0.95, rim: 0.75 };
    case 'night': return { x: -0.15, y: 0.45, intensity: 0.35, warm: 0.05, rim: 0.95 };
    default: return { x: -0.45, y: 0.55, intensity: 0.85, warm: 0.5, rim: 0.55 };
  }
}

/** Поле шума повторно не используется: дни с разницей смещения ≥ 1 клетки дают несвязанный рисунок. */
export const PATTERN_SPAN = 97;

export function orbParams(s: OrbSource): OrbParams {
  const { mood, tokens, photo, audio } = s;
  const seed = orbSeed(s);
  const rnd = rng(seed);
  const phase = [rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd()];

  const accentHex = pickAccent(tokens.palette, tokens.orb.core, tokens.orb.rim);
  const tech = tokens.technique;
  const night = mood.daypart === 'night' ? 1 : mood.daypart === 'dusk' ? 0.45 : 0;
  const minor = mood.mode === 'minor' ? 1 : mood.mode === 'mixed' ? 0.5 : 0;
  const photoDark = photo ? 1 - photo.brightness : 0.4;
  const energy = audio ? lerp(mood.arousal, audio.energy, audioTrust(audio)) : mood.arousal; // как в style-engine

  // Тяжесть/темнота сферы: непрерывная функция настроения, времени суток, лада и света фото
  const depth = clamp(((1 - mood.valence) - 0.3) * 1.15 + night * 0.28 + minor * 0.12 + (photoDark - 0.5) * 0.3);

  // Внутренняя структура: плотность дня и признаки техники (условия техник — в style-engine)
  const ma = tech === 'ma' ? 1 : 0;
  const quiet = 1 - 0.55 * ma; // «ма»: пустота как содержание — структура разреживается
  const bands = clamp((tokens.sharpness * 0.55 + tempoNorm(mood.tempo) * 0.35 + (tech === 'geometric' ? 0.35 : 0)) * quiet);
  const swirl = clamp((mood.arousal * 0.5 + mood.contrast * 0.35 + tokens.brush * 0.3 + (tech === 'softStrokes' ? 0.15 : 0)) * quiet);
  const particles = clamp((mood.density * 0.6 + Math.min((photo?.count ?? 0) / 8, 0.3) + (tech === 'collage' ? 0.3 : 0) + (tech === 'filmNight' ? 0.15 : 0)) * quiet);
  const veins = clamp((mood.contrast * 0.5 + (1 - mood.valence) * 0.35 + (tech === 'filmNight' ? 0.25 : 0)) * quiet);

  const L = daylight(mood.daypart);
  const photos = photo?.count ?? 0;
  const events = mood.motifs.length;

  return {
    seed,
    offset: [phase[4] * PATTERN_SPAN, phase[5] * PATTERN_SPAN],
    swirlCenter: [(phase[6] - 0.5) * 0.5, (phase[7] - 0.5) * 0.5],
    core: capLight(tokens.orb.core, 0.8), shell: capLight(tokens.orb.rim, 0.72), accent: capLight(accentHex, 0.75),
    contrast: mood.contrast,
    depth,
    deform: 0.01 + mood.arousal * 0.05,
    deformFreq: 1.2 + phase[0] * 1.6,
    bands, swirl, particles, veins,
    bandAngle: phase[1] * Math.PI,
    flow: phase[2] < 0.5 ? -1 : 1,
    grain: clamp(energy * 0.75 + tokens.grain * 0.25),
    breath: tokens.orb.breath,
    spin: (mood.tempo / 60) * 0.045,
    light: { x: L.x + (phase[3] - 0.5) * 0.16, y: L.y + (phase[0] - 0.5) * 0.12, intensity: L.intensity, warm: L.warm },
    rimLight: L.rim,
    glow: clamp(tokens.orb.glow * (1 - depth * 0.45)),
    rings: photos <= 0 ? 0 : Math.min(3, Math.ceil(photos / 2)),
    ringScale: 1.2 + mood.density * 0.1, // + 0.1 на каждое следующее кольцо; максимум 1.5 радиуса — кольца не выходят из кадра
    ringTilt: 0.2 + phase[3] * 0.22,
    ringRot: (phase[1] - 0.5) * 0.7,
    moons: Math.min(6, events),
  };
}

// ---------- Визуальный дескриптор и расстояние (для теста уникальности) ----------

/** OKLab — перцептивно равномерное пространство: ΔE ≈ 0.02 — порог различимости. */
function oklab([r, g, b]: Vec3): Vec3 {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675778 * s,
  ];
}

export type OrbDescriptor = {
  palette: Vec3[];   // ядро, оболочка, акцент — в OKLab, с учётом темноты
  structure: number[];
  pattern: [number, number]; // смещение поля шума (клетки)
  shape: number[];
};

/** Что видно глазу: цвета (с затемнением), структура (веса + ориентация/фаза), форма (деформация, кольца). */
export function orbDescriptor(p: OrbParams): OrbDescriptor {
  const dim = 1 - p.depth * 0.68; // как в шейдере
  const shade = (c: Vec3): Vec3 => oklab([c[0] * dim, c[1] * dim, c[2] * dim]);
  const a2 = p.bandAngle * 2; // полосы симметричны при повороте на π
  return {
    palette: [shade(p.core), shade(p.shell), shade(p.accent)],
    structure: [
      p.bands, p.swirl, p.particles, p.veins,
      p.bands * Math.cos(a2) * 0.5, p.bands * Math.sin(a2) * 0.5,
      p.swirl * p.flow * 0.5,
      p.swirl * p.swirlCenter[0], p.swirl * p.swirlCenter[1],
    ],
    pattern: p.offset,
    shape: [p.deform * 8, (p.deformFreq - 1.2) / 1.6 * 0.4, p.rings / 3, p.rings ? p.ringTilt * 1.5 : 0, p.moons / 6, p.rings ? p.ringRot : 0],
  };
}

const dist = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));

/** Пороги различимости по каждому аспекту (обоснование — в scripts/orb-uniqueness.ts). */
export const ORB_JND = { palette: 0.04, structure: 0.15, shape: 0.12 } as const;

export function orbDistance(a: OrbDescriptor, b: OrbDescriptor) {
  const palette = (dist(a.palette[0], b.palette[0]) + dist(a.palette[1], b.palette[1]) + dist(a.palette[2], b.palette[2])) / 3;
  // рисунок: сдвиг поля на ≥ 1 клетку шума — другой рисунок (вклад 0.2, это > порога структуры)
  const pattern = Math.min(1, dist(a.pattern, b.pattern)) * 0.2;
  const structure = Math.sqrt(dist(a.structure, b.structure) ** 2 + pattern ** 2);
  const shape = dist(a.shape, b.shape);
  // суммарное различие в единицах порогов; ≥ 1 — заметно отличаются
  const total = Math.sqrt((palette / ORB_JND.palette) ** 2 + (structure / ORB_JND.structure) ** 2 + (shape / ORB_JND.shape) ** 2);
  return { palette, structure, shape, total };
}

/**
 * Короткая «подпись настроения» сферы — для проверки разнообразия seed-дневника.
 * Температура — по оси b OKLab (b > 0 — жёлто-тёплое, b < 0 — сине-холодное): перцептивно, без словарей.
 */
export function orbMoodClass(p: OrbParams) {
  const [, , bCore] = oklab(p.core), [, , bShell] = oklab(p.shell);
  const lum = (luminance(hex(p.core)) + luminance(hex(p.shell))) / 2 * (1 - p.depth * 0.68);
  const tone = p.depth >= 0.5 || lum < 0.28 ? 'dark' : lum > 0.5 ? 'light' : 'mid';
  const mean = (bCore + bShell) / 2;
  const temp = p.contrast >= 0.35 && bCore * bShell < 0 && Math.abs(bCore - bShell) > 0.06 ? 'mixed'
    : mean > 0.02 ? 'warm' : mean < -0.02 ? 'cool' : 'neutral';
  const motion = p.swirl + p.bands > 0.95 ? 'active' : 'calm';
  return { tone, temp, motion, key: `${tone}/${temp}/${motion}` };
}

const hex = (c: Vec3) => '#' + c.map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('');
