'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import Logo from '@/components/Logo';
import Orb from '@/components/Orb';
import { orbParams } from '@/core/orb';
import WhyPanel from '@/components/WhyPanel';
import { S } from '@/core/strings';
import { analyzePhotos, resizePhoto } from '@/core/analyze/photo';
import { analyzeAudioFile } from '@/core/analyze/audio';
import { estimateFromMeta, parseSongLink } from '@/core/analyze/song-link';
import type { AudioFeatures, PhotoFeatures, SongMeta } from '@/core/types';
import { analyzeRemote, createDay, previewStyle } from '@/lib/pipeline';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

const TEMPOS = [{ label: 'медленно', bpm: 76 }, { label: 'средне', bpm: 104 }, { label: 'быстро', bpm: 134 }];

export default function NewDayPage() {
  const router = useRouter();
  const [text, setText] = useState('');
  // время создания черновика входит в сид: сохранённая сфера совпадает с превью
  const [draftAt] = useState(() => Date.now());
  const [date, setDate] = useState(today);
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [photoFeatures, setPhotoFeatures] = useState<PhotoFeatures>();
  const [photoBusy, setPhotoBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [songKind, setSongKind] = useState<'link' | 'file'>('link');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File>();
  const [meta, setMeta] = useState<SongMeta>({});
  const [fileAudio, setFileAudio] = useState<AudioFeatures>();
  const [audioBusy, setAudioBusy] = useState(false);
  const [manual, setManual] = useState<{ bpm?: number; mode?: 'major' | 'minor' | 'unknown' }>({});

  const [errors, setErrors] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  // --- фото
  async function addPhotos(list: FileList | File[]) {
    const files = Array.from(list).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setPhotoBusy(true);
    try {
      const resized = await Promise.all(files.map((f) => resizePhoto(f)));
      const next = [...photos, ...resized].slice(0, 12);
      setPhotos(next);
      setPhotoFeatures(await analyzePhotos(next));
    } finally { setPhotoBusy(false); }
  }
  async function removePhoto(i: number) {
    const next = photos.filter((_, j) => j !== i);
    setPhotos(next);
    setPhotoFeatures(next.length ? await analyzePhotos(next) : undefined);
  }
  useEffect(() => {
    const u = photos.map((p) => URL.createObjectURL(p));
    setThumbs(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [photos]);

  // --- песня: файл → реальный анализ
  async function pickFile(f?: File) {
    if (!f) return;
    setFile(f); setSongKind('file'); setFileAudio(undefined); setAudioBusy(true);
    setMeta((m) => ({ ...m, title: m.title || f.name.replace(/\.[^.]+$/, '') }));
    const a = await analyzeAudioFile(f);
    setFileAudio(a); setAudioBusy(false);
  }

  // --- песня: ссылка → oEmbed-метаданные
  const debUrl = useDebounced(url, 500);
  const link = useMemo(() => (debUrl ? parseSongLink(debUrl) : null), [debUrl]);
  useEffect(() => {
    if (songKind !== 'link' || !link || link.provider === 'other') return;
    let off = false;
    analyzeRemote('', debUrl).then((r) => {
      if (off || !r?.songMeta) return;
      setMeta((m) => ({ ...m, title: m.title || r.songMeta!.title, artist: m.artist || r.songMeta!.artist }));
    });
    return () => { off = true; };
  }, [debUrl, link, songKind]);

  const audio: AudioFeatures | undefined = useMemo(() => {
    if (songKind === 'file') return file ? fileAudio : undefined;
    if (!link) return undefined;
    const est = estimateFromMeta(meta);
    if (manual.bpm || manual.mode) {
      return { ...est, source: 'manual', bpm: manual.bpm ?? est.bpm, mode: manual.mode ?? est.mode, confidence: 0.5 };
    }
    return est;
  }, [songKind, file, fileAudio, link, meta, manual]);

  // --- живое превью
  const debText = useDebounced(text, 250);
  const preview = useMemo(() => previewStyle(debText, photoFeatures, audio, meta), [debText, photoFeatures, audio, meta]);
  const hasSong = songKind === 'file' ? !!file : !!link;
  const previewOrb = useMemo(() => orbParams({
    text: debText.trim(), createdAt: draftAt, mood: preview.mood, tokens: preview.tokens, photo: photoFeatures, audio, meta,
  }), [debText, draftAt, preview, photoFeatures, audio, meta]);

  async function submit() {
    const errs: string[] = [];
    if (text.trim().split(/\s+/).length < 4) errs.push(S.needText);
    if (!photos.length) errs.push(S.needPhoto);
    if (!hasSong) errs.push(S.needSong);
    setErrors(errs);
    if (errs.length) return;
    setCreating(true);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, S.steps.length - 1)), 900);
    try {
      const yearNum = meta.year ? Number(meta.year) : undefined;
      const day = await createDay({
        text: text.trim(), photos, photoFeatures, date, audio,
        song: songKind === 'file'
          ? { kind: 'file', file, fileName: file?.name, meta: { ...meta, year: yearNum } }
          : { kind: 'link', url: url.trim(), meta: { ...meta, year: yearNum } },
      }, { createdAt: draftAt });
      router.push(`/day/${day.id}?new=1`);
    } catch (e) {
      console.error(e);
      setErrors(['Не получилось сохранить день. Попробуйте ещё раз.']);
      setCreating(false);
    } finally {
      clearInterval(timer);
    }
  }

  return (
    <main className="relative min-h-[100dvh] pb-16">
      <header className="flex items-center justify-between px-4 pt-5 md:px-10 md:pt-7">
        <Logo />
        <button className="btn" onClick={() => router.push('/')}>{S.archive}</button>
      </header>

      <div className="mx-auto mt-6 grid max-w-6xl gap-10 px-4 md:mt-10 md:grid-cols-[1.05fr_0.95fr] md:px-10">
        {/* --- ввод --- */}
        <section className="space-y-10" aria-label="Запись дня">
          <div>
            <div className="flex items-end justify-between gap-4">
              <h1 className="font-display text-[2.4rem] leading-none text-ink md:text-[3.1rem]">{S.writeTitle}</h1>
              <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())}
                className="field w-auto text-sm text-mute" aria-label="Дата" />
            </div>
            <textarea
              value={text} onChange={(e) => setText(e.target.value)} rows={7}
              placeholder={S.textPlaceholder}
              className="field mt-6 resize-none text-[1.05rem] leading-relaxed"
              aria-label="Текст о дне"
            />
          </div>

          <div>
            <p className="label">{S.photos}</p>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); addPhotos(e.dataTransfer.files); }}
              onClick={() => fileInput.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click(); }}
              role="button" tabIndex={0}
              className="mt-3 flex min-h-32 cursor-pointer flex-wrap items-center gap-3 rounded-[18px] border border-dashed p-4 transition-colors duration-500"
              style={{ borderColor: dragOver ? 'rgba(233,197,143,0.7)' : 'var(--line)', background: dragOver ? 'rgba(233,197,143,0.04)' : 'transparent' }}
            >
              {thumbs.map((t, i) => (
                <span key={t} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t} alt="" className="h-20 w-20 rounded-[10px] object-cover" />
                  <button type="button" aria-label="Убрать фото"
                    onClick={(e) => { e.stopPropagation(); removePhoto(i); }}
                    className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-bg text-xs text-ink opacity-80 ring-1 ring-line hover:opacity-100">×</button>
                </span>
              ))}
              <span className="flex-1 text-center text-sm text-faint">{photoBusy ? 'Смотрим фото…' : S.photosHint}</span>
              <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && addPhotos(e.target.files)} />
            </div>
          </div>

          <div>
            <p className="label">{S.song}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" className="chip" data-on={songKind === 'link'} onClick={() => setSongKind('link')}>Ссылка</button>
              <button type="button" className="chip" data-on={songKind === 'file'} onClick={() => setSongKind('file')}>Файл</button>
            </div>
            {songKind === 'link' ? (
              <div className="mt-4 space-y-4">
                <input className="field" placeholder={S.songLinkPlaceholder} value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" aria-label="Ссылка на песню" />
                {url && !parseSongLink(url) && <p className="text-xs text-[#e9a08f]">Это не похоже на ссылку</p>}
                {link && (
                  <div className="space-y-3 rounded-[14px] border border-line p-4">
                    <p className="text-[0.72rem] text-faint">Аудио по ссылке недоступно для анализа — темп и лад {audio?.source === 'manual' ? 'заданы вами' : 'оценены по названию'}. Можно поправить:</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-12 text-[0.72rem] text-mute">{S.tempo}</span>
                      {TEMPOS.map((t) => (
                        <button key={t.bpm} type="button" className="chip" data-on={manual.bpm === t.bpm}
                          onClick={() => setManual((m) => ({ ...m, bpm: m.bpm === t.bpm ? undefined : t.bpm }))}>{t.label}</button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-12 text-[0.72rem] text-mute">{S.mode}</span>
                      {(['major', 'minor', 'unknown'] as const).map((m) => (
                        <button key={m} type="button" className="chip" data-on={manual.mode === m}
                          onClick={() => setManual((x) => ({ ...x, mode: x.mode === m ? undefined : m }))}>{S[m]}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                <label className="btn cursor-pointer">
                  {file ? file.name : S.songFile}
                  <input type="file" accept="audio/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
                </label>
                <p className="text-[0.72rem] text-faint" aria-live="polite">
                  {audioBusy ? S.analyzingAudio
                    : fileAudio ? `${fileAudio.bpm} BPM · ${fileAudio.mode === 'major' ? S.major : fileAudio.mode === 'minor' ? S.minor : 'лад не ясен'}${fileAudio.key ? ` (${fileAudio.key})` : ''} · энергия ${Math.round(fileAudio.energy * 100)}% — ${S.audioReal}`
                    : file ? 'Не удалось разобрать файл — сфера возьмёт темп из текста' : ''}
                </p>
              </div>
            )}
            <div className="mt-4 grid grid-cols-[1fr_1fr_5rem] gap-3">
              <input className="field text-sm" placeholder={S.songTitle} value={meta.title ?? ''} onChange={(e) => setMeta({ ...meta, title: e.target.value })} aria-label={S.songTitle} />
              <input className="field text-sm" placeholder={S.songArtist} value={meta.artist ?? ''} onChange={(e) => setMeta({ ...meta, artist: e.target.value })} aria-label={S.songArtist} />
              <input className="field text-sm" placeholder={S.songYear} inputMode="numeric" value={meta.year ?? ''}
                onChange={(e) => setMeta({ ...meta, year: e.target.value ? Number(e.target.value.replace(/\D/g, '').slice(0, 4)) : undefined })} aria-label={S.songYear} />
            </div>
          </div>

          {errors.length > 0 && (
            <ul className="space-y-1 text-sm text-[#e9a08f]" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          )}
          <button className="btn btn-light px-6 py-3 text-[0.95rem]" onClick={submit} disabled={creating || audioBusy || photoBusy}>
            {creating ? S.creating : S.create}
          </button>
        </section>

        {/* --- живое превью --- */}
        <aside className="md:sticky md:top-8 md:self-start" aria-label={S.livePreview}>
          <p className="label">{S.livePreview}</p>
          <div className="relative mx-auto mt-2 aspect-square w-full max-w-[420px]">
            <Orb params={previewOrb} size={360} live hover={creating} speed={creating ? 3 : 1}
              className="mx-auto max-w-full" style={{ height: 'auto', aspectRatio: '1' }} />
            <AnimatePresence>
              {creating && (
                <motion.p key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.5 }} className="label absolute inset-x-0 bottom-2 text-center">
                  {S.steps[step]}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          <p className="mt-1 text-center font-display text-[1.6rem] leading-tight text-ink" style={{ fontWeight: preview.tokens.typeWeight }}>
            {text.trim() ? preview.mood.title : '…'}
          </p>
          <div className="mt-8">
            <WhyPanel explain={preview.explain} tokens={preview.tokens} mood={preview.mood} audio={audio} compact />
          </div>
        </aside>
      </div>
    </main>
  );
}
