// Манифест демо-дневника: только пути. Содержимое дня — файлы папки public/seed/seed-v2/day-N/
// (text.md, photo-*.jpg, song.json — ссылка, meta.json — дата и рабочее название автора).
// Название, настроение, палитру и технику выдаёт обычный конвейер, здесь их нет.
// Без браузерных зависимостей: манифест читают и lib/seed.ts, и node-тесты.

/** Версия набора: сменилась → старые seed-дни у посетителя заменяются новыми. */
export const SEED_VERSION = 'v2';
export const SEED_DIR = '/seed/seed-v2';

export const SEED_DAYS: { dir: string; photos: string[] }[] = [
  { dir: 'day-1', photos: ['photo-1.jpg'] },
  { dir: 'day-2', photos: ['photo-1.jpg', 'photo-2.jpg'] },
  { dir: 'day-3', photos: ['photo-1.jpg'] },
  { dir: 'day-4', photos: ['photo-1.jpg', 'photo-2.jpg'] },
  { dir: 'day-5', photos: ['photo-1.jpg'] },
  { dir: 'day-6', photos: ['photo-1.jpg', 'photo-2.jpg'] },
];

export type SeedSong = { kind: 'link'; provider?: string; url: string };
export type SeedMeta = { day: number; date: string; userTitleHint?: string };
