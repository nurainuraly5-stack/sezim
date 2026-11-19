'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import Logo from '@/components/Logo';
import MemoryScene from '@/components/MemoryScene';
import OrbCanvas from '@/components/OrbCanvas';
import WhyPanel from '@/components/WhyPanel';
import { deleteDay, getDay, putDay } from '@/lib/db';
import { DayPlayer } from '@/lib/player';
import { download, exportDayZip, folderName } from '@/lib/zip';
import { parseSongLink } from '@/core/analyze/song-link';
import { S, formatDate, DAYPART_RU } from '@/core/strings';
import type { DayEntry } from '@/core/types';

export default function DayPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [day, setDay] = useState<DayEntry | null | undefined>(undefined);
  const [entered, setEntered] = useState(false);
  const [why, setWhy] = useState(false);
  const [embed, setEmbed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState('');
  const player = useRef<DayPlayer | null>(null);

  useEffect(() => {
    getDay(id).then((d) => { setDay(d ?? null); if (d) setTitle(d.mood.title); });
    return () => player.current?.stop();
  }, [id]);

  useEffect(() => {
    if (!glFailed || !day?.photos[0]) return;
    const u = URL.createObjectURL(day.photos[0]);
    setFallbackUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [glFailed, day]);

  if (day === undefined) return <main className="h-[100dvh] bg-bg" />;
  if (day === null) {
    return (
      <main className="flex h-[100dvh] flex-col items-center justify-center gap-5">
        <p className="font-display text-2xl text-mute">{S.notFound}</p>
        <Link href="/" className="btn">{S.archive}</Link>
      </main>
    );
  }

  const d = day;
  const link = d.song.kind === 'link' && d.song.url ? parseSongLink(d.song.url) : null;
  const songLabel = [d.song.meta?.title, d.song.meta?.artist].filter(Boolean).join(' — ') || (d.song.kind === 'file' ? d.song.fileName : d.song.url);
  const src = d.song.analysis?.source;

  async function enter() {
    const p = new DayPlayer(d);
    player.current = p;
    await p.start();
    setEntered(true);
    if (link?.embed) setEmbed(true);
    setTimeout(() => p.playVoice(), 2200);
  }

  async function saveTitle() {
    const t = title.trim().replace(/\s+/g, ' ');
    setEditing(false);
    if (!t || t === d.mood.title) { setTitle(d.mood.title); return; }
    const next = { ...d, mood: { ...d.mood, title: t } };
    await putDay(next);
    setDay(next);
  }

  async function doExport() {
    setBusy(true);
    try { download(await exportDayZip(d), `${folderName(d)}.zip`); } finally { setBusy(false); }
  }

  async function doDelete() {
    if (!window.confirm(S.confirmDelete)) return;
    player.current?.stop();
    await deleteDay(d.id);
    router.push('/');
  }

  const ease = d.tokens.motion.easing.match(/[\d.]+/g)?.map(Number) as [number, number, number, number] | undefined;

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-bg">
      {glFailed ? (
        // без WebGL: честный простой вид — фото в палитре дня, без шейдерной обработки
        <div className="absolute inset-0" style={{ background: `radial-gradient(80% 70% at 55% 40%, ${d.tokens.palette[1]}55, #07070b 75%)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {fallbackUrl && <img src={fallbackUrl} alt="" className="absolute left-1/2 top-[42%] max-h-[62%] max-w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-[14px] object-cover opacity-80" />}
        </div>
      ) : (
        <MemoryScene photos={d.photos} tokens={d.tokens} id={d.id} intensity={entered ? 1 : 0.35} onFail={() => setGlFailed(true)} />
      )}

      {/* Постоянная рамка: шапка, дата, сфера */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-4 pt-5 md:px-10 md:pt-7">
        <div className="flex items-center gap-4">
          <Logo />
          <span className="hidden text-[0.68rem] uppercase tracking-[0.22em] text-mute sm:inline">
            {formatDate(d.date)}{DAYPART_RU[d.mood.daypart] ? ` · ${DAYPART_RU[d.mood.daypart]}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={() => setWhy((w) => !w)} aria-expanded={why}>{S.why}</button>
          <Link href="/" className="btn">{S.back}</Link>
        </div>
      </header>

      <div className="pointer-events-none absolute right-3 top-16 z-10 h-28 w-28 md:right-8 md:top-20 md:h-36 md:w-36" aria-hidden>
        <OrbCanvas fit orbs={[{ id: d.id, x: 0, y: 0, size: 1, tokens: d.tokens, contrast: d.mood.contrast }]} />
      </div>

      {/* Название и подпись от руки */}
      <section className="absolute inset-x-0 bottom-0 z-10 px-4 pb-40 md:px-10 md:pb-24">
        <p className="mb-2 text-[0.68rem] uppercase tracking-[0.22em] text-mute sm:hidden">{formatDate(d.date)}</p>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            {editing ? (
              <form onSubmit={(e) => { e.preventDefault(); saveTitle(); }} className="flex items-end gap-3">
                <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} maxLength={70}
                  className="field font-display text-[2rem] md:text-[3.2rem]" aria-label="Название дня" />
              </form>
            ) : (
              <motion.h1
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.4 / d.tokens.motion.speed, ease: ease ?? 'easeOut' }}
                className="font-display text-[2.3rem] leading-[1.02] text-ink md:text-[4rem]"
                style={{ fontWeight: d.tokens.typeWeight, textShadow: '0 2px 30px rgba(0,0,0,0.55)' }}
              >
                {d.mood.title}
                <button onClick={() => setEditing(true)} className="ml-3 align-middle text-xs text-faint underline-offset-4 hover:text-ink hover:underline" style={{ fontFamily: 'var(--font-sans)', fontWeight: 400 }}>
                  {S.rename}
                </button>
              </motion.h1>
            )}
          </div>
          <AnimatePresence>
            {entered && (
              <motion.p
                initial={{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }} animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0)' }}
                transition={{ duration: 3.2, delay: 1.2, ease: 'easeInOut' }}
                className="hand line-clamp-3 max-w-md text-[1.4rem] leading-snug md:text-right md:text-[2.1rem]"
                style={{ color: d.tokens.orb.core, textShadow: '0 1px 18px rgba(0,0,0,0.6)' }}
              >
                «{d.mood.quote}»
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* Нижняя панель */}
      <footer className="absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center gap-2 px-4 pb-5 md:px-10">
        <span className="chip max-w-[60vw] truncate" title={songLabel}>♪ {songLabel}{src === 'meta' ? ' · оценка по метаданным' : src === 'manual' ? ' · вручную' : ''}</span>
        {link && (link.embed
          ? <button className="chip" onClick={() => setEmbed((e) => !e)}>{embed ? 'Скрыть плеер' : S.openSong}</button>
          : <a className="chip" href={d.song.url} target="_blank" rel="noreferrer">{S.openSong} ↗</a>)}
        {entered && player.current?.voiceMode !== 'none' && (
          <button className="chip" onClick={() => player.current?.playVoice()}>
            ◐ {S.voice}: {player.current?.voiceMode === 'saved' ? S.voiceSaved : S.voiceLive}
          </button>
        )}
        <span className="flex-1" />
        <button className="chip" onClick={doExport} disabled={busy}>{busy ? 'Собираем…' : S.exportZip}</button>
        <button className="chip" onClick={doDelete}>{S.delete}</button>
      </footer>

      {/* Вход в день — звук только по клику */}
      <AnimatePresence>
        {!entered && (
          <motion.div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center" exit={{ opacity: 0 }} transition={{ duration: 1 }}>
            <button onClick={enter} className="btn btn-light pointer-events-auto px-7 py-3.5 text-base">
              {S.enter} <span className="text-xs opacity-70">· {S.enterHint}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Встроенный плеер ссылки */}
      {embed && link?.embed && (
        <div className="absolute left-4 top-20 z-30 w-[min(92vw,340px)] overflow-hidden rounded-[14px] border border-line bg-bg md:left-10 md:top-24">
          <iframe src={link.embed} title="Песня дня" allow="autoplay; encrypted-media" className="block w-full"
            style={{ height: link.provider === 'spotify' ? 152 : link.provider === 'soundcloud' ? 120 : 200, border: 0 }} />
        </div>
      )}

      {/* Почему так выглядит */}
      <AnimatePresence>
        {why && (
          <motion.aside
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-y-0 right-0 z-40 w-full max-w-sm overflow-y-auto border-l border-line bg-[#09090e]/95 p-6 backdrop-blur-sm"
          >
            <button className="btn mb-6" onClick={() => setWhy(false)}>Закрыть</button>
            <WhyPanel explain={d.explain} tokens={d.tokens} mood={d.mood} engine={d.analysisEngine} audio={d.song.analysis} />
            <p className="mt-6 text-[0.72rem] leading-relaxed text-faint">{d.text}</p>
          </motion.aside>
        )}
      </AnimatePresence>
    </main>
  );
}
