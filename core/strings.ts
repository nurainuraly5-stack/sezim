// Все строки интерфейса в одном месте (язык по умолчанию — RU).
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
  seeding: (i: number, n: number) => `Собираем демо-дневник: ${i} из ${n}`,
  shown: (k: number, n: number) => `${k} из ${n}`,
  momentsOfDay: 'Моменты дня',
  openDay: 'Открыть день',
  folder: 'Папка дня',
  playSong: 'Слушать песню',
  pauseSong: 'Пауза',
  songOfDay: 'Песня дня',
  metaEstimate: 'вид рассчитан по названию песни, не по звуку',
  pickDay: 'Выбери сферу, чтобы посмотреть день.',
  // день
  backToArchive: 'Назад к архиву',
  aboutDay: 'О чём этот день?',
  atmosphere: 'Атмосфера дня',
  listenDay: 'Слушать день',
  stopListening: 'Остановить',
  notDiagnosis: 'Это описание дня по тексту, фото и песне, а не оценка состояния человека.',
  photosCount: (n: number) => `${n} фото`,
  // создание
  writeTitle: 'Каким был твой день?',
  writeSub: 'Текст, хотя бы одно фото и песня. Сфера справа меняется сразу, как только ты что-то добавляешь.',
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
  livePreview: 'Живое превью',
  whyTitle: 'Почему так выглядит',
  simplified: 'упрощённый анализ',
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
  const temp = m.contrast >= 0.35 ? 'смешанный' : m.warmth >= 0.6 ? 'тёплый' : m.warmth <= 0.4 ? 'прохладный' : 'ровный';
  const pace = m.arousal >= 0.6 ? 'насыщенный' : m.arousal <= 0.35 ? 'спокойный' : 'размеренный';
  const light = m.valence <= 0.38 ? 'тяжёлый' : m.valence >= 0.62 ? 'светлый' : '';
  return [temp, pace, light].filter(Boolean).join(', ');
}

export const modeRu = (m: string) => (m === 'major' ? 'мажор' : m === 'minor' ? 'минор' : m === 'mixed' ? 'смешанный лад' : '');

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
