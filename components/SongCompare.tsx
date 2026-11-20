'use client';
// A/B на экране дня: тот же текст и фото, другая песня — две версии рядом и «что изменила музыка».
// Обе версии считаются заново (core/ab.ts), ничего не подставлено: песня другого дня берётся с её
// сохранённым анализом, свой файл анализируется в браузере, ссылка — честная оценка/ручной темп.
import { useEffect, useMemo, useState } from 'react';
import type { AudioFeatures, DayEntry, SongMeta, TextFeatures } from '@/core/types';
import { computeVariant, musicDiff, type Variant } from '@/core/ab';
import { TECHNIQUES } from '@/core/style-engine';
import { S, formatDateShort, modeRu } from '@/core/strings';
import { analyzeAudioFile } from '@/core/analyze/audio';
import { TEMPO_PRESETS, linkAudio, parseSongLink, type ManualSong } from '@/core/analyze/song-link';
import { analyzeRemote, dayTextFeatures } from '@/lib/pipeline';
import { orbFrame, orbSize } from '@/design/tokens';
import Orb from './Orb';
import { songLabel } from './SongPlayer';

type Mode = 'day' | 'file' | 'link';
type Pick = { audio?: AudioFeatures; meta?: SongMeta; label: string };

const fmtSec = (v: number) => `${v.toFixed(1).replace('.', ',')} с`;

type Src = Parameters<typeof computeVariant>[0];

/** Песня другого дня, которая сильнее всего меняет результат (считается настоящим пересчётом) —
 *  выбрана по умолчанию, чтобы влияние музыки было видно сразу при открытии. */
function mostDifferent(src: Src, A: Variant, others: DayEntry[]) {
  let best: DayEntry | undefined, bestScore = -1;
  for (const o of others) {
    const B = computeVariant(src, o.song.analysis, o.song.meta);
    const score = (A.tokens.technique !== B.tokens.technique ? 2 : 0)
      + (A.audio?.mode !== B.audio?.mode ? 1 : 0)
      + Math.abs(A.mood.tempo - B.mood.tempo) / 40
      + Math.abs(A.mood.warmth - B.mood.warmth) * 3 + Math.abs(A.mood.arousal - B.mood.arousal) * 2;
    if (score > bestScore) { bestScore = score; best = o; }
  }
  return best;
}

export default function SongCompare({ day, others, mobile, onClose }: {
  day: DayEntry; others: DayEntry[]; mobile: boolean; onClose: () => void;
}) {
  const candidates = useMemo(() => others.filter((o) => o.id !== day.id && o.song.analysis), [others, day.id]);
  const [mode, setMode] = useState<Mode>(candidates.length ? 'day' : 'file');
  const [otherId, setOtherId] = useState<string>();
  const [file, setFile] = useState<File>();
  const [fileAudio, setFileAudio] = useState<AudioFeatures | null>();
  const [fileBusy, setFileBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [linkMeta, setLinkMeta] = useState<SongMeta>();
  const [manual, setManual] = useState<ManualSong>({});
  const [text, setText] = useState<TextFeatures>();

  useEffect(() => { dayTextFeatures(day).then(setText); }, [day]);

  // ссылка → название через oEmbed (для оценки по метаданным)
  const link = url ? parseSongLink(url) : null;
  useEffect(() => {
    setLinkMeta(undefined);
    if (!link || link.provider === 'other') return;
    let off = false;
    const t = setTimeout(() => analyzeRemote('', url).then((r) => { if (!off && r?.songMeta) setLinkMeta({ ...r.songMeta }); }), 400);
    return () => { off = true; clearTimeout(t); };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pickFile(f?: File) {
    if (!f) return;
    setFile(f); setFileAudio(undefined); setFileBusy(true);
    const a = await analyzeAudioFile(f);
    setFileAudio(a ?? null); setFileBusy(false);
  }

  const pick: Pick | null = useMemo(() => {
    if (mode === 'day') {
      const o = candidates.find((c) => c.id === otherId);
      return o ? { audio: o.song.analysis, meta: o.song.meta, label: songLabel(o) } : null;
    }
    if (mode === 'file') return file && fileAudio ? { audio: fileAudio, meta: { title: file.name.replace(/\.[^.]+$/, '') }, label: file.name } : null;
    if (!link) return null;
    return { audio: linkAudio(linkMeta, manual), meta: linkMeta, label: linkMeta?.title || url };
  }, [mode, candidates, otherId, file, fileAudio, link, linkMeta, manual, url]);

  const src = text && { text: day.text, createdAt: day.createdAt, textFeatures: text, photo: day.photoFeatures };
  const A = useMemo(() => src && computeVariant(src, day.song.analysis, day.song.meta), [text]); // eslint-disable-line react-hooks/exhaustive-deps
  const B = useMemo(() => (src && pick ? computeVariant(src, pick.audio, pick.meta) : null), [text, pick]); // eslint-disable-line react-hooks/exhaustive-deps
  const diff = A && B ? musicDiff(A, B) : [];
  // выбор по умолчанию — когда известна версия A (и только если человек ещё ничего не выбрал)
  useEffect(() => {
    if (src && A && !otherId) setOtherId(mostDifferent(src, A, candidates)?.id);
  }, [A]); // eslint-disable-line react-hooks/exhaustive-deps
  // A пересчитана заново; если разошлась с сохранённым днём (например, LLM-ответа нет в кэше) — говорим об этом
  const drift = !!A && (A.tokens.technique !== day.tokens.technique || A.tokens.palette.join() !== day.tokens.palette.join());

  const body = mobile ? orbSize.compare.mobile : orbSize.compare.desktop;
  const frame = Math.round(body / (orbFrame.radius * 2));

  return (
    <section className="card mt-6 flex flex-col gap-5 p-4 sm:p-5" aria-labelledby="ab-h" id="compare">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="ab-h" className="t-h3">{S.compareTitle}</h2>
          <p className="t-caption mt-1 measure">{S.compareSub}</p>
          {drift && <p className="t-micro mt-1 measure">{S.compareDrift}</p>}
        </div>
        <button className="btn btn-quiet btn-icon -mr-2 -mt-2" onClick={onClose} aria-label={S.compareClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </header>

      {/* выбор песни B */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Откуда взять другую песню">
          {candidates.length > 0 && <button className="chip" aria-pressed={mode === 'day'} onClick={() => setMode('day')}>{S.pickOtherDay}</button>}
          <button className="chip" aria-pressed={mode === 'file'} onClick={() => setMode('file')}>{S.pickFile}</button>
          <button className="chip" aria-pressed={mode === 'link'} onClick={() => setMode('link')}>{S.pickLink}</button>
        </div>
        {mode === 'day' && (
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label={S.pickOtherDay}>
            {candidates.map((o) => (
              <button key={o.id} className="chip shrink-0" aria-pressed={otherId === o.id} onClick={() => setOtherId(o.id)} title={songLabel(o)}>
                <span className="max-w-[16ch] truncate">{o.song.meta?.title || songLabel(o)}</span>
                <span className="tabular-nums opacity-70">{Math.round(o.song.analysis!.bpm)} · {modeRu(o.song.analysis!.mode) || '?'}</span>
                <span className="sr-only">, {formatDateShort(o.date)}</span>
              </button>
            ))}
          </div>
        )}
        {mode === 'file' && (
          <div className="flex flex-col items-start gap-2">
            <label className="btn cursor-pointer">
              {file ? file.name : S.pickFileBtn}
              <input type="file" accept="audio/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
            </label>
            {fileBusy && <p className="t-caption" aria-live="polite">{S.analyzingAudio}</p>}
            {fileAudio === null && <p className="t-caption" aria-live="polite">{S.fileFailed}</p>}
          </div>
        )}
        {mode === 'link' && (
          <div className="flex flex-col gap-3">
            <input className="field" placeholder={S.songLinkPlaceholder} value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" aria-label="Ссылка на другую песню" />
            {link && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="t-caption w-14">{S.tempo}</span>
                  {TEMPO_PRESETS.map((t) => (
                    <button key={t.bpm} className="chip" aria-pressed={manual.bpm === t.bpm} onClick={() => setManual((m) => ({ ...m, bpm: m.bpm === t.bpm ? undefined : t.bpm }))}>{t.label}</button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="t-caption w-14">{S.mode}</span>
                  {(['major', 'minor', 'unknown'] as const).map((m) => (
                    <button key={m} className="chip" aria-pressed={manual.mode === m} onClick={() => setManual((x) => ({ ...x, mode: x.mode === m ? undefined : m }))}>{S[m]}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* две версии рядом */}
      <div className="grid grid-cols-2 gap-3 sm:gap-5">
        {A && <Column title={S.thisSong} label={songLabel(day)} v={A} frame={frame} />}
        {B && pick ? <Column title={S.otherSong} label={pick.label} v={B} frame={frame} base={A ?? undefined} />
          : <div className="grid place-items-center rounded-[var(--r-md)] border border-dashed border-line p-4 text-center"><p className="t-caption">{S.chooseSong}</p></div>}
      </div>

      {diff.length > 0 && (
        <div aria-live="polite">
          <h3 className="t-title">{S.whatMusicChanged}</h3>
          <ul className="mt-3 flex flex-col gap-2.5">
            {diff.map((d) => <li key={d} className="t-caption border-l-2 pl-3" style={{ color: 'var(--ink)', borderColor: 'var(--accent)' }}>{d}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

function Column({ title, label, v, frame, base }: { title: string; label: string; v: Variant; frame: number; base?: Variant }) {
  const a = v.audio;
  const src = a?.source === 'audio' ? S.audioReal : a?.source === 'meta' ? S.audioMeta : a?.source === 'manual' ? S.audioManual : S.noSong;
  // строка, которая изменилась относительно A, — подсвечена
  const changed = (f: (x: Variant) => string) => !!base && f(base) !== f(v);
  const rows: [string, (x: Variant) => string][] = [
    [S.rowTechnique, (x) => TECHNIQUES[x.tokens.technique].name],
    [S.rowRhythm, (x) => S.every(fmtSec(x.tokens.rhythm))],
    [S.rowBreath, (x) => S.onceIn(fmtSec(1 / x.tokens.orb.breath))],
    [S.rowTempo, (x) => `${Math.round(x.mood.tempo)} BPM${modeRu(x.audio?.mode ?? '') ? `, ${modeRu(x.audio!.mode)}` : ''}`],
    [S.rowTexture, (x) => `${Math.round(x.tokens.grain * 100)}% / ${Math.round(x.tokens.sharpness * 100)}%`],
  ];
  return (
    <article className="flex min-w-0 flex-col gap-3" aria-label={title}>
      <div className="min-w-0">
        <p className="t-micro">{title}</p>
        <p className="t-title truncate" title={label}>{label}</p>
        <p className="t-micro mt-0.5">{src}</p>
      </div>
      <div className="relative mx-auto w-full" style={{ height: frame * 0.86, maxWidth: frame }}>
        <Orb params={v.orb} size={frame} live className="pointer-events-none absolute left-1/2" style={{ top: -frame * 0.05, marginLeft: -frame / 2 }} />
      </div>
      <div className="flex gap-1" aria-label="Палитра">
        {v.tokens.palette.map((c, i) => <span key={i} title={c} className="h-5 flex-1 rounded-[6px]" style={{ background: c, boxShadow: 'inset 0 0 0 1px var(--line)' }} />)}
      </div>
      <dl className="flex flex-col gap-1.5">
        {rows.map(([k, f]) => (
          <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-2">
            <dt className="t-micro">{k}</dt>
            <dd className="t-caption flex items-center gap-1.5 tabular-nums" style={{ color: 'var(--ink)', fontWeight: changed(f) ? 800 : undefined }}>
              {k === S.rowRhythm && <span aria-hidden className="beat inline-block h-2 w-2 rounded-full" style={{ background: 'var(--accent)', ['--beat' as string]: `${v.tokens.rhythm}s` }} />}
              {f(v)}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
