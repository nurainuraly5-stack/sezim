'use client';
// A/B на экране дня: меняется одно — песня или текст, остальное как у дня. Обе версии считаются заново
// одним движком (core/ab.ts), ничего не подставлено. Песня: другого дня (её сохранённый анализ), свой файл
// (анализ в браузере) или ссылка (честная оценка/ручной темп). Текст: другого дня или свой (тот же анализ текста).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AudioFeatures, DayEntry, SongMeta, TextFeatures } from '@/core/types';
import { computeVariant, musicDiff, textDiff, type Variant } from '@/core/ab';
import { TECHNIQUES } from '@/core/style-engine';
import { S, audioModeRu, formatDateShort } from '@/core/strings';
import { analyzeAudioFile } from '@/core/analyze/audio';
import { analyzeTextFallback } from '@/core/analyze/text-fallback';
import { linkAudio, parseSongLink, type ManualSong } from '@/core/analyze/song-link';
import { analyzeRemote, dayTextFeatures, mergeText, type AnalyzeResponse } from '@/lib/pipeline';
import { orbFrame, orbSize } from '@/design/tokens';
import Orb from './Orb';
import { songLabel } from './SongPlayer';
import TempoModeChips from './TempoModeChips';

export type CompareKind = 'song' | 'text';
type SongMode = 'day' | 'file' | 'link';
type TextMode = 'day' | 'own';
type Pick = { audio?: AudioFeatures; meta?: SongMeta; label: string; source: string };
type TextPick = { text: string; features: TextFeatures; label: string; source: string; remote?: AnalyzeResponse | null };

const fmtSec = (v: number) => `${v.toFixed(1).replace('.', ',')} с`;
const pctS = (v: number) => `${Math.round(v * 100)}%`;
const engineRu = (t: TextFeatures) => (t.engine === 'llm' ? 'анализ LLM' : S.simplified);
const audioSrc = (a?: AudioFeatures) => (a?.source === 'audio' ? S.audioReal : a?.source === 'meta' ? S.audioMeta : a?.source === 'manual' ? S.audioManual : S.noSong);

type Src = Parameters<typeof computeVariant>[0];

/** Другой день, чья песня (или текст) сильнее всего меняет результат, — выбран по умолчанию,
 *  чтобы влияние было видно сразу при открытии. Считается настоящим пересчётом. */
function mostDifferent(A: Variant, others: DayEntry[], variant: (o: DayEntry) => Variant | null) {
  let best: DayEntry | undefined, bestScore = -1;
  for (const o of others) {
    const B = variant(o);
    if (!B) continue;
    const score = (A.tokens.technique !== B.tokens.technique ? 2 : 0)
      + (A.audio?.mode !== B.audio?.mode ? 1 : 0)
      + Math.abs(A.mood.tempo - B.mood.tempo) / 40
      + Math.abs(A.mood.warmth - B.mood.warmth) * 3 + Math.abs(A.mood.arousal - B.mood.arousal) * 2
      + Math.abs(A.mood.valence - B.mood.valence) * 2;
    if (score > bestScore) { bestScore = score; best = o; }
  }
  return best;
}

export default function DayCompare({ day, others, mobile, kind, onKind, onClose, onReplaceText }: {
  day: DayEntry; others: DayEntry[]; mobile: boolean; kind: CompareKind; onKind: (k: CompareKind) => void; onClose: () => void;
  /** «Заменить»: текст B становится текстом дня (remote — уже полученный ответ анализа, чтобы не спрашивать модель дважды) */
  onReplaceText: (text: string, remote?: AnalyzeResponse | null) => Promise<void>;
}) {
  const songDays = useMemo(() => others.filter((o) => o.id !== day.id && o.song.analysis), [others, day.id]);
  const textDays = useMemo(() => others.filter((o) => o.id !== day.id && o.text.trim()), [others, day.id]);
  const [text, setText] = useState<TextFeatures>();
  useEffect(() => { dayTextFeatures(day).then(setText); }, [day]);

  // --- песня B
  const [songMode, setSongMode] = useState<SongMode>(songDays.length ? 'day' : 'file');
  const [songDayId, setSongDayId] = useState<string>();
  const [file, setFile] = useState<File>();
  const [fileAudio, setFileAudio] = useState<AudioFeatures | null>();
  const [fileBusy, setFileBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [linkMeta, setLinkMeta] = useState<SongMeta>();
  const [manual, setManual] = useState<ManualSong>({});

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

  const songPick: Pick | null = useMemo(() => {
    if (songMode === 'day') {
      const o = songDays.find((c) => c.id === songDayId);
      return o ? { audio: o.song.analysis, meta: o.song.meta, label: songLabel(o), source: audioSrc(o.song.analysis) } : null;
    }
    if (songMode === 'file') return file && fileAudio ? { audio: fileAudio, meta: { title: file.name.replace(/\.[^.]+$/, '') }, label: file.name, source: S.audioReal } : null;
    if (!link) return null;
    const audio = linkAudio(linkMeta, manual);
    return { audio, meta: linkMeta, label: linkMeta?.title || url, source: audioSrc(audio) };
  }, [songMode, songDays, songDayId, file, fileAudio, link, linkMeta, manual, url]);

  // --- текст B: признаки текста другого дня — как у того дня (упрощённый анализ или LLM-ответ из кэша)
  // свой текст — по умолчанию: поле, куда вписать или вставить другой текст; текст другого дня — вторая вкладка
  const [textMode, setTextMode] = useState<TextMode>('own');
  const [textDayId, setTextDayId] = useState<string>();
  const [otherFeatures, setOtherFeatures] = useState<Record<string, TextFeatures>>({});
  const [own, setOwn] = useState('');
  // фокус в поле — без прокрутки: блок сам прокручивается к своему началу (autoFocus перебивал это и уводил страницу ниже)
  const ownRef = useRef<HTMLTextAreaElement>(null);
  // блок вставляется выше кнопки «Сравнить с другим текстом»: браузер держит кнопку на месте и уводит страницу вниз —
  // прокручиваем к началу блока, когда он уже отрисован (до отрисовки прокрутка из страницы дня ничего не находила)
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => { rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, []);
  useEffect(() => { if (kind === 'text' && textMode === 'own') ownRef.current?.focus({ preventScroll: true }); }, [kind, textMode]);
  const [ownPick, setOwnPick] = useState<TextPick>();
  const [ownBusy, setOwnBusy] = useState(false);
  useEffect(() => {
    let off = false;
    Promise.all(textDays.map(async (o) => [o.id, await dayTextFeatures(o)] as const))
      .then((xs) => { if (!off) setOtherFeatures(Object.fromEntries(xs)); });
    return () => { off = true; };
  }, [textDays]);

  /** Свой текст — тот же анализ, что у нового дня: LLM, если доступен (клиент ждёт до 10 с, сервер — модель до 9 с),
   *  иначе упрощённый. Если модель настроена, но не ответила, — так и подписано. */
  async function recalcOwn() {
    const t = own.trim();
    if (!t) return;
    // тот же текст, что у дня, — те же признаки (модель недетерминирована: повторный запрос дал бы ложные «изменения»)
    if (text && t === day.text.trim()) { setOwnPick({ text: t, features: text, label: text.title, source: engineRu(text) }); return; }
    setOwnBusy(true);
    // песня та же, что у дня, — и ключ кэша анализа тот же, что при создании дня
    const remote = await analyzeRemote(t, day.song.kind === 'link' ? day.song.url : undefined);
    const features = mergeText(analyzeTextFallback(t), remote?.llm ?? null);
    const fellBack = !remote?.llm && !!remote?.llmReason && !/LLM_PROVIDER=none|disabled/.test(remote.llmReason);
    setOwnPick({ text: t, features, label: features.title, source: fellBack ? S.llmFellBack : engineRu(features), remote });
    setOwnBusy(false);
  }
  const [replacing, setReplacing] = useState(false);
  async function replace(p: TextPick) {
    if (!window.confirm(S.confirmReplace)) return;
    setReplacing(true);
    try { await onReplaceText(p.text, p.remote); } finally { setReplacing(false); }
  }

  const textPick: TextPick | null = useMemo(() => {
    if (textMode === 'own') return ownPick ?? null;
    const o = textDays.find((c) => c.id === textDayId);
    const f = o && otherFeatures[o.id];
    return o && f ? { text: o.text, features: f, label: o.mood.title, source: `${formatDateShort(o.date)} · ${engineRu(f)}` } : null;
  }, [textMode, ownPick, textDays, textDayId, otherFeatures]);

  // --- две версии
  const src: Src | undefined = text && { text: day.text, createdAt: day.createdAt, textFeatures: text, photo: day.photoFeatures };
  const A = useMemo(() => src && computeVariant(src, day.song.analysis, day.song.meta), [text]); // eslint-disable-line react-hooks/exhaustive-deps
  const B = useMemo(() => {
    if (!src) return null;
    if (kind === 'song') return songPick ? computeVariant(src, songPick.audio, songPick.meta) : null;
    return textPick ? computeVariant({ ...src, text: textPick.text, textFeatures: textPick.features }, day.song.analysis, day.song.meta) : null;
  }, [text, kind, songPick, textPick]); // eslint-disable-line react-hooks/exhaustive-deps
  const diff = A && B ? (kind === 'song' ? musicDiff(A, B) : textDiff(A, B)) : [];

  // выбор по умолчанию — когда известна версия A (и только если человек ещё ничего не выбрал)
  useEffect(() => {
    if (src && A && !songDayId) setSongDayId(mostDifferent(A, songDays, (o) => computeVariant(src, o.song.analysis, o.song.meta))?.id);
  }, [A]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!src || !A || textDayId || !Object.keys(otherFeatures).length) return;
    setTextDayId(mostDifferent(A, textDays, (o) => otherFeatures[o.id]
      ? computeVariant({ ...src, text: o.text, textFeatures: otherFeatures[o.id] }, day.song.analysis, day.song.meta) : null)?.id);
  }, [A, otherFeatures]); // eslint-disable-line react-hooks/exhaustive-deps

  // A пересчитана заново; если разошлась с сохранённым днём (например, LLM-ответа нет в кэше) — говорим об этом
  const drift = !!A && (A.tokens.technique !== day.tokens.technique || A.tokens.palette.join() !== day.tokens.palette.join());

  const body = mobile ? orbSize.compare.mobile : orbSize.compare.desktop;
  const frame = Math.round(body / (orbFrame.radius * 2));
  const song = kind === 'song';

  return (
    <section ref={rootRef} className="card mt-6 flex scroll-mt-24 flex-col gap-5 p-4 sm:p-5" aria-labelledby="ab-h" id="compare">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="ab-h" className="t-h3">{song ? S.compareTitle : S.compareTitleText}</h2>
          <p className="t-caption mt-1 measure">{song ? S.compareSub : S.compareSubText}</p>
          {drift && <p className="t-micro mt-1 measure">{S.compareDrift}</p>}
        </div>
        <button className="btn btn-quiet btn-icon -mr-2 -mt-2" onClick={onClose} aria-label={S.compareClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </header>

      <div className="flex gap-1 self-start rounded-[var(--r-pill)] border border-line p-1" role="group" aria-label="Что меняем">
        <button className="chip border-transparent" aria-pressed={song} onClick={() => onKind('song')}>{S.compareKindSong}</button>
        <button className="chip border-transparent" aria-pressed={!song} onClick={() => onKind('text')}>{S.compareKindText}</button>
      </div>

      {song ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Откуда взять другую песню">
            {songDays.length > 0 && <button className="chip" aria-pressed={songMode === 'day'} onClick={() => setSongMode('day')}>{S.pickOtherDay}</button>}
            <button className="chip" aria-pressed={songMode === 'file'} onClick={() => setSongMode('file')}>{S.pickFile}</button>
            <button className="chip" aria-pressed={songMode === 'link'} onClick={() => setSongMode('link')}>{S.pickLink}</button>
          </div>
          {songMode === 'day' && (
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label={S.pickOtherDay}>
              {songDays.map((o) => (
                <button key={o.id} className="chip shrink-0" aria-pressed={songDayId === o.id} onClick={() => setSongDayId(o.id)} title={songLabel(o)}>
                  <span className="max-w-[16ch] truncate">{o.song.meta?.title || songLabel(o)}</span>
                  <span className="tabular-nums opacity-70">{Math.round(o.song.analysis!.bpm)} · {audioModeRu(o.song.analysis) || '?'}</span>
                  <span className="sr-only">, {formatDateShort(o.date)}</span>
                </button>
              ))}
            </div>
          )}
          {songMode === 'file' && (
            <div className="flex flex-col items-start gap-2">
              <label className="btn cursor-pointer">
                {file ? file.name : S.pickFileBtn}
                <input type="file" accept="audio/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
              </label>
              {fileBusy && <p className="t-caption" aria-live="polite">{S.analyzingAudio}</p>}
              {fileAudio === null && <p className="t-caption" aria-live="polite">{S.fileFailed}</p>}
            </div>
          )}
          {songMode === 'link' && (
            <div className="flex flex-col gap-3">
              <input className="field" placeholder={S.songLinkPlaceholder} value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" aria-label="Ссылка на другую песню" />
              {link && <TempoModeChips manual={manual} onChange={setManual} />}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Откуда взять другой текст">
            <button className="chip" aria-pressed={textMode === 'own'} onClick={() => setTextMode('own')}>{S.pickOwnText}</button>
            {textDays.length > 0 && <button className="chip" aria-pressed={textMode === 'day'} onClick={() => setTextMode('day')}>{S.pickOtherText}</button>}
          </div>
          {textMode === 'day' && (
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label={S.pickOtherText}>
              {textDays.map((o) => (
                <button key={o.id} className="chip shrink-0" aria-pressed={textDayId === o.id} onClick={() => setTextDayId(o.id)} title={o.mood.title}>
                  <span className="max-w-[22ch] truncate">{o.mood.title}</span>
                  <span className="tabular-nums opacity-70">{formatDateShort(o.date)}</span>
                </button>
              ))}
            </div>
          )}
          {textMode === 'own' && (
            <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); recalcOwn(); }}>
              <textarea ref={ownRef} className="field min-h-[7rem]" value={own} onChange={(e) => setOwn(e.target.value)} placeholder={S.ownTextPlaceholder} aria-label={S.pickOwnText} />
              <div className="flex flex-wrap items-center gap-3">
                <button className="btn" type="submit" disabled={ownBusy || !own.trim()}>{ownBusy ? S.recalcBusy : S.recalc}</button>
                <p className="t-micro measure">{S.recalcHint}</p>
              </div>
            </form>
          )}
        </div>
      )}

      {/* две версии рядом */}
      <div className="grid grid-cols-2 gap-3 sm:gap-5">
        {A && text && <Column title={song ? S.thisSong : S.thisText} label={song ? songLabel(day) : day.mood.title}
          source={song ? audioSrc(day.song.analysis) : engineRu(text)} v={A} frame={frame} />}
        {B && (song ? songPick : textPick) ? (
          <Column title={song ? S.otherSong : S.otherText} label={(song ? songPick : textPick)!.label}
            source={(song ? songPick : textPick)!.source} v={B} frame={frame} base={A ?? undefined} />
        ) : (
          <div className="grid place-items-center rounded-[var(--r-md)] border border-dashed border-line p-4 text-center">
            <p className="t-caption">{song ? S.chooseSong : S.chooseText}</p>
          </div>
        )}
      </div>

      {diff.length > 0 && (
        <div aria-live="polite">
          <h3 className="t-title">{song ? S.whatMusicChanged : S.whatTextChanged}</h3>
          <ul className="mt-3 flex flex-col gap-2.5">
            {diff.map((d) => <li key={d} className="t-caption border-l-2 pl-3" style={{ color: 'var(--ink)', borderColor: 'var(--accent)' }}>{d}</li>)}
          </ul>
        </div>
      )}

      {/* оригинал не меняется, пока человек явно не выберет «Заменить» */}
      {!song && B && textPick && textPick.text.trim() !== day.text.trim() && (
        <button className="btn btn-primary self-start" onClick={() => replace(textPick)} disabled={replacing}>{replacing ? S.replaceBusy : S.replaceText}</button>
      )}
    </section>
  );
}

function Column({ title, label, source, v, frame, base }: { title: string; label: string; source: string; v: Variant; frame: number; base?: Variant }) {
  // строка, которая изменилась относительно A, — выделена
  const changed = (f: (x: Variant) => string) => !!base && f(base) !== f(v);
  const rows: [string, (x: Variant) => string][] = [
    [S.rowTechnique, (x) => TECHNIQUES[x.tokens.technique].name],
    [S.rowMood, (x) => `${pctS(x.mood.valence)} / ${pctS(x.mood.arousal)}`],
    [S.rowWarm, (x) => `${pctS(x.mood.warmth)} / ${pctS(x.mood.contrast)}`],
    [S.rowRhythm, (x) => S.every(fmtSec(x.tokens.rhythm))],
    [S.rowBreath, (x) => S.onceIn(fmtSec(1 / x.tokens.orb.breath))],
    [S.rowTempo, (x) => `${Math.round(x.mood.tempo)} BPM${audioModeRu(x.audio) ? `, ${audioModeRu(x.audio)}` : ''}`],
    [S.rowTexture, (x) => `${pctS(x.tokens.grain)} / ${pctS(x.tokens.sharpness)}`],
  ];
  return (
    <article className="flex min-w-0 flex-col gap-3" aria-label={title}>
      <div className="min-w-0">
        <p className="t-micro">{title}</p>
        <p className="t-title truncate" title={label}>{label}</p>
        <p className="t-micro mt-0.5">{source}</p>
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
