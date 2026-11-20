// Данные seed-дневника: 6 вымышленных дней одного автора, 5 разных настроений. Без браузерных зависимостей —
// их читают и lib/seed.ts, и node-тесты. Названий здесь нет: их выводит анализ текста, как у любого дня.
import type { SynthSpec } from './synth';

export type SeedDay = { date: string; text: string; photos: string[]; song: SynthSpec & { title: string } };

export const SEED: SeedDay[] = [
  {
    date: '2026-11-13',
    text: 'Утром проснулась рано, за окном первый снег и серый ноябрь. Холодно, ветер в лицо по дороге до остановки. Но вечером дома было тёплое какао, плед и лампа на подоконнике, и всё как будто оттаяло.',
    photos: ['/seed/winter-window.svg', '/seed/rain-street.svg'],
    song: { title: 'Первый снег (Sezim procedural)', bpm: 74, root: 57, mode: 'minor', energy: 0.25, brightness: 0.35 },
  },
  {
    date: '2026-11-14',
    text: 'Дедлайн проекта. Весь день бегом: созвон, код, ещё созвон, опять код. Кофе остыл, в голове шум. В метро толпа, в чате сто сообщений. Успела сдать за пять минут до конца, сердце колотилось!',
    photos: ['/seed/desk-deadline.svg', '/seed/city-night.svg'],
    song: { title: 'Deadline Pulse (Sezim procedural)', bpm: 140, root: 50, mode: 'minor', energy: 0.9, brightness: 0.8 },
  },
  {
    date: '2026-11-15',
    text: 'Тихое утро. Солнце на столе, чай. Никуда не спешила.',
    photos: ['/seed/morning-kitchen.svg'],
    song: { title: 'Утро на кухне (Sezim procedural)', bpm: 72, root: 60, mode: 'major', energy: 0.18, brightness: 0.45 },
  },
  {
    date: '2026-11-16',
    text: 'Поехали с друзьями к морю. Тёплый песок, закат, мы смеялись так, что болели щёки. Солнце садилось медленно, и было очень спокойно и светло.',
    photos: ['/seed/sea-dusk.svg', '/seed/field-noon.svg'],
    song: { title: 'Солёный закат (Sezim procedural)', bpm: 96, root: 62, mode: 'major', energy: 0.45, brightness: 0.6 },
  },
  {
    date: '2026-11-17',
    text: 'Ночью после концерта шли пешком через весь город. Фонари, мокрый асфальт, звон в ушах. Немного грустно, что всё закончилось, но в голове ещё играла последняя песня.',
    photos: ['/seed/concert.svg', '/seed/city-night.svg', '/seed/rain-street.svg'],
    song: { title: 'After the Show (Sezim procedural)', bpm: 118, root: 52, mode: 'minor', energy: 0.6, brightness: 0.5 },
  },
  {
    date: '2026-11-18',
    text: 'День рождения бабушки. Утром пекли пирог на кухне, потом приехали все: тёти, двоюродные братья, соседи. Гуляли в лесу, фотографировались у поля, пели за столом, мама плакала от смеха. Вернулись поздно, уставшие и счастливые.',
    photos: ['/seed/morning-kitchen.svg', '/seed/forest-mist.svg', '/seed/field-noon.svg', '/seed/sea-dusk.svg', '/seed/winter-window.svg'],
    song: { title: 'Семейный стол (Sezim procedural)', bpm: 112, root: 55, mode: 'major', energy: 0.65, brightness: 0.65 },
  },
];
