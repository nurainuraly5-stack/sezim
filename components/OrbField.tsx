'use client';
// Архив как пространство сфер: спираль по времени (новые — в центре), перетаскивание, наведение.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import OrbCanvas from './OrbCanvas';
import type { OrbDraw } from './orb-renderer';
import type { DayEntry } from '@/core/types';
import { formatDate } from '@/core/strings';

type Item = Pick<DayEntry, 'id' | 'date' | 'mood' | 'tokens'>;

export default function OrbField({ days, matches }: { days: Item[]; matches: (d: Item) => boolean }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const small = size.w < 640;
    const base = small ? 118 : 168;
    const gap = small ? 74 : 104;
    return days.map((d, i) => {
      const a = i * 2.39996; // золотой угол
      const rad = i === 0 ? 0 : gap * Math.sqrt(i + 0.6);
      const s = base * (0.82 + d.mood.arousal * 0.18 + d.mood.valence * 0.12);
      return { d, x: Math.cos(a) * rad, y: Math.sin(a) * rad * 0.82, s };
    });
  }, [days, size.w]);

  const orbs: OrbDraw[] = layout.map(({ d, x, y, s }) => ({
    id: d.id, tokens: d.tokens, contrast: d.mood.contrast,
    x: size.w / 2 + x + pan.x, y: size.h / 2 + y + pan.y,
    size: s * (matches(d) ? 1 : 0.55), hover: hover === d.id ? 1 : 0,
  }));

  return (
    <div
      ref={box}
      className="relative h-full w-full touch-none select-none overflow-hidden"
      style={{ cursor: drag.current ? 'grabbing' : 'grab' }}
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false }; }}
      onPointerMove={(e) => {
        const g = drag.current; if (!g) return;
        const dx = e.clientX - g.x, dy = e.clientY - g.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
        setPan({ x: g.px + dx, y: g.py + dy });
      }}
      onPointerUp={() => { setTimeout(() => { drag.current = null; }, 0); }}
      onPointerLeave={() => { drag.current = null; }}
    >
      <OrbCanvas orbs={orbs} className="absolute inset-0" />
      {layout.map(({ d, s }, i) => {
        const o = orbs[i];
        const on = matches(d);
        return (
          <button
            key={d.id}
            aria-label={`${d.mood.title}, ${formatDate(d.date)}`}
            className="orb-hit absolute rounded-full"
            style={{
              left: o.x - (s * 0.56) / 2, top: o.y - (s * 0.56) / 2, width: s * 0.56, height: s * 0.56,
              opacity: on ? 1 : 0.35,
            }}
            onPointerEnter={() => setHover(d.id)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(d.id)}
            onBlur={() => setHover(null)}
            onClick={() => { if (!drag.current?.moved) router.push(`/day/${d.id}`); }}
          >
            <span
              className="pointer-events-none absolute left-1/2 top-full mt-3 w-56 -translate-x-1/2 text-center transition-opacity duration-500"
              style={{ opacity: on ? (hover === d.id ? 1 : 0.78) : 0.3 }}
            >
              <span className="block font-display text-[1.05rem] leading-tight text-ink">{d.mood.title}</span>
              <span className="mt-1 block text-[0.68rem] uppercase tracking-[0.18em] text-mute">{formatDate(d.date)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
