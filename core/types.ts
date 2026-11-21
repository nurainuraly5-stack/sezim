// Контракт Sezim. Менять только с явной причиной (см. комментарии «+»).

export type TechniqueId = 'softStrokes' | 'geometric' | 'filmNight' | 'ma' | 'collage';

export type MoodProfile = {
  valence: number; arousal: number; warmth: number; density: number; // 0..1
  tempo: number;            // BPM, оценка
  mode: 'major' | 'minor' | 'mixed' | 'unknown';
  daypart: 'dawn' | 'day' | 'dusk' | 'night' | 'unknown';
  contrast: number;         // внутреннее противоречие: холодно, но тепло
  motifs: string[];         // сенсорные детали из текста (3–6)
  quote: string;            // короткая фраза из текста для подписи
  title: string;            // 3–7 слов, единый тон
  voiceStyle: { pace: 'slow' | 'mid' | 'fast'; warmth: number };
};

export type StyleTokens = {
  palette: string[]; technique: TechniqueId; grain: number; brush: number;
  duotone: number; sharpness: number; rhythm: number; // сек между кадрами
  typeWeight: number; motion: { speed: number; easing: string };
  orb: { core: string; rim: string; glow: number; breath: number };
};

/** Признаки аудио. source честно говорит, откуда цифры. */
export type AudioFeatures = {
  source: 'audio' | 'meta' | 'manual';
  bpm: number;
  energy: number;        // 0..1, RMS
  brightness: number;    // 0..1, spectral centroid
  mode: 'major' | 'minor' | 'unknown';
  key?: string;          // напр. «A minor»
  confidence: number;    // 0..1
  modeConfidence?: number; // + 0..1 уверенность именно лада (ниже MODE_SURE — «≈»); нет у старых дней и оценок
  keyAlt?: string;       // + почти так же вероятная параллельная тональность (A minor ↔ C major)
  duration?: number;     // сек
};

/** Признаки фото (+ к контракту: нужны стиль-движку и «Почему»). */
export type PhotoFeatures = {
  palette: { hex: string; weight: number }[];
  brightness: number; contrast: number; saturation: number;
  warmth: number;        // 0 холодно .. 1 тепло
  count: number;
  accent?: string;       // + яркий цвет меньшинства пикселей (салют, гирлянда), добавлен в палитру
};

/** Признаки текста — то, что возвращает /api/analyze или fallback. */
export type TextFeatures = Pick<MoodProfile,
  'valence' | 'warmth' | 'density' | 'daypart' | 'contrast' | 'motifs' | 'quote' | 'title' | 'voiceStyle'> & {
  arousal: number;
  /** тёплые и холодные детали отдельно — для двухслойной сферы */
  warmMotifs: string[]; coldMotifs: string[];
  wordCount: number;
  engine: 'llm' | 'fallback';
};

export type SongMeta = { title?: string; artist?: string; year?: number; genre?: string };

export type DayEntry = {
  id: string; date: string; text: string; photos: Blob[];
  song: {
    kind: 'file' | 'link'; url?: string; meta?: SongMeta; analysis?: AudioFeatures;
    file?: Blob; fileName?: string; // + файл песни хранится в папке дня
  };
  mood: MoodProfile; tokens: StyleTokens; explain: string[]; voice?: Blob; createdAt: number;
  thumb?: Blob;                        // + миниатюра сферы (PNG) для архива и thumb.png папки
  thumbV?: number;                     // + версия рендера миниатюры: устаревшие перерисовываются
  analysisEngine?: 'llm' | 'fallback'; // + честная пометка «упрощённый анализ»
  photoFeatures?: PhotoFeatures;       // + для «Почему» и A/B
  seed?: boolean;                      // + день из seed-дневника
  authorTitle?: string;                // + рабочее название автора (seed meta.json) — только справка, не название дня
  styleV?: number;                     // + версия Style Engine: дни старой версии пересчитываются из своих признаков
};
