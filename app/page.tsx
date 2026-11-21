'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import DayPanel from '@/components/DayPanel';
import DayFeed from '@/components/DayFeed';
import OrbGrid from '@/components/OrbGrid';
import { useOrbThumbs } from '@/components/useOrbThumbs';
import { useMedia } from '@/components/useMedia';
import { warmShaders } from '@/components/gl-warmup';
import { orbWebglAvailable } from '@/components/orb-engine';
import { orbParams, orbSource } from '@/core/orb';
import { listDays } from '@/lib/db';
import { ensureStyle } from '@/lib/pipeline';
import { reseed, seedIfEmpty } from '@/lib/seed';
import { S, formatDate, formatMonth } from '@/core/strings';
import type { DayEntry } from '@/core/types';

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
type View = 'orbs' | 'feed';
const VIEW_KEY = 'sezim.archiveView';

export default function ArchivePage() {
  const router = useRouter();
  const [days, setDays] = useState<DayEntry[] | null>(null);
  const [seeding, setSeeding] = useState<[number, number] | null>(null);
  const [q, setQ] = useState('');
  const [month, setMonth] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>();
  const mobile = useMedia('(max-width: 767px)');
  const withPanel = useMedia('(min-width: 1280px)', true);
  const [view, setView] = useState<View>('orbs');
  const [noGl, setNoGl] = useState(false);
  useEffect(() => { setNoGl(!orbWebglAvailable()); }, []);

  // выбранный вид — удобство одного зрителя: помним в localStorage, без него работает вид по умолчанию
  useEffect(() => {
    try { if (localStorage.getItem(VIEW_KEY) === 'feed') setView('feed'); } catch {}
  }, []);
  function changeView(v: View) {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch {}
  }

  useEffect(() => {
    (async () => {
      // ?reseed=1 — пересобрать демо-дни (например, после того как на сервере появился ключ LLM); параметр убираем из адреса
      const url = new URL(window.location.href);
      const again = url.searchParams.has('reseed');
      if (again) { url.searchParams.delete('reseed'); window.history.replaceState(null, '', url); }
      try {
        await (again ? reseed : seedIfEmpty)(async (i, n) => {
          setSeeding(i < n ? [i, n] : null);
          setDays(await listDays());
        });
      } catch (e) {
        console.warn('seed failed', e);
      }
      setSeeding(null);
      // дни, посчитанные прошлой версией движка, пересчитываются из своих признаков (название и цитата те же)
      for (const d of await listDays()) await ensureStyle(d);
      setDays(await listDays());
    })();
  }, []);

  // пока смотрят архив — в фоне собираем шейдеры экрана дня, чтобы он открылся без паузы
  useEffect(() => {
    if (days?.length && !seeding) warmShaders(orbParams(orbSource(days[0])));
  }, [days, seeding]);

  const all = useMemo(() => days ?? [], [days]);
  const months = useMemo(() => Array.from(new Set(all.map((d) => d.date.slice(0, 7)))), [all]);
  const shown = useMemo(() => {
    const s = norm(q.trim());
    return all.filter((d) => {
      if (month && !d.date.startsWith(month)) return false;
      if (!s) return true;
      return norm([d.mood.title, d.date, formatDate(d.date), d.date.split('-').reverse().join('.')].join(' ')).includes(s);
    });
  }, [all, q, month]);
  const thumbs = useOrbThumbs(all);
  const current = shown.find((d) => d.id === selected) ?? shown[0];

  function pick(d: DayEntry) {
    if (withPanel) setSelected(d.id);
    else router.push(`/day/${d.id}`);
  }

  return (
    <AppShell>
      <div className="mx-auto grid max-w-[1600px] gap-8 px-4 pb-16 pt-6 md:px-6 lg:px-10 lg:pt-10 xl:grid-cols-[minmax(0,1fr)_var(--panel-w)]">
        <main className="min-w-0">
          <section className="flex flex-col gap-5">
            <h1 className="t-display">{S.heroTitle}</h1>
            <p className="t-body soft measure">{S.heroSub}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/new" className="btn btn-primary">{S.createMemory}</Link>
              <label className="relative block w-full sm:max-w-sm">
                <span className="sr-only">{S.search}</span>
                <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="11" cy="11" r="6.5" stroke="var(--ink-soft)" strokeWidth="2" /><path d="m16 16 4 4" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input type="search" className="field pl-10" placeholder={S.search} value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
            </div>
          </section>

          <section className="mt-10" aria-labelledby="mem-h">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="mem-h" className="t-h2">{S.yourMemories}</h2>
              <div className="flex items-center gap-3">
                {days && <p className="t-caption" aria-live="polite">{S.shown(shown.length, all.length)}</p>}
                <div className="flex gap-1 rounded-[var(--r-pill)] border border-line bg-surface p-1" role="group" aria-label={S.viewLabel}>
                  {(['orbs', 'feed'] as const).map((v) => (
                    <button key={v} className="chip border-transparent" aria-pressed={view === v} onClick={() => changeView(v)}>
                      {v === 'orbs' ? S.viewOrbs : S.viewFeed}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {months.length > 1 && (
              <div className="no-scrollbar -mx-1 mt-4 flex gap-2 overflow-x-auto px-1" role="group" aria-label="Фильтр по дате">
                <button className="chip shrink-0" aria-pressed={!month} onClick={() => setMonth(null)}>{S.allDates}</button>
                {months.map((m) => (
                  <button key={m} className="chip shrink-0" aria-pressed={month === m} onClick={() => setMonth(month === m ? null : m)}>{formatMonth(m)}</button>
                ))}
              </div>
            )}
            {noGl && view === 'orbs' && <p className="t-caption measure mt-4" role="status" data-webgl-notice>{S.noWebgl}</p>}
            {seeding && <p className="t-caption mt-4" aria-live="polite">{S.seeding(seeding[0], seeding[1])}</p>}

            <div className="mt-6">
              {days && all.length === 0 && !seeding && (
                <div className="card flex flex-col items-start gap-4 p-6">
                  <p className="t-body measure">{S.emptyArchive}</p>
                  <Link href="/new" className="btn btn-primary">{S.createMemory}</Link>
                </div>
              )}
              {all.length > 0 && shown.length === 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="t-body">{S.nothingFound}</p>
                  <button className="btn" onClick={() => { setQ(''); setMonth(null); }}>{S.resetFilter}</button>
                </div>
              )}
              {shown.length > 0 && (view === 'feed'
                ? <DayFeed days={shown} selected={withPanel ? current?.id : undefined} thumbs={thumbs} mobile={mobile} onPick={pick} />
                : <OrbGrid days={shown} selected={withPanel ? current?.id : undefined} thumbs={thumbs} mobile={mobile} onPick={pick} />
              )}
            </div>
          </section>
        </main>

        {withPanel && (
          <aside className="hidden xl:block" aria-label="Открытый день">
            <div className="sticky top-10">
              {current ? <DayPanel day={current} /> : days && <p className="t-body soft">{S.pickDay}</p>}
            </div>
          </aside>
        )}
      </div>
    </AppShell>
  );
}
