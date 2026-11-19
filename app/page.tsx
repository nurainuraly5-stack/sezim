'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import Logo from '@/components/Logo';
import OrbField from '@/components/OrbField';
import DayStrip from '@/components/DayStrip';
import { listDays } from '@/lib/db';
import { seedIfEmpty } from '@/lib/seed';
import { S, formatDate } from '@/core/strings';
import type { DayEntry } from '@/core/types';

type View = 'orbs' | 'strip';

export default function ArchivePage() {
  const [days, setDays] = useState<DayEntry[] | null>(null);
  const [seeding, setSeeding] = useState<[number, number] | null>(null);
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>('orbs');

  useEffect(() => {
    try { const v = localStorage.getItem('sezim:view'); if (v === 'strip' || v === 'orbs') setView(v); } catch {}
    (async () => {
      try {
        await seedIfEmpty(async (i, n) => {
          setSeeding(i < n ? [i, n] : null);
          setDays(await listDays());
        });
      } catch (e) {
        console.warn('seed failed', e);
      }
      setSeeding(null);
      setDays(await listDays());
    })();
  }, []);

  const pick = (v: View) => { setView(v); try { localStorage.setItem('sezim:view', v); } catch {} };

  const matches = useCallback((d: Pick<DayEntry, 'date' | 'mood'>) => {
    const s = q.trim().toLowerCase().replace(/ё/g, 'е');
    if (!s) return true;
    const hay = [d.mood.title, d.date, formatDate(d.date), d.date.split('-').reverse().join('.')].join(' ').toLowerCase().replace(/ё/g, 'е');
    return hay.includes(s);
  }, [q]);

  const found = useMemo(() => (days ?? []).filter(matches).length, [days, matches]);

  return (
    <main className="relative flex h-[100dvh] flex-col">
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 pt-5 md:px-10 md:pt-7">
        <Logo />
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-line p-0.5" role="tablist" aria-label="Вид архива">
            {(['orbs', 'strip'] as View[]).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => pick(v)}
                className="rounded-full px-3.5 py-1.5 text-xs transition-colors duration-500"
                style={{ background: view === v ? 'var(--ink)' : 'transparent', color: view === v ? '#12100c' : 'var(--mute)' }}>
                {v === 'orbs' ? S.viewOrbs : S.viewStrip}
              </button>
            ))}
          </div>
          <Link href="/new" className="btn btn-light">{S.newDay}</Link>
        </div>
      </header>

      <div className="relative z-10 mx-auto mt-6 w-full max-w-md px-4">
        <input
          className="field text-center text-sm" placeholder={S.search} value={q}
          onChange={(e) => setQ(e.target.value)} aria-label={S.search} type="search"
        />
        <p className="mt-2 h-4 text-center text-[0.7rem] text-faint" aria-live="polite">
          {q && days ? (found ? `${found} из ${days.length}` : S.nothingFound) : ''}
        </p>
      </div>

      <section className="relative min-h-0 flex-1">
        {seeding && !days?.length && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
            <motion.span
              className="h-24 w-24 rounded-full"
              style={{ background: 'radial-gradient(circle at 40% 35%, #fff2d6, #e9c58f 40%, #3b4a6b 100%)', boxShadow: '0 0 60px 10px rgba(233,197,143,0.25)' }}
              animate={{ scale: [0.9, 1.05, 0.9], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <p className="label">{S.seeding}</p>
          </div>
        )}
        {seeding && !!days?.length && (
          <p className="label pointer-events-none absolute inset-x-0 bottom-2 z-10 text-center">{S.seeding} {seeding[0]}/{seeding[1]}</p>
        )}
        {days && days.length === 0 && !seeding && (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
            <p className="font-display text-2xl text-mute">{S.emptyArchive}</p>
            <Link href="/new" className="btn btn-light">{S.newDay}</Link>
          </div>
        )}
        {days && days.length > 0 && (
          view === 'orbs'
            ? <OrbField days={days} matches={matches} />
            : <DayStrip days={days} matches={matches} />
        )}
      </section>

      <footer className="pointer-events-none relative z-10 px-4 pb-4 text-center text-[0.68rem] tracking-[0.2em] text-faint md:pb-6">
        DAYS YOU CAN FEEL AGAIN
      </footer>
    </main>
  );
}
