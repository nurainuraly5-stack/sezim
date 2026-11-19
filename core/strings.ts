// Все строки интерфейса в одном месте (язык по умолчанию — RU).
export const S = {
  brand: 'Sezim',
  slogan: 'Дни, которые можно почувствовать снова',
  sloganEn: 'Days you can feel again.',
  archive: 'Архив',
  newDay: 'Новый день',
  viewOrbs: 'Сферы',
  viewStrip: 'Лента',
  search: 'Поиск по названию или дате',
  nothingFound: 'Ничего не нашлось',
  emptyArchive: 'Пока ни одного дня. Запишите первый.',
  seeding: 'Собираем архив…',
  // создание
  writeTitle: 'Каким был день?',
  textPlaceholder: 'Что вы видели, слышали, чувствовали. Детали: запахи, свет, погода, люди…',
  photos: 'Фото',
  photosHint: 'Перетащите фото сюда или нажмите, чтобы выбрать (хотя бы одно)',
  song: 'Песня дня',
  songLinkPlaceholder: 'Ссылка: YouTube, Spotify, SoundCloud…',
  songFile: 'или файл (mp3, wav, m4a)',
  songTitle: 'Название песни (необязательно)',
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
  create: 'Собрать воспоминание',
  creating: 'Собираем день…',
  needText: 'Напишите хотя бы пару предложений',
  needPhoto: 'Добавьте хотя бы одно фото',
  needSong: 'Добавьте песню: ссылку или файл',
  livePreview: 'Живое превью',
  whyTitle: 'Почему так выглядит',
  simplified: 'упрощённый анализ',
  llm: 'анализ текста: LLM',
  // день
  enter: 'Войти в день',
  enterHint: 'со звуком',
  back: 'Архив',
  why: 'Почему',
  exportZip: 'Экспорт папки .zip',
  delete: 'Удалить день',
  confirmDelete: 'Удалить этот день навсегда?',
  voice: 'Озвучка',
  voiceLive: 'голос браузера',
  voiceSaved: 'синтезированный голос',
  voiceStop: 'Остановить озвучку',
  voiceRendering: 'Озвучка: синтезируем голос…',
  voiceNone: 'Озвучка недоступна: в браузере нет русского голоса',
  rename: 'Переименовать',
  save: 'Сохранить',
  openSong: 'Открыть песню',
  notFound: 'День не найден',
  steps: ['Читаем текст', 'Смотрим фото', 'Слушаем песню', 'Ищем форму', 'Зажигаем сферу'],
} as const;

export const DAYPART_RU: Record<string, string> = {
  dawn: 'утро', day: 'день', dusk: 'вечер', night: 'ночь', unknown: '',
};

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
