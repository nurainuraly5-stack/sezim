# PROGRESS — Sezim

_Обновлено: чт 19.11.2026_

## Сделано
- Скелет Next.js 15 (App Router) + TypeScript + Tailwind 4.
- Зависимости: `dexie` (IndexedDB), `zod` (валидация LLM), `motion` (UI-анимации), `jszip` (экспорт папки дня),
  `@anthropic-ai/sdk` (LLM-провайдер), `server-only` (ключи не попадают в клиент).
- `core/types.ts` — контракт (MoodProfile, StyleTokens, DayEntry + AudioFeatures, PhotoFeatures, TextFeatures).
- `core/analyze/text-fallback.ts` — анализ текста без LLM (русские маркеры: тепло/холод, время суток, противоречие, мотивы, цитата, название).
- `core/analyze/photo.ts` — ресайз ≤1600px, палитра (свой детерминированный k-means), яркость/контраст/насыщенность/температура.
- `core/analyze/audio.ts` — реальный анализ файла: свой FFT, BPM (автокорреляция spectral flux), энергия, centroid, лад (хрома + Крумхансл).
- `core/analyze/song-link.ts` — YouTube/Spotify/SoundCloud embed + честная оценка темпа/лада по метаданным.
- `core/mood.ts` — признаки → MoodProfile; `core/style-engine.ts` — 5 техник с явными условиями, палитра, сфера (оболочка/ядро), explain[].
- `lib/db.ts` (Dexie), `lib/zip.ts` (экспорт папки .zip), `core/strings.ts` (RU-строки).
- `/api/analyze` (Anthropic, zod, таймаут 8 с, oEmbed), `/api/tts` (openai | elevenlabs, 501 → speechSynthesis), `.env.example`.
- `core/gl/shaders.ts` — шейдер сферы и шейдер сцены (5 техник через uniform).

## В работе (v0.1)
- Компоненты рендера: OrbField (поле сфер, один WebGL-канвас), MemoryScene (сцена дня).
- Страницы: архив (сферы + лента + поиск), создание дня с живым превью, просмотр дня.

## Дальше
- v0.1: сохранение → архив со сферами, проверка в браузере, деплой на Vercel, тег v0.1.
- v0.2: seed-дни (6), LLM-анализ вживую, озвучка, панель «Почему», полировка техник.
- v0.3: ленточный тест, A/B (тот же текст + другая песня), поиск, README, docs/*, проверка без сети.

## Известные баги / риски
- Код ещё не собирался: `npm run build` не запускался после добавления core/.
- GitHub CLI (`gh`) не был установлен — см. раздел о репозитории ниже.

## Репозиторий
- Локальная ветка `main`. Удалённый репозиторий: см. последний коммит / ниже.
