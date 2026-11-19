'use client';
// Настоящий плеер песни дня: файл — <audio> из папки дня, ссылка — встроенный плеер сервиса.
// Звук стартует только по нажатию.
import { useEffect, useRef, useState } from 'react';
import type { DayEntry } from '@/core/types';
import { parseSongLink } from '@/core/analyze/song-link';
import { S } from '@/core/strings';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function songLabel(d: DayEntry) {
  return [d.song.meta?.title, d.song.meta?.artist].filter(Boolean).join(' — ') || d.song.fileName || d.song.url || S.songOfDay;
}

/** pauseKey: меняется → плеер останавливается (например, когда включили «Слушать день»). */
export default function SongPlayer({ day, onPlay, pauseKey }: { day: DayEntry; onPlay?: () => void; pauseKey?: number }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState('');
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(day.song.analysis?.duration ?? 0);
  const [embed, setEmbed] = useState(false);
  const link = day.song.kind === 'link' && day.song.url ? parseSongLink(day.song.url) : null;
  const meta = day.song.analysis?.source === 'meta';

  useEffect(() => {
    if (!day.song.file) return;
    const u = URL.createObjectURL(day.song.file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [day.song.file]);

  useEffect(() => { audio.current?.pause(); setEmbed(false); }, [pauseKey]);

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) { onPlay?.(); a.play(); } else a.pause();
  }

  return (
    <div className="card card-strong p-4">
      <div className="flex items-center gap-3">
        {day.song.file ? (
          <button className="btn btn-icon shrink-0" onClick={toggle} aria-label={playing ? S.pauseSong : S.playSong} aria-pressed={playing}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="currentColor">
              {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5.5v13a.8.8 0 0 0 1.2.7l10.4-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5z" />}
            </svg>
          </button>
        ) : link?.embed ? (
          <button className="btn btn-icon shrink-0" onClick={() => { onPlay?.(); setEmbed((e) => !e); }} aria-label={embed ? 'Скрыть плеер' : S.playSong} aria-pressed={embed}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="currentColor"><path d="M8 5.5v13a.8.8 0 0 0 1.2.7l10.4-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5z" /></svg>
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="t-micro">{S.songOfDay}</p>
          <p className="t-title truncate" title={songLabel(day)}>{songLabel(day)}</p>
        </div>
        {!day.song.file && !link?.embed && day.song.url && (
          <a className="btn shrink-0" href={day.song.url} target="_blank" rel="noreferrer">{S.openSong}</a>
        )}
      </div>
      {day.song.file && (
        <>
          <audio ref={audio} src={url || undefined} preload="metadata"
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
            onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDur(e.currentTarget.duration || dur)} />
          <div className="mt-3 flex items-center gap-3">
            <input type="range" min={0} max={dur || 1} step={0.1} value={t} aria-label="Позиция в песне"
              onChange={(e) => { if (audio.current) audio.current.currentTime = Number(e.target.value); }}
              className="h-1 flex-1 cursor-pointer accent-[var(--accent)]" />
            <span className="t-micro tabular-nums">{fmt(t)} / {fmt(dur)}</span>
          </div>
        </>
      )}
      {meta && <p className="t-micro mt-2">{S.metaEstimate}</p>}
      {embed && link?.embed && (
        <iframe src={link.embed} title={S.songOfDay} allow="autoplay; encrypted-media" className="mt-3 block w-full rounded-[var(--r-sm)]"
          style={{ height: link.provider === 'spotify' ? 152 : link.provider === 'soundcloud' ? 120 : 200, border: 0 }} />
      )}
    </div>
  );
}
