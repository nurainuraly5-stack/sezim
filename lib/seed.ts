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

/** Не больше стольких запросов к модели одновременно: при шести параллельных API иногда отвечал дольше таймаута
 *  (9 с), и часть демо-дней уходила в упрощённый анализ. Фото и файлы грузятся без ограничения. */
const LLM_PARALLEL = 3;
/** Повторы подготовки дня внутри одной сборки: сбой сети на одном файле не должен оставлять в архиве 5 сфер из 6. */
const RETRIES = 2;

function limiter(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= n) await new Promise<void>((r) => queue.push(r));
    active++;
    try { return await fn(); } finally { active--; queue.shift()?.(); }
  };
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); } catch (e) {
      if (attempt >= RETRIES) throw e;
      console.warn(`seed ${label}: retry ${attempt + 1}`, e);
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
  }
}

async function build(days: typeof SEED_DAYS, onProgress?: Progress) {
  const n = days.length;
  await onProgress?.(0, n);
  // дни готовятся параллельно (сеть, анализ фото), к модели — не больше LLM_PARALLEL сразу; сохраняются по порядку —
  // сферы появляются по одной. День, который не собрался и после повторов, остаётся недостающим и соберётся
  // при следующем открытии архива
  const llm = limiter(LLM_PARALLEL);
  const prepared = days.map((s) => withRetry(s.dir, () => prepare(s, llm)).catch((e) => { console.warn('seed day failed', s.dir, e); return null; }));
  for (let i = 0; i < n; i++) {
    const p = await prepared[i];
    if (p) {
      try {
        await withRetry(`${days[i].dir} save`, () => createDay({
          text: p.text, photos: p.photos, photoFeatures: p.photoFeatures, date: p.meta.date,
          audio: linkAudio(p.remote?.songMeta ?? undefined, {}),
          song: { kind: 'link', url: p.song.url },
        }, { id: seedDayId(days[i].dir), seed: true, createdAt: Date.parse(p.meta.date), remote: p.remote, authorTitle: p.meta.userTitleHint }));
      } catch (e) {
        console.warn('seed day not saved', days[i].dir, e); // один день не сохранился — остальные всё равно появятся
      }
    }
    await onProgress?.(i + 1, n);
  }
}

async function prepare(s: (typeof SEED_DAYS)[number], llm: ReturnType<typeof limiter>) {
  const base = `${SEED_DIR}/${s.dir}/`;
  const get = async (f: string) => {
    const r = await fetch(base + f);
    if (!r.ok) throw new Error(`${base + f}: ${r.status}`);
    return r;
  };
  // текст и ссылка уходят в анализ (LLM, до 10 с) сразу, как только загружены, — параллельно со скачиванием и сжатием фото
  const textP = get('text.md').then((r) => r.text()).then((t) => t.trim());
  const songP = get('song.json').then((r) => r.json() as Promise<SeedSong>);
  const remoteP = Promise.all([textP, songP]).then(([t, sg]) => llm(() => analyzeRemote(t, sg.url)));
  const photosP = Promise.all(s.photos.map((f) => get(f).then((r) => r.blob()).then((b) => resizePhoto(b, 1000))));
  const photoFeaturesP = photosP.then(analyzePhotos);
  const [text, song, meta, photos, photoFeatures, remote] = await Promise.all([
    textP, songP, get('meta.json').then((r) => r.json() as Promise<SeedMeta>), photosP, photoFeaturesP, remoteP,
  ]);
  return { text, song, meta, photos, photoFeatures, remote };
}
