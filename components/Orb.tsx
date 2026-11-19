'use client';
// Сфера дня. Не картинка и не пресет: кадр шейдера по OrbParams (core/orb.ts) — данным конкретного дня.
// live=false — один статичный кадр (или сохранённая миниатюра thumbUrl), live=true — анимация в реальном времени.
import { useEffect, useRef, useState } from 'react';
import type { OrbParams } from '@/core/orb';
import { drawOrb, STILL_TIME, type OrbFrameOpts } from './orb-engine';

type Props = {
  params: OrbParams;
  /** Сторона квадратного кадра сферы, CSS px (тело сферы — orbFrame.radius*2 от неё). */
  size: number;
  live?: boolean;
  hover?: boolean;
  /** Сохранённая миниатюра (PNG) — показывается, пока сфера не живая. */
  thumbUrl?: string;
  speed?: number;
  className?: string;
  style?: React.CSSProperties;
  onFail?: () => void;
};

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function Orb({ params, size, live = false, hover = false, thumbUrl, speed, className, style, onFail }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const state = useRef({ params, hover: hover ? 1 : 0, target: hover ? 1 : 0, speed, onFail });
  state.current.params = params;
  state.current.target = hover ? 1 : 0;
  state.current.speed = speed;
  state.current.onFail = onFail;
  const showThumb = !!thumbUrl && !live;
  const staticKey = live ? 'live' : `${params.seed}:${hover}`;

  useEffect(() => {
    if (showThumb) return;
    const canvas = ref.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.max(1, Math.round(size * dpr));
    if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
    const ctx = canvas.getContext('2d')!;
    const fail = () => { setFailed(true); state.current.onFail?.(); };

    if (!live) {
      if (!drawOrb(ctx, state.current.params, px, STILL_TIME, { hover: state.current.target }, false)) fail();
      return;
    }
    let raf = 0;
    let prev = performance.now();
    let t = STILL_TIME;
    const still = reducedMotion();
    const loop = (now: number) => {
      const s = state.current;
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (!still) t += dt * (s.speed ?? 1);
      s.hover += (s.target - s.hover) * Math.min(1, dt * 6);
      const opts: OrbFrameOpts = { hover: s.hover };
      if (!drawOrb(ctx, s.params, px, t, opts)) { fail(); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // живая сфера читает параметры из ref каждый кадр (без перезапуска анимации);
    // статичный кадр перерисовывается при смене сида (сид однозначно задаёт параметры) или наведения
  }, [live, size, showThumb, staticKey]);

  if (failed) {
    // без WebGL — честная плоская сфера из тех же цветов дня
    const c = (v: number[]) => `rgb(${v.map((x) => Math.round(x * 255 * (1 - params.depth * 0.6))).join(',')})`;
    return (
      <div className={className} style={{ width: size, height: size, position: 'relative', ...style }} aria-hidden>
        <div style={{ position: 'absolute', left: '20%', top: '12%', width: '60%', height: '60%', borderRadius: '50%', background: `radial-gradient(circle at 38% 32%, ${c(params.core)}, ${c(params.shell)} 70%)` }} />
      </div>
    );
  }
  if (showThumb) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={thumbUrl} alt="" width={size} height={size} className={className} style={{ width: size, height: size, display: 'block', ...style }} draggable={false} />;
  }
  return <canvas ref={ref} className={className} style={{ width: size, height: size, display: 'block', ...style }} aria-hidden />;
}
