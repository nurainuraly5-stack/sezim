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
    let r: OrbRenderer | null = null;
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      if (!r) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      r.resize(rect.width, rect.height, dpr);
      const list = fitRef.current
        ? orbsRef.current.map((o) => ({ ...o, x: rect.width / 2, y: rect.height / 2, size: Math.min(rect.width, rect.height) * o.size }))
        : orbsRef.current;
      r.draw(list, (performance.now() - t0) / 1000, dpr);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      try { r = new OrbRenderer(canvas); } catch (e) { console.error('orb shader', e); r = null; return; }
      raf = requestAnimationFrame(loop);
    };
    // GPU может «уронить» контекст (слабые ноутбуки, много вкладок) — восстанавливаемся
    const onLost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(raf); r = null; };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', start);
    start();
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', start);
    }; // без loseContext: StrictMode повторяет эффект на том же канвасе
  }, []);

  return <canvas ref={ref} className={className} style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />;
}
