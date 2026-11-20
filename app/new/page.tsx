'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useMedia, useWidth } from '@/components/useMedia';
import { orbFrame, orbSize } from '@/design/tokens';
import Orb from '@/components/Orb';
import { warmShaders } from '@/components/gl-warmup';
import { orbParams } from '@/core/orb';
import WhyPanel from '@/components/WhyPanel';
import { S } from '@/core/strings';
import { analyzePhotos, resizePhoto } from '@/core/analyze/photo';
import { analyzeAudioFile } from '@/core/analyze/audio';
import { TEMPO_PRESETS, linkAudio, parseSongLink, type ManualSong } from '@/core/analyze/song-link';
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
  const [manual, setManual] = useState<ManualSong>({});

  // ошибки показываем после первой попытки и пересчитываем на лету: заполнил поле — строка исчезла
  const [tried, setTried] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [titleEdit, setTitleEdit] = useState<string | null>(null); // null — название предлагает система
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
    return linkAudio(meta, manual);
  }, [songKind, file, fileAudio, link, meta, manual]);

  // --- живое превью
  const debText = useDebounced(text, 250);
  const preview = useMemo(() => previewStyle(debText, photoFeatures, audio, meta), [debText, photoFeatures, audio, meta]);
  const hasSong = songKind === 'file' ? !!file : !!link;
  const previewOrb = useMemo(() => orbParams({
    text: debText.trim(), createdAt: draftAt, mood: preview.mood, tokens: preview.tokens, photo: photoFeatures, audio, meta,
  }), [debText, draftAt, preview, photoFeatures, audio, meta]);

  const missing: string[] = [];
  if (text.trim().split(/\s+/).length < 4) missing.push(S.needText);
  if (!photos.length) missing.push(S.needPhoto);
  if (!hasSong) missing.push(S.needSong);
  const errors = [...(tried ? missing : []), ...(saveError ? [saveError] : [])];

  // после создания откроется экран дня — его шейдеры собираем заранее, пока человек пишет
  useEffect(() => { warmShaders(previewOrb); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setTried(true);
    setSaveError('');
    if (missing.length) return;
    setCreating(true);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, S.steps.length - 1)), 900);
    try {
      const yearNum = meta.year ? Number(meta.year) : undefined;
      const day = await createDay({
        text: text.trim(), photos, photoFeatures, date, audio,
        song: songKind === 'file'
          ? { kind: 'file', file, fileName: file?.name, meta: { ...meta, year: yearNum } }
          : { kind: 'link', url: url.trim(), meta: { ...meta, year: yearNum } },
      }, { createdAt: draftAt, titleOverride: titleEdit ?? undefined });
      router.push(`/day/${day.id}?new=1`);
    } catch (e) {
      console.error(e);
      setSaveError(S.saveFailed);
      setCreating(false);
    } finally {
      clearInterval(timer);
    }
  }

  const mobile = useMedia('(max-width: 767px)');
  const [previewRef, previewW] = useWidth(360);
  // На телефоне превью стоит под формой: пока оно не на экране, показываем маленькую сферу с палитрой —
  // причинность «добавил фото/песню → сфера изменилась» видна без прокрутки.
  const asideRef = useRef<HTMLElement>(null);
  const [previewInView, setPreviewInView] = useState(true);
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setPreviewInView(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const miniFrame = Math.round(orbSize.mini / (orbFrame.radius * 2));
  const frame = Math.min(Math.round((mobile ? orbSize.preview.mobile : orbSize.preview.desktop) / (orbFrame.radius * 2)), Math.floor(previewW / 0.95));
  const audioNote = audioBusy ? S.analyzingAudio
    : fileAudio ? `${fileAudio.bpm} BPM, ${fileAudio.mode === 'major' ? S.major : fileAudio.mode === 'minor' ? S.minor : 'лад не ясен'}${fileAudio.key ? ` (${fileAudio.key})` : ''}, энергия ${Math.round(fileAudio.energy * 100)}% — ${S.audioReal}`
    : file ? 'Файл не разобрался — темп возьмём из текста.' : '';

  return (
    <AppShell>
      <div className="mx-auto grid max-w-[1280px] gap-8 px-4 pb-16 pt-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:px-10 lg:pt-10">
        <section aria-label="Запись дня" className="flex min-w-0 flex-col gap-6">
          <header className="flex flex-col gap-3">
            <h1 className="t-display">{S.writeTitle}</h1>
            <p className="t-body soft measure">{S.writeSub}</p>
          </header>

          <div className="card flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label htmlFor="day-text" className="t-h3">{S.textLabel}</label>
              <label className="flex items-center gap-2">
                <span className="t-caption">{S.dateLabel}</span>
                <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} className="field min-h-[40px] w-auto py-1.5" />
              </label>
            </div>
            <textarea id="day-text" value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder={S.textPlaceholder} className="field" />
          </div>

          <div className="card flex flex-col gap-4 p-5">
            <h2 className="t-h3">{S.photos}</h2>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); addPhotos(e.dataTransfer.files); }}
              onClick={() => fileInput.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.current?.click(); } }}
              role="button" tabIndex={0} aria-label={S.photosHint}
              className="flex min-h-32 cursor-pointer flex-wrap items-center gap-3 rounded-[var(--r-md)] border-2 border-dashed p-4 transition-colors"
              style={{ borderColor: dragOver ? 'var(--accent)' : 'var(--line)', background: dragOver ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'transparent' }}
            >
              {thumbs.map((t, i) => (
                <span key={t} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t} alt="" className="h-20 w-20 rounded-[var(--r-sm)] object-cover" />
                  <button type="button" aria-label="Убрать фото" onClick={(e) => { e.stopPropagation(); removePhoto(i); }}
                    className="t-caption absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border border-line bg-[var(--surface-strong)]" style={{ color: 'var(--ink)' }}>×</button>
                </span>
              ))}
              <span className="t-strong soft flex-1 text-center">{photoBusy ? 'Смотрим фото…' : S.photosHint}</span>
              <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && addPhotos(e.target.files)} />
            </div>
          </div>

          <div className="card flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="t-h3">{S.song}</h2>
              <div className="flex gap-2" role="group" aria-label="Как добавить песню">
                <button type="button" className="chip" aria-pressed={songKind === 'link'} onClick={() => setSongKind('link')}>{S.linkKind}</button>
                <button type="button" className="chip" aria-pressed={songKind === 'file'} onClick={() => setSongKind('file')}>{S.fileKind}</button>
              </div>
            </div>
            {songKind === 'link' ? (
              <>
                <input className="field" placeholder={S.songLinkPlaceholder} value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" aria-label="Ссылка на песню" />
                {url && !parseSongLink(url) && <p className="t-caption" style={{ color: 'var(--ink)' }}>Это не похоже на ссылку.</p>}
                {link && (
                  <div className="flex flex-col gap-3 rounded-[var(--r-md)] border border-line p-4">
                    <p className="t-caption">Звук по ссылке не анализируется: темп и лад {audio?.source === 'manual' ? 'заданы тобой' : 'оценены по названию'}. Можно поправить.</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="t-caption w-14">{S.tempo}</span>
                      {TEMPO_PRESETS.map((t) => (
                        <button key={t.bpm} type="button" className="chip" aria-pressed={manual.bpm === t.bpm}
                          onClick={() => setManual((m) => ({ ...m, bpm: m.bpm === t.bpm ? undefined : t.bpm }))}>{t.label}</button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="t-caption w-14">{S.mode}</span>
                      {(['major', 'minor', 'unknown'] as const).map((m) => (
                        <button key={m} type="button" className="chip" aria-pressed={manual.mode === m}
                          onClick={() => setManual((x) => ({ ...x, mode: x.mode === m ? undefined : m }))}>{S[m]}</button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-start gap-2">
                <label className="btn cursor-pointer">
                  {file ? file.name : S.songFile}
                  <input type="file" accept="audio/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
                </label>
                {audioNote && <p className="t-caption" aria-live="polite">{audioNote}</p>}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem]">
              <input className="field" placeholder={S.songTitle} value={meta.title ?? ''} onChange={(e) => setMeta({ ...meta, title: e.target.value })} aria-label={S.songTitle} />
              <input className="field" placeholder={S.songArtist} value={meta.artist ?? ''} onChange={(e) => setMeta({ ...meta, artist: e.target.value })} aria-label={S.songArtist} />
              <input className="field" placeholder={S.songYear} inputMode="numeric" value={meta.year ?? ''}
                onChange={(e) => setMeta({ ...meta, year: e.target.value ? Number(e.target.value.replace(/\D/g, '').slice(0, 4)) : undefined })} aria-label={S.songYear} />
            </div>
          </div>

          {errors.length > 0 && (
            <ul className="card card-strong flex flex-col gap-1 p-4" role="alert">
              {errors.map((e) => <li key={e} className="t-strong">{e}</li>)}
            </ul>
          )}
          <button className="btn btn-primary self-start px-7" onClick={submit} disabled={creating || audioBusy || photoBusy}>
            {creating ? S.creating : S.create}
          </button>
        </section>

        {mobile && !previewInView && (
          <button
            type="button" onClick={() => asideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            aria-label={S.toPreview}
            // узкая колонка справа: не перекрывает кнопку «Создать» (она слева); фон непрозрачный
            className="fixed bottom-4 right-4 z-30 flex w-16 flex-col items-center gap-1.5 border border-line pb-2.5 pt-1"
            style={{ borderRadius: 'var(--r-pill)', background: 'var(--c-bg)', boxShadow: 'var(--shadow-card)' }}
          >
            <span className="relative block overflow-hidden rounded-full" style={{ width: orbSize.mini + 8, height: orbSize.mini + 8 }}>
              <Orb params={previewOrb} size={miniFrame} className="pointer-events-none absolute left-1/2"
                style={{ top: 4 + orbSize.mini / 2 - miniFrame * orbFrame.cy, marginLeft: -miniFrame / 2 }} />
            </span>
            <span className="flex gap-[3px]" aria-hidden>
              {preview.tokens.palette.slice(0, 5).map((c, i) => <span key={i} className="h-2 w-2 rounded-full" style={{ background: c }} />)}
            </span>
          </button>
        )}

        <aside ref={asideRef} aria-label={S.livePreview} className="scroll-mt-20 lg:sticky lg:top-10 lg:self-start">
          <div ref={previewRef} className="card flex flex-col gap-5 p-5">
            <h2 className="t-h3">{S.livePreview}</h2>
            <div className="relative mx-auto w-full" style={{ height: frame * 0.86, maxWidth: frame }}>
              <Orb params={previewOrb} size={frame} live hover={creating} speed={creating ? 3 : 1}
                className="pointer-events-none absolute left-1/2" style={{ top: -frame * 0.05, marginLeft: -frame / 2 }} />
            </div>
            {creating && <p className="t-caption text-center" aria-live="polite">{S.steps[step]}</p>}
            <label className="flex flex-col gap-2">
              <span className="t-caption">{S.titleLabel}</span>
              <input className="field t-title" value={titleEdit ?? (text.trim() ? preview.mood.title : '')} placeholder={S.titleEmpty}
                onChange={(e) => setTitleEdit(e.target.value)} maxLength={70} />
              <span className="t-micro">{S.titleHint}</span>
            </label>
            <WhyPanel explain={preview.explain} tokens={preview.tokens} audio={audio} />
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
