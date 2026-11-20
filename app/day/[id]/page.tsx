'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import AtmosphereChart from '@/components/AtmosphereChart';
import MemoryScene from '@/components/MemoryScene';
import Orb from '@/components/Orb';
import SongPlayer from '@/components/SongPlayer';
import WhyPanel from '@/components/WhyPanel';
import { useMedia, useWidth } from '@/components/useMedia';
import DayCompare, { type CompareKind } from '@/components/DayCompare';
import TempoModeChips from '@/components/TempoModeChips';
import { ORB_RENDER_VERSION, renderOrbBlob } from '@/components/orb-engine';
import { computeVariant } from '@/core/ab';
import { TEMPO_PRESETS, linkAudio, type ManualSong } from '@/core/analyze/song-link';
import { deleteDay, getDay, listDays, putDay } from '@/lib/db';
import { DayPlayer, loadBrowserVoices, pickRuVoice } from '@/lib/player';
import { dayTextFeatures, isTtsConfigured, renderVoice, voiceScript } from '@/lib/pipeline';
import { download, exportDayZip, folderName } from '@/lib/zip';
import { warmOrbEngine } from '@/components/orb-engine';
import { orbParams, orbSource } from '@/core/orb';
import { S, DAYPART_RU, formatDate, formatWeekday, audioModeRu, moodSummary } from '@/core/strings';
import type { DayEntry } from '@/core/types';
import { dayTheme, orbFrame, orbSize } from '@/design/tokens';

export default function DayPage() {
  const { id } = useParams<{ id: string }>();
  const [day, setDay] = useState<DayEntry | null | undefined>(undefined);
  useEffect(() => { getDay(id).then((d) => setDay(d ?? null)); }, [id]);

  if (day === undefined) return <AppShell><div className="min-h-[60vh]" /></AppShell>;
  if (day === null) {
    return (
      <AppShell>
        <main className="flex min-h-[60vh] flex-col items-start justify-center gap-5 px-4 md:px-10">
          <p className="t-h2">{S.notFound}</p>
          <Link href="/" className="btn">{S.backToArchive}</Link>
        </main>
      </AppShell>
    );
  }
  return <DayView key={day.id} day={day} onChange={setDay} />;
}

function DayView({ day: d, onChange }: { day: DayEntry; onChange: (d: DayEntry) => void }) {
  const router = useRouter();
  const mobile = useMedia('(max-width: 767px)');
  const params = useMemo(() => orbParams(orbSource(d)), [d]);
  const theme = dayTheme(d.tokens.palette, params.depth, d.mood.daypart);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(d.mood.title);
  const [busy, setBusy] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [voiceOk, setVoiceOk] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceRendering, setVoiceRendering] = useState(false);
  const [songPause, setSongPause] = useState(0);
  const player = useRef<DayPlayer | null>(null);
  const [orbColRef, orbCol] = useWidth(600);
  // Сначала отрисовываются текст и карточки, WebGL — после первого кадра. Программа сферы собирается
  // асинхронно (после прогрева в архиве — мгновенно), иначе её синхронная компиляция замораживает страницу.
  const [glReady, setGlReady] = useState(false);
  useEffect(() => {
    let off = false;
    const raf = requestAnimationFrame(() => {
      warmOrbEngine(params).catch(() => undefined).finally(() => { if (!off) setGlReady(true); });
    });
    return () => { off = true; cancelAnimationFrame(raf); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // «Слушать день» показываем, только если голос реально есть: сохранённый, серверный TTS или русский голос браузера
  useEffect(() => {
    let off = false;
    (async () => {
      const ok = !!d.voice || (await isTtsConfigured()) || !!pickRuVoice(await loadBrowserVoices());
      if (!off) setVoiceOk(ok);
    })();
    return () => { off = true; };
  }, [d.voice]);
  useEffect(() => () => player.current?.stop(), []);

  useEffect(() => {
    if (!d.photos[0]) return;
    const u = URL.createObjectURL(d.photos[0]);
    setPhotoUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [d.photos]);

  function stopListening() {
    // сначала отвязываем: stop() вызывает onVoiceState(false), который не должен прийти сюда повторно
    const p = player.current;
    player.current = null;
    p?.stop();
    setListening(false);
  }

  /** Песня дня + озвучка (музыка приглушается под голос). Только по нажатию. */
  async function listen() {
    if (listening) { stopListening(); return; }
    setSongPause((k) => k + 1);
    const p = new DayPlayer(d);
    player.current = p;
    // песня по ссылке играет во встроенном плеере, не здесь: когда голос дочитал, слушать больше нечего
    const hasMusic = d.song.kind === 'file' && !!d.song.file;
    p.onVoiceState = (speaking) => { if (!speaking && !hasMusic && player.current === p) stopListening(); };
    setListening(true);
    await p.start();
    // голоса ещё нет, а TTS настроен — синтезируем и сохраняем в папку дня (ждём не дольше 6 с, иначе голос браузера)
    if (!d.voice && (await isTtsConfigured())) {
      setVoiceRendering(true);
      const blob = await Promise.race([
        renderVoice(voiceScript(d.mood.title, d.mood.quote), d.mood.voiceStyle.pace, d.mood.voiceStyle.warmth),
        new Promise<undefined>((r) => setTimeout(() => r(undefined), 6000)),
      ]);
      setVoiceRendering(false);
      if (blob) { await p.prepareVoice(blob); await putDay({ ...d, voice: blob }); }
    }
    if (player.current !== p) return;
    p.playVoice();
    if (p.voiceMode === 'none' && !hasMusic) stopListening();
  }

  /** A/B: другие дни — источники песни или текста для сравнения; блок открывается под сценой и прокручивается в вид. */
  const [others, setOthers] = useState<DayEntry[] | null>(null);
  const [compareKind, setCompareKind] = useState<CompareKind>('song');
  async function openCompare(kind: CompareKind) {
    setCompareKind(kind);
    if (!others) setOthers(await listDays());
    requestAnimationFrame(() => document.getElementById('compare')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  /** Песня по ссылке: человек поправил темп/лад → день пересчитывается тем же движком и сохраняется
   *  (название и цитата остаются). Звук по ссылке не анализируется — это ручной ввод, так и подписано. */
  const a0 = d.song.analysis;
  const manual: ManualSong = a0?.source === 'manual'
    ? { bpm: TEMPO_PRESETS.some((t) => t.bpm === a0.bpm) ? a0.bpm : undefined, mode: a0.mode }
    : {};
  async function setManual(m: ManualSong) {
    const audio = linkAudio(d.song.meta, m);
    const tf = await dayTextFeatures(d);
    const v = computeVariant({ text: d.text, createdAt: d.createdAt, textFeatures: tf, photo: d.photoFeatures }, audio, d.song.meta);
    const next: DayEntry = { ...d, mood: v.mood, tokens: v.tokens, explain: v.explain, song: { ...d.song, analysis: audio } };
    const thumb = await renderOrbBlob(orbParams(orbSource(next)), orbSize.thumb).catch(() => undefined);
    const saved = { ...next, thumb, thumbV: thumb ? ORB_RENDER_VERSION : undefined };
    await putDay(saved);
    onChange(saved);
  }

  async function saveTitle() {
    const t = title.trim().replace(/\s+/g, ' ');
    setEditing(false);
    if (!t || t === d.mood.title) { setTitle(d.mood.title); return; }
    // сохранённый голос читал старое название — сбрасываем, при следующем прослушивании синтезируется заново
    const next = { ...d, mood: { ...d.mood, title: t }, voice: undefined };
    await putDay(next);
    onChange(next);
  }

  async function doExport() {
    setBusy(true);
    try { download(await exportDayZip(d), `${folderName(d)}.zip`); } finally { setBusy(false); }
  }

  async function doDelete() {
    if (!window.confirm(S.confirmDelete)) return;
    stopListening();
    await deleteDay(d.id);
    router.push('/');
  }

  const a = d.song.analysis;
  const music = a
    ? `${Math.round(a.bpm)} BPM${audioModeRu(a) ? `, ${audioModeRu(a)}` : ''}${a.source === 'meta' ? ' (оценка)' : ''}`
    : `${d.mood.tempo} BPM (по тексту)`;
  // кадр сферы не шире колонки: кольца занимают ~0.95 ширины кадра
  const heroFrame = Math.min(Math.round((mobile ? orbSize.hero.mobile : orbSize.hero.desktop) / (orbFrame.radius * 2)), Math.floor(orbCol / 0.95));
  const daypart = DAYPART_RU[d.mood.daypart];

  return (
    <AppShell className={theme.dark ? 'theme-dark' : ''} style={{ background: theme.background, color: 'var(--ink)' }}>
      <main className="mx-auto max-w-[1280px] px-4 pb-16 pt-5 md:px-6 lg:px-10 lg:pt-8">
        <Link href="/" className="btn btn-quiet -ml-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="m14.5 6-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {S.backToArchive}
        </Link>

        <header className="mt-5 flex flex-col items-start gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="chip">{formatDate(d.date).replace(/\s*г\.?$/, '')}, {formatWeekday(d.date)}{daypart ? `, ${daypart}` : ''}</p>
            {!editing && <button className="btn btn-quiet min-h-[32px] px-3" onClick={() => setEditing(true)}>{S.rename}</button>}
          </div>
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); saveTitle(); }} className="flex w-full max-w-3xl flex-wrap items-center gap-3">
              <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={70} aria-label="Название дня" className="field t-h2 flex-1" />
              <button className="btn btn-primary" type="submit">{S.save}</button>
            </form>
          ) : (
            <h1 className="t-display max-w-4xl">{d.mood.title}</h1>
          )}
          <p className="t-body soft measure">«{d.mood.quote}»</p>
          <ul className="flex flex-wrap gap-2" aria-label="Коротко о дне">
            <li className="chip">{moodSummary(d.mood)}</li>
            <li className="chip">♪ {music}</li>
            <li className="chip">{S.photosCount(d.photos.length)}</li>
          </ul>
        </header>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="card relative aspect-[4/3] overflow-hidden" style={{ background: '#0b0a12' }}>
            {/* фото как есть: без WebGL — вместо сцены; пока шейдер сцены собирается — приглушённая подложка,
                первый кадр сцены (непрозрачный фон) её закрывает */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photoUrl && <img src={photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ opacity: glFailed ? 1 : 0.35 }} />}
            {!glFailed && glReady && (
              <MemoryScene photos={d.photos} tokens={d.tokens} id={d.id} intensity={1} onFail={() => setGlFailed(true)} />
            )}
          </div>
          <div ref={orbColRef} className="flex min-w-0 flex-col items-center gap-4">
            <div className="relative w-full" style={{ height: heroFrame * 0.86, maxWidth: heroFrame }}>
              {glReady && <Orb params={params} size={heroFrame} live className="pointer-events-none absolute left-1/2" style={{ top: -heroFrame * 0.05, marginLeft: -heroFrame / 2 }} />}
            </div>
            {voiceOk && (
              <button className="btn btn-primary w-full max-w-sm" onClick={listen} aria-pressed={listening}>
                {voiceRendering ? S.voiceRendering : listening ? S.stopListening : S.listenDay}
              </button>
            )}
            <div className="w-full max-w-sm">
              <SongPlayer day={d} pauseKey={songPause} onPlay={stopListening} />
              {d.song.kind === 'link' && (
                <div className="mt-3 flex flex-col gap-2 px-1">
                  <p className="t-micro">{a0?.source === 'manual' ? S.linkSongManual : S.linkSongHint}</p>
                  <TempoModeChips manual={manual} onChange={setManual} />
                  {a0?.source === 'manual' && <button className="btn btn-quiet self-start min-h-[32px] px-3" onClick={() => setManual({})}>{S.linkSongReset}</button>}
                </div>
              )}
            </div>
            <div className="grid w-full max-w-sm grid-cols-1 gap-2">
              <button className="btn" onClick={() => openCompare('song')} aria-expanded={!!others && compareKind === 'song'} aria-controls="compare">{S.compare}</button>
              <button className="btn" onClick={() => openCompare('text')} aria-expanded={!!others && compareKind === 'text'} aria-controls="compare">{S.compareText}</button>
            </div>
          </div>
        </section>

        {others && <DayCompare day={d} others={others} mobile={mobile} kind={compareKind} onKind={setCompareKind} onClose={() => setOthers(null)} />}

        <section className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <article className="card p-5">
            <h2 className="t-h3">{S.aboutDay}</h2>
            <p className="t-body mt-3 whitespace-pre-line">{d.text}</p>
            {d.mood.motifs.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label={S.momentsOfDay}>
                {d.mood.motifs.map((m) => <li key={m} className="chip">{m}</li>)}
              </ul>
            )}
          </article>
          <article className="card p-5">
            <h2 className="t-h3">{S.atmosphere}</h2>
            <div className="mt-4"><AtmosphereChart mood={d.mood} /></div>
          </article>
          <article className="card p-5 md:col-span-2 xl:col-span-1">
            <h2 className="t-h3">{S.whyTitle}</h2>
            <div className="mt-4"><WhyPanel explain={d.explain} tokens={d.tokens} engine={d.analysisEngine} audio={d.song.analysis} /></div>
          </article>
        </section>

        <footer className="card mt-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="t-caption">{S.folder}</p>
            <p className="t-title break-all">{folderName(d)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={doExport} disabled={busy}>{busy ? 'Собираем…' : S.exportZip}</button>
            <button className="btn btn-quiet" onClick={doDelete}>{S.delete}</button>
          </div>
        </footer>
      </main>
    </AppShell>
  );
}
