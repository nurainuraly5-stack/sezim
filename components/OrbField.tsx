'use client';
// Архив как пространство сфер: свободная сетка (новые — первыми), каждой сфере — своя ячейка
// с подписью под ней, поэтому ни сферы, ни подписи не пересекаются. Лишнее по высоте — прокрутка.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Orb from './Orb';
import { ORB_RENDER_VERSION } from './orb-engine';
import { orbParams, orbSource } from '@/core/orb';
import { orbFrame } from '@/design/tokens';
import type { DayEntry } from '@/core/types';
import { formatDate, formatDateShort, shortTitle } from '@/core/strings';
import { hashString } from '@/core/color';

type Item = DayEntry;

/** Видимый диаметр тела сферы — доля стороны её кадра (остальное — ореол, кольца, тень). */
const BODY = orbFrame.radius * 2;
const PAD = 16;

/** Крупнейший диаметр, при котором все сферы с подписями помещаются в поле; иначе — минимальный и прокрутка. */
function grid(n: number, w: number, h: number) {
  const small = w < 640;
  const [dMax, dMin] = small ? [132, 104] : [176, 132];
  const label = small ? 46 : 50; // две строки: короткое название + дата
  const availW = w - PAD * 2, availH = h - PAD * 2;
  let pick = null as null | { d: number; cols: number; rows: number; cw: number; ch: number; x0: number };
  for (let d = dMax; d >= dMin; d -= 4) {
    const minCw = d * (small ? 1.32 : 1.45);
    const rows = Math.ceil(n / Math.max(1, Math.min(n, Math.floor(availW / minCw))));
    const cols = Math.ceil(n / rows); // ровные ряды: 6 → 3+3, а не 5+1
    const ch = d + label + (small ? 18 : 30);
    const cw = Math.min(availW / cols, d * 1.9);
    pick = { d, cols, rows, cw, ch, x0: PAD + (availW - cw * cols) / 2 };
    if (rows * ch <= availH) break;
  }
  return { ...pick!, label, small };
}

export default function OrbField({ days, matches }: { days: Item[]; matches: (d: Item) => boolean }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [scroll, setScroll] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const drag = useRef<{ y: number; s: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = useMemo(() => grid(days.length, size.w, size.h), [days.length, size.w, size.h]);
  const contentH = g.rows * g.ch + PAD * 2;
  const maxScroll = Math.max(0, contentH - size.h);
  const top = contentH <= size.h ? (size.h - contentH) / 2 : 0; // помещается — по центру по вертикали
  const clamp = (v: number) => Math.min(maxScroll, Math.max(0, v));
  useEffect(() => { setScroll((s) => Math.min(s, maxScroll)); }, [maxScroll]);

  const layout = useMemo(() => days.map((d, i) => {
    const row = Math.floor(i / g.cols), col = i % g.cols;
    const inRow = Math.min(g.cols, days.length - row * g.cols);
    const rowShift = ((g.cols - inRow) * g.cw) / 2; // неполный ряд — по центру
    // лёгкий детерминированный сдвиг внутри ячейки — «живое» поле без пересечений
    const h = parseInt(hashString(d.id), 36);
    const free = Math.max(0, (g.cw - g.d * 1.2) / 2);
    const jx = ((h % 1000) / 1000 - 0.5) * free;
    const jy = ((Math.floor(h / 1000) % 1000) / 1000 - 0.5) * (g.small ? 10 : 18);
    return { d, cx: g.x0 + rowShift + col * g.cw + g.cw / 2 + jx, cy: PAD + row * g.ch + g.d / 2 + 6 + jy };
  }), [days, g]);

  // есть что прокрутить — мягко гасим край поля (подсказка, что сфер больше)
  const fadeTop = scroll > 2 ? 'transparent 0, #000 40px' : '#000 0';
  const fadeBottom = scroll < maxScroll - 2 ? '#000 calc(100% - 56px), transparent 100%' : '#000 100%';
  const mask = `linear-gradient(to bottom, ${fadeTop}, ${fadeBottom})`;
  const fade = maxScroll ? { maskImage: mask, WebkitMaskImage: mask } : {};

  const labelW = Math.min(g.cw - 8, g.small ? 160 : 210);
  const focus = selected ?? hover;

  const params = useMemo(() => new Map(days.map((d) => [d.id, orbParams(orbSource(d))])), [days]);
  // сохранённые миниатюры текущей версии рендера; остальные рисуются один раз статично
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    const m: Record<string, string> = {};
    for (const d of days) if (d.thumb && d.thumbV === ORB_RENDER_VERSION) m[d.id] = URL.createObjectURL(d.thumb);
    setThumbs(m);
    return () => Object.values(m).forEach((u) => URL.revokeObjectURL(u));
  }, [days]);

  const orbs = layout.map(({ d, cx, cy }) => ({
    id: d.id, x: cx, y: cy + top - scroll,
    scale: (matches(d) ? 1 : 0.55) * (d.mood.arousal * 0.08 + 0.94),
  }));
  const frame = g.d / BODY;

  function open(d: Item, pointerType: string) {
    if (drag.current?.moved) return;
    // касание: первое — выбрать (полное название), второе — открыть; мышь и клавиатура открывают сразу
    if (pointerType === 'touch' && selected !== d.id) { setSelected(d.id); return; }
    router.push(`/day/${d.id}`);
  }

  return (
    <div
      ref={box}
      className="relative h-full w-full touch-none select-none overflow-hidden"
      style={{ cursor: maxScroll ? (drag.current ? 'grabbing' : 'grab') : 'default', ...fade }}
      onWheel={(e) => setScroll((s) => clamp(s + e.deltaY))}
      onPointerDown={(e) => { drag.current = { y: e.clientY, s: scroll, moved: false }; }}
      onPointerMove={(e) => {
        const dr = drag.current; if (!dr) return;
        const dy = e.clientY - dr.y;
        if (Math.abs(dy) > 6) dr.moved = true;
        if (maxScroll) setScroll(clamp(dr.s - dy));
      }}
      onPointerUp={() => { setTimeout(() => { drag.current = null; }, 0); }}
      onPointerLeave={() => { drag.current = null; }}
      onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
    >
      {orbs.map((o) => (
        <Orb
          key={o.id} params={params.get(o.id)!} size={Math.round(frame)} thumbUrl={thumbs[o.id]}
          live={focus === o.id} hover={focus === o.id}
          className="pointer-events-none absolute"
          style={{ left: o.x - frame * orbFrame.cx, top: o.y - frame * orbFrame.cy, transform: `scale(${o.scale})`, transformOrigin: `${orbFrame.cx * 100}% ${orbFrame.cy * 100}%`, transition: 'transform .6s var(--ease)' }}
        />
      ))}
      {layout.map(({ d }, i) => {
        const o = orbs[i];
        const on = matches(d);
        const full = focus === d.id;
        // ширина подписи; у края экрана сдвигаем её внутрь, чтобы полное название не обрезалось
        const lw = full ? Math.max(labelW, Math.min(260, size.w - 24)) : labelW;
        const edge = Math.max(0, 8 - (o.x - lw / 2)) - Math.max(0, o.x + lw / 2 - (size.w - 8));
        return (
          <button
            key={d.id}
            aria-label={`${d.mood.title}, ${formatDate(d.date)}`}
            className="orb-hit absolute rounded-full"
            style={{ left: o.x - g.d / 2, top: o.y - g.d / 2, width: g.d, height: g.d, opacity: on ? 1 : 0.35, zIndex: full ? 5 : 1 }}
            onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(d.id); }}
            onPointerLeave={() => setHover(null)}
            onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) setSelected(d.id); }}
            onBlur={() => setSelected((s) => (s === d.id ? null : s))}
            onClick={(e) => open(d, (e.nativeEvent as PointerEvent).pointerType || 'mouse')}
          >
            <span
              data-label
              className="pointer-events-none absolute top-full mt-2 rounded-[10px] px-2 py-1 text-center transition-[opacity,background-color] duration-500"
              style={{
                width: lw, left: g.d / 2 - lw / 2 + edge,
                opacity: on ? (full ? 1 : 0.82) : 0.3,
                background: full ? 'rgba(9,9,14,0.86)' : 'transparent',
              }}
            >
              <span className={`block font-display leading-tight text-ink ${full ? 'text-[1rem] sm:text-[1.1rem]' : 'truncate text-[0.88rem] sm:text-[0.98rem]'}`}>
                {full ? d.mood.title : shortTitle(d.mood.title, g.small ? 16 : 22)}
              </span>
              <span className="mt-0.5 block text-[0.62rem] uppercase tracking-[0.16em] text-mute">
                {full ? formatDate(d.date) : formatDateShort(d.date)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
