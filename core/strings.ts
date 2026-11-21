// Все строки интерфейса в одном месте (язык по умолчанию — RU).
import type { AudioFeatures } from './types';
import { MODE_SURE } from './analyze/audio';
export const S = {
  sloganEn: 'Days you can feel again.',
  archive: 'Архив',
  newDay: 'Новый день',
  // архив
  heroTitle: 'Твой мир воспоминаний',
  heroSub: 'Каждый день — своя сфера. Она собрана из твоего текста, фото и песни, и по ней видно, каким был день.',
  createMemory: 'Создать воспоминание',
  yourMemories: 'Твои воспоминания',
  search: 'Поиск по названию или дате',
  allDates: 'Все даты',
  nothingFound: 'По такому запросу дней нет.',
  resetFilter: 'Сбросить поиск',
  emptyArchive: 'Здесь пока пусто. Запиши первый день — он станет первой сферой.',
  noWebgl: 'Браузер не дал доступ к WebGL (отключено аппаратное ускорение или видеокарта в чёрном списке), поэтому сферы показаны упрощённо: те же цвета дня, без объёма и движения.',
  seeding: (i: number, n: number) => `Собираем демо-дневник: ${i} из ${n}`,
  shown: (k: number, n: number) => `${k} из ${n}`,
  momentsOfDay: 'Моменты дня',
  openDay: 'Открыть день',
  folder: 'Папка дня',
  playSong: 'Слушать песню',
  pauseSong: 'Пауза',
  songOfDay: 'Песня дня',
  metaEstimate: 'приблизительная оценка по метаданным: звук по ссылке не анализируется',
  linkSongHint: 'Знаешь песню? Поправь темп и лад — день пересчитается.',
  linkSongManual: 'Темп и лад заданы вручную, звук по ссылке не анализировался.',
  linkSongReset: 'Вернуть оценку',
  pickDay: 'Выбери сферу, чтобы посмотреть день.',
  viewOrbs: 'Сферы',
  viewFeed: 'Лента',
  viewLabel: 'Вид архива',
  feedLimit: (k: number, n: number) => `Последние ${k} дней подряд из ${n}. Остальные — в «Сферах» или через поиск.`,
  // день
  backToArchive: 'Назад к архиву',
  aboutDay: 'О чём этот день?',
  atmosphere: 'Атмосфера дня',
  listenDay: 'Слушать день',
  stopListening: 'Остановить',
  notDiagnosis: 'Это описание дня по тексту, фото и песне, а не оценка состояния человека.',
  photosCount: (n: number) => `${n} фото`,
  // A/B: другая песня
  compare: 'Сравнить с другой песней',
  compareText: 'Сравнить с другим текстом',
  compareKindSong: 'Другая песня',
  compareKindText: 'Другой текст',
  compareTitleText: 'Те же фото и песня, другой текст',
  compareSubText: 'Фото и песня те же. Обе версии посчитаны заново одним движком — всё различие от текста.',
  pickOtherText: 'Текст другого дня',
  pickOwnText: 'Свой текст',
  ownTextPlaceholder: 'Перепиши день по-другому — например, тот же вечер, но грустный.',
  recalc: 'Пересчитать',
  recalcBusy: 'Считаем…',
  thisText: 'A · текст этого дня',
  otherText: 'B · другой текст',
  whatTextChanged: 'Что изменил текст',
  chooseText: 'Выбери текст для сравнения.',
  rowMood: 'Светлость / возбуждение',
  rowWarm: 'Тепло / противоречие',
  compareTitle: 'Та же запись, другая песня',
  compareSub: 'Текст и фото те же. Обе версии посчитаны заново одним движком — всё различие от музыки.',
  compareClose: 'Закрыть сравнение',
  compareDrift: 'Версия A пересчитана заново и немного отличается от сохранённой: часть исходного анализа текста недоступна без сети.',
  pickOtherDay: 'Песня другого дня',
  pickFile: 'Свой файл',
  pickLink: 'Ссылка',
  pickFileBtn: 'Выбрать аудиофайл',
  thisSong: 'A · песня этого дня',
  otherSong: 'B · другая песня',
  whatMusicChanged: 'Что изменила музыка',
  chooseSong: 'Выбери песню для сравнения.',
  fileFailed: 'Файл не разобрался — попробуй другой (mp3, wav, m4a).',
  noSong: 'без песни',
  rowTechnique: 'Техника',
  rowRhythm: 'Смена кадров',
  rowBreath: 'Вдох сферы',
  rowTempo: 'Темп и лад',
  rowTexture: 'Зерно / резкость',
  every: (s: string) => `каждые ${s}`,
  onceIn: (s: string) => `раз в ${s}`,
  // создание
  writeTitle: 'Каким был твой день?',
  writeSub: 'Текст, хотя бы одно фото и песня. Сфера в превью меняется сразу, как только ты что-то добавляешь.',
  toPreview: 'Показать превью',
  textLabel: 'Текст о дне',
  dateLabel: 'Дата',
  titleLabel: 'Название дня',
  titleHint: '3–7 слов. Можно поправить сейчас или потом.',
  titleEmpty: 'Появится, когда напишешь пару фраз',
  linkKind: 'Ссылка',
  fileKind: 'Файл',
  textPlaceholder: 'Что ты видел, слышал, чувствовал. Детали: запахи, свет, погода, люди рядом…',
  photos: 'Фото',
  photosHint: 'Перетащи фото сюда или нажми, чтобы выбрать',
  song: 'Песня дня',
  songLinkPlaceholder: 'Ссылка: YouTube, Spotify, SoundCloud…',
  songFile: 'или файл (mp3, wav, m4a)',
  songTitle: 'Название песни',
  songArtist: 'Исполнитель',
  songYear: 'Год',
  tempo: 'Темп',
  mode: 'Лад',
  major: 'мажор',
  minor: 'минор',
  unknown: 'не знаю',
  analyzingAudio: 'Слушаем файл…',
  audioReal: 'анализ файла',
  audioMeta: 'оценка по метаданным, не анализ аудио',
  audioManual: 'задано вручную',
  create: 'Создать воспоминание',
  creating: 'Собираем воспоминание…',
  needText: 'Напиши хотя бы пару предложений о дне.',
  needPhoto: 'Добавь хотя бы одно фото.',
  needSong: 'Добавь песню: ссылку или файл.',
  saveFailed: 'Не получилось сохранить день. Попробуй ещё раз.',
  livePreview: 'Живое превью',
  whyTitle: 'Почему так выглядит',
  simplified: 'упрощённый анализ',
  llmOff: 'LLM выключен',
  llmOffHint: 'Текст разбирает упрощённый анализ без модели — так приложение работает без ключа и сети.',
  llmOn: 'Включить',
  llm: 'анализ текста: LLM',
  // день
  exportZip: 'Экспорт папки .zip',
  delete: 'Удалить день',
  confirmDelete: 'Удалить этот день навсегда?',
  voiceRendering: 'Озвучка: синтезируем голос…',
  rename: 'Переименовать',
  save: 'Сохранить',
  openSong: 'Открыть песню',
  notFound: 'День не найден',
  steps: ['Читаем текст', 'Смотрим фото', 'Слушаем песню', 'Ищем форму', 'Зажигаем сферу'],
} as const;

/** Короткое описание дня по непрерывным осям MoodProfile (пороги, а не словарь эмоций). */
export function moodSummary(m: { valence: number; arousal: number; warmth: number; contrast: number }): string {
  const temp = m.contrast >= 0.35 ? 'смешанный' : m.warmth >= 0.6 ? 'тёплый' : m.warmth <= 0.4 ? 'прохладный' : 'нейтральный';
  const pace = m.arousal >= 0.6 ? 'насыщенный' : m.arousal <= 0.35 ? 'спокойный' : 'размеренный';
  const light = m.valence <= 0.38 ? 'тяжёлый' : m.valence >= 0.62 ? 'светлый' : '';
  return [temp, pace, light].filter(Boolean).join(', ');
}

export const modeRu = (m: string) => (m === 'major' ? 'мажор' : m === 'minor' ? 'минор' : m === 'mixed' ? 'смешанный лад' : '');

/** Лад из файла определён неуверенно (петли вроде Am–F–C–G одинаково звучат в A minor и C major). */
export const modeApprox = (a?: AudioFeatures) =>
  !!a && a.source === 'audio' && a.mode !== 'unknown' && (a.modeConfidence ?? 1) < MODE_SURE;
/** «минор» или «≈ минор» — для чипов и подписей. */
export const audioModeRu = (a?: AudioFeatures) => {
  const m = a ? modeRu(a.mode) : '';
  return m && modeApprox(a) ? `≈ ${m}` : m;
};
/** «A minor» или «A minor или C major» (если вторая тональность почти так же вероятна). */
export const audioKeyRu = (a?: AudioFeatures) => (!a?.key ? '' : modeApprox(a) && a.keyAlt ? `${a.key} или ${a.keyAlt}` : a.key);

export const DAYPART_RU: Record<string, string> = {
  dawn: 'утро', day: 'день', dusk: 'вечер', night: 'ночь', unknown: '',
};

/** «среда» */
export function formatWeekday(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'long' });
}

/** «ноябрь 2026» — для фильтра по месяцу */
export function formatMonth(ym: string): string {
  const s = new Date(ym + '-15T12:00:00').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(/\s*г\.?$/, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Подпись под сферой: «18 нояб.», год — только если не текущий. */
export function formatDateShort(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** Короткая форма названия для подписи сферы: целые слова до max символов, дальше «…». */
export function shortTitle(title: string, max = 20): string {
  if (title.length <= max) return title;
  let out = '';
  for (const w of title.split(/\s+/)) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > max) break;
    out = next;
  }
  return `${(out || title.slice(0, max)).replace(/[,.;:—-]+$/, '')}…`;
}
