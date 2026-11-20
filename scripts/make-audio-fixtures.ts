// Генерация WAV-фикстур с известным темпом и тональностью (список — AUDIO_FIXTURES в audio-synth.ts):
// `npm run make:audio-fixtures`. Синтетические (CC0, детерминированные) — реальных записей с разметкой в репозитории нет.
import { mkdirSync, writeFileSync } from 'node:fs';
import { AUDIO_FIXTURES, encodeWav, synthTrack } from './audio-synth';

const dir = new URL('./fixtures/audio/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const f of AUDIO_FIXTURES) {
  const bytes = encodeWav(synthTrack({ ...f, seconds: 10, sr: 11025 }));
  writeFileSync(new URL(f.file, dir), bytes);
  console.log(`${f.file}  ${(bytes.length / 1024).toFixed(0)} КБ`);
}
