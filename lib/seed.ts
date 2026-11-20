// Seed-дневник: загрузка дней из lib/seed-data.ts при пустой базе.
// Фото — процедурные SVG-заглушки из public/seed (заменить на свои), музыка — процедурная (CC0), анализируется по-настоящему.
import { analyzePhotos, resizePhoto } from '@/core/analyze/photo';
import { analyzeAudioBuffer } from '@/core/analyze/audio';
import { createDay } from './pipeline';
import { renderSong, toWav } from './synth';
import { db } from './db';
import { SEED } from './seed-data';

let running: Promise<void> | null = null;

/** Автозагрузка при пустой базе. onProgress(i, n) — для анимации «собираем архив». */
export function seedIfEmpty(onProgress?: (i: number, n: number) => void | Promise<void>): Promise<void> {
  // onProgress(0, n) — сразу, как только ясно, что архив будет собираться (интерфейс показывает прогресс)
  if (running) return running;
  running = (async () => {
    if ((await db.days.count()) > 0) return;
    if (readFlag()) return; // пользователь удалил seed — не возвращаем
    await onProgress?.(0, SEED.length);
    for (let i = 0; i < SEED.length; i++) {
      const s = SEED[i];
      const raw = await Promise.all(s.photos.map((p) => fetch(p).then((r) => r.blob())));
      const photos = await Promise.all(raw.map((b) => resizePhoto(b, 1000)));
      const photoFeatures = await analyzePhotos(photos);
      const buf = await renderSong({ ...s.song, seconds: 12 });
      const audio = await analyzeAudioBuffer(buf);
      await createDay({
        text: s.text, photos, photoFeatures, date: s.date, audio,
        song: { kind: 'file', file: toWav(buf), fileName: 'song.wav', meta: { title: s.song.title, artist: 'Sezim procedural (CC0)', year: 2026 } },
      }, { seed: true, createdAt: Date.parse(s.date) }); // название — из анализа текста, без ручной подстановки
      await onProgress?.(i + 1, SEED.length); // сферы появляются по одной
    }
    try { localStorage.setItem('sezim:seeded', '1'); } catch {}
  })().finally(() => { running = null; });
  return running;
}

function readFlag() {
  try { return localStorage.getItem('sezim:seeded') === '1'; } catch { return false; }
}
