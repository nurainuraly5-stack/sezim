'use client';
// Ряд сфер архива. Подпись (дата + название) — под сферой, не на ней. Живой рендер — только у
// выбранной сферы и под курсором; остальные — сохранённые миниатюры.
import { useMemo, useState } from 'react';
import type { DayEntry } from '@/core/types';
import { orbParams, orbSource } from '@/core/orb';
import { orbFrame, orbSize } from '@/design/tokens';
import { formatDate, formatDateShort } from '@/core/strings';
import Orb from './Orb';

export function orbFrameSize(mobile: boolean) {
  const body = mobile ? orbSize.archive.mobile : orbSize.archive.desktop;
  return Math.round(body / (orbFrame.radius * 2));
}

/** Видимая часть кадра сферы: от верхнего края колец до тени (остальное — прозрачный ореол). */
const CROP_TOP = 0.05, CROP_BOTTOM = 0.93;

export default function OrbGrid({ days, selected, thumbs, mobile, onPick }: {
  days: DayEntry[]; selected?: string; thumbs: Record<string, string>; mobile: boolean; onPick: (d: DayEntry) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const frame = orbFrameSize(mobile);
  const params = useMemo(() => new Map(days.map((d) => [d.id, orbParams(orbSource(d))])), [days]);
  const h = Math.round(frame * (CROP_BOTTOM - CROP_TOP));

  return (
    <ul className="grid gap-x-4 gap-y-8 sm:gap-x-6" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${mobile ? 150 : 184}px, 1fr))` }}>
      {days.map((d) => {
        const on = selected === d.id;
        const live = on || hover === d.id;
        return (
          <li key={d.id}>
            <button
              onClick={() => onPick(d)}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(d.id); }}
              onPointerLeave={() => setHover(null)}
              aria-pressed={on}
              aria-label={`${d.mood.title}, ${formatDate(d.date)}`}
              title={d.mood.title}
              className="group flex w-full flex-col items-center rounded-[var(--r-lg)] px-2 pb-3 text-center transition-colors"
              style={{ background: on ? 'var(--surface)' : 'transparent', boxShadow: on ? 'inset 0 0 0 1px var(--line)' : 'none' }}
            >
              <span className="relative block w-full" style={{ height: h }}>
                <Orb
                  params={params.get(d.id)!} size={frame} live={live} hover={live} thumbUrl={thumbs[d.id]}
                  className="pointer-events-none absolute left-1/2"
                  style={{ top: -frame * CROP_TOP, marginLeft: -frame / 2 }}
                />
              </span>
              <span className="t-date mt-1 block">{formatDateShort(d.date)}</span>
              <span className="t-title mt-0.5 line-clamp-2 block max-w-[22ch]">{d.mood.title}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
