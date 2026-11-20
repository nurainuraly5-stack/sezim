// Демо-дневник: дни из public/seed/seed-v2 проходят обычный конвейер создания дня —
// фото → палитра и свет, текст → /api/analyze (LLM или упрощённый анализ), ссылка → oEmbed и честная оценка.
// Ничего не подставляется вручную: ни название, ни настроение, ни палитра, ни техника.
import { analyzePhotos, resizePhoto } from '@/core/analyze/photo';
import { linkAudio } from '@/core/analyze/song-link';
import { analyzeRemote, createDay } from './pipeline';
import { db } from './db';
import { SEED_DAYS, SEED_DIR, SEED_VERSION, type SeedMeta, type SeedSong } from './seed-data';

const FLAG = 'sezim:seeded';
let running: Promise<void> | null = null;

type Progress = (i: number, n: number) => void | Promise<void>;

/** При первом открытии собирает демо-дневник; старый набор seed-дней (другая версия) заменяет.
 *  Если человек сам удалил демо-дни, они не возвращаются. onProgress(i, n) — прогресс на экране. */
export function seedIfEmpty(onProgress?: Progress): Promise<void> {
  if (running) return running;
  running = (async () => {
    const flag = readFlag();
    if (flag === SEED_VERSION) return;
    const all = await db.days.toArray();
    const oldSeed = all.filter((d) => d.seed);
    if (flag && !oldSeed.length) { writeFlag(); return; } // демо-дни были удалены — уважаем это
    if (!flag && all.length > oldSeed.length) return;      // свой дневник без демо — не вмешиваемся
    await db.days.bulkDelete(oldSeed.map((d) => d.id));
    await build(onProgress);
  })().finally(() => { running = null; });
  return running;
}

/** Пересобрать демо-дни заново (например, когда на сервере появился ключ LLM): `/?reseed=1`. */
export async function reseed(onProgress?: Progress) {
  if (running) await running;
  const seedIds = (await db.days.toArray()).filter((d) => d.seed).map((d) => d.id);
  await db.days.bulkDelete(seedIds);
  try { localStorage.removeItem(FLAG); } catch {}
  await seedIfEmpty(onProgress);
}

async function build(onProgress?: Progress) {
  const n = SEED_DAYS.length;
  await onProgress?.(0, n);
  // все дни готовятся параллельно (сеть, анализ фото, LLM), сохраняются по порядку — сферы появляются по одной
  const prepared = SEED_DAYS.map((s) => prepare(s).catch((e) => { console.warn('seed day failed', s.dir, e); return null; }));
  let failed = 0;
  for (let i = 0; i < n; i++) {
    const p = await prepared[i];
    if (!p) { failed++; continue; }
    try {
      await createDay({
        text: p.text, photos: p.photos, photoFeatures: p.photoFeatures, date: p.meta.date,
        audio: linkAudio(p.remote?.songMeta ?? undefined, {}),
        song: { kind: 'link', url: p.song.url },
      }, { seed: true, createdAt: Date.parse(p.meta.date), remote: p.remote, authorTitle: p.meta.userTitleHint });
    } catch (e) {
      console.warn('seed day not saved', SEED_DAYS[i].dir, e); // один день не сохранился — остальные всё равно появятся
      failed++;
    }
    await onProgress?.(i + 1, n);
  }
  if (!failed) writeFlag(); // не всё загрузилось — при следующем открытии демо-дни соберутся заново
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

function readFlag() {
  try { return localStorage.getItem(FLAG); } catch { return null; }
}
function writeFlag() {
  try { localStorage.setItem(FLAG, SEED_VERSION); } catch {}
}
