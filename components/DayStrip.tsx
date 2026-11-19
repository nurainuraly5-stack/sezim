'use client';
// Лента последних дней (ленточный тест: 5–7 дней одного автора подряд).
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { DayEntry } from '@/core/types';
import { formatDate, DAYPART_RU } from '@/core/strings';
import { TECHNIQUES } from '@/core/style-engine';

export default function DayStrip({ days, matches }: { days: DayEntry[]; matches: (d: DayEntry) => boolean }) {
  const shown = days.filter(matches).slice(0, 7);
  const ids = shown.map((d) => d.id).join(',');
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const m: Record<string, string> = {};
    for (const d of shown) { const b = d.thumb ?? d.photos[0]; if (b) m[d.id] = URL.createObjectURL(b); }
    setUrls(m);
    return () => Object.values(m).forEach((u) => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  return (
    <div className="strip flex h-full w-full snap-x snap-mandatory items-center gap-5 overflow-x-auto px-4 pb-6 md:gap-7 md:px-10">
      {shown.map((d) => (
        <Link
          key={d.id}
          href={`/day/${d.id}`}
          className="group relative flex h-[min(68vh,520px)] w-[min(78vw,300px)] shrink-0 snap-center flex-col overflow-hidden rounded-[22px] border border-line"
          style={{ background: `linear-gradient(180deg, ${d.tokens.palette[0]} 0%, #07070b 85%)` }}
        >
          <div className="relative flex flex-1 items-center justify-center">
            {urls[d.id] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[d.id]} alt="" className="h-40 w-40 rounded-full object-cover mix-blend-screen transition-transform duration-700 group-hover:scale-105" />
            )}
          </div>
          <div className="flex gap-1 px-5">
            {d.tokens.palette.map((c, i) => <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: c }} />)}
          </div>
          <div className="px-5 pb-5 pt-4">
            <p className="text-[0.66rem] uppercase tracking-[0.18em] text-mute">
              {formatDate(d.date)}{DAYPART_RU[d.mood.daypart] ? ` · ${DAYPART_RU[d.mood.daypart]}` : ''}
            </p>
            <h3 className="mt-2 font-display text-[1.45rem] leading-[1.1] text-ink" style={{ fontWeight: d.tokens.typeWeight }}>{d.mood.title}</h3>
            <p className="mt-2 text-xs text-mute">{TECHNIQUES[d.tokens.technique].name} · {d.mood.tempo} BPM</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
