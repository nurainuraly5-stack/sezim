// Демо-дневник: дни из public/seed/seed-v2 проходят обычный конвейер создания дня —
// фото → палитра и свет, текст → /api/analyze (LLM или упрощённый анализ), ссылка → oEmbed и честная оценка.
// Ничего не подставляется вручную: ни название, ни настроение, ни палитра, ни техника.
import { analyzePhotos, resizePhoto } from '@/core/analyze/photo';
import { linkAudio } from '@/core/analyze/song-link';
import { analyzeRemote, createDay } from './pipeline';
import { SEED_REMOVED_KEY, cacheGet, cacheSet, db } from './db';
import { SEED_DAYS, SEED_DIR, SEED_VERSION, type SeedMeta, type SeedSong } from './seed-data';

/** Флаг прошлых версий в localStorage. Больше не читается: он переживал очистку IndexedDB и прерванную сборку
 *  и тогда навсегда выключал демо-дневник (пустой архив на «обжитом» десктопном профиле). Только удаляем. */
const LEGACY_FLAG = 'sezim:seeded';
let running: Promise<void> | null = null;

type Progress = (i: number, n: number) => void | Promise<void>;

/** id демо-дня постоянный: по нему видно, какие дни набора уже записаны, а повторная сборка
 *  (другая вкладка, прерванный заход) перезаписывает день, а не дублирует. */
export const seedDayId = (dir: string) => `seed-${SEED_VERSION}-${dir}`;

/** Достраивает демо-дневник до полного набора по тому, что реально лежит в базе: недостающие дни собираются
 *  (в том числе после прерванной или частично упавшей сборки), дни старого набора заменяются.
 *  Дни, которые человек удалил сам, не возвращаются. onProgress(i, n) — прогресс на экране. */
export function seedIfEmpty(onProgress?: Progress): Promise<void> {
  if (running) return running;
  running = (async () => {
    try { localStorage.removeItem(LEGACY_FLAG); } catch {}
    const removed = new Set((await cacheGet<string[]>(SEED_REMOVED_KEY)) ?? []);
    const current = new Set(SEED_DAYS.map((s) => seedDayId(s.dir)));
    const seedIds = (await db.days.filter((d) => !!d.seed).primaryKeys()) as string[];
    const stale = seedIds.filter((id) => !current.has(id));
    if (stale.length) await db.days.bulkDelete(stale);
    const have = new Set(seedIds);
    const missing = SEED_DAYS.filter((s) => !have.has(seedDayId(s.dir)) && !removed.has(seedDayId(s.dir)));
    if (missing.length) await build(missing, onProgress);
  })().finally(() => { running = null; });
  return running;
}

/** Пересобрать демо-дни заново (например, когда на сервере появился ключ LLM): `/?reseed=1`.
 *  Возвращает и удалённые вручную. */
export async function reseed(onProgress?: Progress) {
  if (running) await running;
  const seedIds = (await db.days.filter((d) => !!d.seed).primaryKeys()) as string[];
  await db.days.bulkDelete(seedIds);
  await cacheSet(SEED_REMOVED_KEY, []);
  await seedIfEmpty(onProgress);
}

async function build(days: typeof SEED_DAYS, onProgress?: Progress) {
  const n = days.length;
  await onProgress?.(0, n);
  // все дни готовятся параллельно (сеть, анализ фото, LLM), сохраняются по порядку — сферы появляются по одной;
  // день, который не собрался, просто остаётся недостающим и соберётся при следующем открытии архива
  const prepared = days.map((s) => prepare(s).catch((e) => { console.warn('seed day failed', s.dir, e); return null; }));
  for (let i = 0; i < n; i++) {
    const p = await prepared[i];
    if (p) {
      try {
        await createDay({
          text: p.text, photos: p.photos, photoFeatures: p.photoFeatures, date: p.meta.date,
          audio: linkAudio(p.remote?.songMeta ?? undefined, {}),
          song: { kind: 'link', url: p.song.url },
        }, { id: seedDayId(days[i].dir), seed: true, createdAt: Date.parse(p.meta.date), remote: p.remote, authorTitle: p.meta.userTitleHint });
      } catch (e) {
        console.warn('seed day not saved', days[i].dir, e); // один день не сохранился — остальные всё равно появятся
      }
    }
    await onProgress?.(i + 1, n);
  }
}

async function prepare(s: (typeof SEED_DAYS)[number]) {
  const base = `${SEED_DIR}/${s.dir}/`;
  const get = async (f: string) => {
    const r = await fetch(base + f);
    if (!r.ok) throw new Error(`${base + f}: ${r.status}`);
    return r;
  };
  const [text, song, meta, raw] = await Promise.all([
    get('text.md').then((r) => r.text()),
    get('song.json').then((r) => r.json() as Promise<SeedSong>),
    get('meta.json').then((r) => r.json() as Promise<SeedMeta>),
    Promise.all(s.photos.map((f) => get(f).then((r) => r.blob()))),
  ]);
  const photos = await Promise.all(raw.map((b) => resizePhoto(b, 1000)));
  const [photoFeatures, remote] = await Promise.all([analyzePhotos(photos), analyzeRemote(text.trim(), song.url)]);
  return { text: text.trim(), song, meta, photos, photoFeatures, remote };
}
