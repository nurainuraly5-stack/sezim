'use client';
// Один WebGL-канвас поверх контейнера; рисует переданные сферы каждый кадр.
import { useEffect, useRef } from 'react';
import { OrbRenderer, type OrbDraw } from './orb-renderer';

/** fit: если задан, первая сфера центрируется, а size трактуется как доля меньшей стороны (0..1). */
export default function OrbCanvas({ orbs, className, fit }: { orbs: OrbDraw[]; className?: string; fit?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const orbsRef = useRef(orbs);
  orbsRef.current = orbs;
  const fitRef = useRef(fit);
  fitRef.current = fit;

  useEffect(() => {
    const canvas = ref.current!;
    let r: OrbRenderer;
    try { r = new OrbRenderer(canvas); } catch { return; }
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      r.resize(rect.width, rect.height, dpr);
      const list = fitRef.current
        ? orbsRef.current.map((o) => ({ ...o, x: rect.width / 2, y: rect.height / 2, size: Math.min(rect.width, rect.height) * o.size }))
        : orbsRef.current;
      r.draw(list, (performance.now() - t0) / 1000, dpr);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); r.dispose(); };
  }, []);

  return <canvas ref={ref} className={className} style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />;
}
