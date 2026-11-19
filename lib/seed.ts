// Seed-дневник: 6 вымышленных дней одного автора, 5 разных настроений.
// Фото — процедурные SVG-заглушки из public/seed (заменить на свои), музыка — процедурная (CC0), анализируется по-настоящему.
import { analyzePhotos, resizePhoto } from '@/core/analyze/photo';
import { analyzeAudioBuffer } from '@/core/analyze/audio';
import { createDay } from './pipeline';
import { renderSong, toWav, type SynthSpec } from './synth';
import { db } from './db';

type SeedDay = { date: string; title: string; text: string; photos: string[]; song: SynthSpec & { title: string } };

export const SEED: SeedDay[] = [
  {
    date: '2026-11-13', title: 'Первый снег и тёплое какао',
    text: 'Утром проснулась рано, за окном первый снег и серый ноябрь. Холодно, ветер в лицо по дороге до остановки. Но вечером дома было тёплое какао, плед и лампа на подоконнике, и всё как будто оттаяло.',
    photos: ['/seed/winter-window.svg', '/seed/rain-street.svg'],
    song: { title: 'Первый снег (Sezim procedural)', bpm: 74, root: 57, mode: 'minor', energy: 0.25, brightness: 0.35 },
  },
  {
    date: '2026-11-14', title: 'Сдала за пять минут до конца',
    text: 'Дедлайн проекта. Весь день бегом: созвон, код, ещё созвон, опять код. Кофе остыл, в голове шум. В метро толпа, в чате сто сообщений. Успела сдать за пять минут до конца, сердце колотилось!',
    photos: ['/seed/desk-deadline.svg', '/seed/city-night.svg'],
    song: { title: 'Deadline Pulse (Sezim procedural)', bpm: 140, root: 50, mode: 'minor', energy: 0.9, brightness: 0.8 },
  },
  {
    date: '2026-11-15', title: 'Солнце на столе',
    text: 'Тихое утро. Солнце на столе, чай. Никуда не спешила.',
    photos: ['/seed/morning-kitchen.svg'],
    song: { title: 'Утро на кухне (Sezim procedural)', bpm: 72, root: 60, mode: 'major', energy: 0.18, brightness: 0.45 },
  },
  {
    date: '2026-11-16', title: 'Солёный закат и смех до щёк',
    text: 'Поехали с друзьями к морю. Тёплый песок, закат, мы смеялись так, что болели щёки. Солнце садилось медленно, и было очень спокойно и светло.',
    photos: ['/seed/sea-dusk.svg', '/seed/field-noon.svg'],
    song: { title: 'Солёный закат (Sezim procedural)', bpm: 96, root: 62, mode: 'major', energy: 0.45, brightness: 0.6 },
  },
  {
    date: '2026-11-17', title: 'Мокрый асфальт после концерта',
    text: 'Ночью после концерта шли пешком через весь город. Фонари, мокрый асфальт, звон в ушах. Немного грустно, что всё закончилось, но в голове ещё играла последняя песня.',
    photos: ['/seed/concert.svg', '/seed/city-night.svg', '/seed/rain-street.svg'],
    song: { title: 'After the Show (Sezim procedural)', bpm: 118, root: 52, mode: 'minor', energy: 0.6, brightness: 0.5 },
  },
  {
    date: '2026-11-18', title: 'Пирог, лес и все свои',
    text: 'День рождения бабушки. Утром пекли пирог на кухне, потом приехали все: тёти, двоюродные братья, соседи. Гуляли в лесу, фотографировались у поля, пели за столом, мама плакала от смеха. Вернулись поздно, уставшие и счастливые.',
    photos: ['/seed/morning-kitchen.svg', '/seed/forest-mist.svg', '/seed/field-noon.svg', '/seed/sea-dusk.svg', '/seed/winter-window.svg'],
    song: { title: 'Семейный стол (Sezim procedural)', bpm: 112, root: 55, mode: 'major', energy: 0.65, brightness: 0.65 },
  },
];

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
      }, { seed: true, createdAt: Date.parse(s.date), titleOverride: s.title });
      await onProgress?.(i + 1, SEED.length); // сферы появляются по одной
    }
    try { localStorage.setItem('sezim:seeded', '1'); } catch {}
  })().finally(() => { running = null; });
  return running;
}

function readFlag() {
  try { return localStorage.getItem('sezim:seeded') === '1'; } catch { return false; }
}
