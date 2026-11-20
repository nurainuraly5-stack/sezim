'use client';
import { TEMPO_PRESETS, type ManualSong } from '@/core/analyze/song-link';
import { S } from '@/core/strings';

/** Ручной темп и лад для песни по ссылке (звук по ссылке не анализируется). Повторное нажатие снимает выбор. */
export default function TempoModeChips({ manual, onChange }: { manual: ManualSong; onChange: (m: ManualSong) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={S.tempo}>
        <span className="t-caption w-14">{S.tempo}</span>
        {TEMPO_PRESETS.map((t) => (
          <button key={t.bpm} type="button" className="chip" aria-pressed={manual.bpm === t.bpm}
            onClick={() => onChange({ ...manual, bpm: manual.bpm === t.bpm ? undefined : t.bpm })}>{t.label}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={S.mode}>
        <span className="t-caption w-14">{S.mode}</span>
        {(['major', 'minor', 'unknown'] as const).map((m) => (
          <button key={m} type="button" className="chip" aria-pressed={manual.mode === m}
            onClick={() => onChange({ ...manual, mode: manual.mode === m ? undefined : m })}>{S[m]}</button>
        ))}
      </div>
    </div>
  );
}
