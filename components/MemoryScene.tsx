'use client';
// Сцена воспоминания: один канвас, один шейдер. Техника → обработка и композиция; темп → ритм смены кадров.
import { useEffect, useRef } from 'react';
import type { StyleTokens, TechniqueId } from '@/core/types';
import { SCENE_CONTEXT, compileAsync, loadTexture, quad, uniforms } from '@/core/gl/gl';
import { SCENE_FRAG, VERT } from '@/core/gl/shaders';
import { hashString, hexToVec3 } from '@/core/color';

const TECH_INDEX: Record<TechniqueId, number> = { softStrokes: 0, geometric: 1, filmNight: 2, ma: 3, collage: 4 };
type Rect = { cx: number; cy: number; w: number; h: number; rot: number };

/** Композиция — переменная часть. Способ встраивания (окно в тёмное пространство) — постоянный. */
/** Композиция кадров внутри карточки сцены — переменная часть: у каждой техники своя раскладка.
 *  Постоянное — способ встраивания: фото в «окне» тёмного пространства карточки. */
export function compose(tech: TechniqueId, W: number, H: number, n: number): Rect[] {
  const top = 0.07, bottom = 0.93;
  const cy = H * (top + bottom) / 2, zh = H * (bottom - top);
  switch (tech) {
    case 'ma': // «ма»: один небольшой кадр со смещением, много пустоты
      return [{ cx: W * 0.62, cy: cy - zh * 0.03, w: Math.min(W * 0.38, zh * 0.66), h: zh * 0.62, rot: 0 }];
    case 'filmNight': { // широкий «киноэкран»
      const w = W * 0.9;
      return [{ cx: W * 0.5, cy, w, h: Math.min(zh * 0.92, w / 1.85), rot: 0 }];
    }
    case 'geometric': // жёсткий кадр, сдвинутый с центра
      return [{ cx: W * 0.58, cy, w: W * 0.62, h: zh * 0.92, rot: 0 }];
    case 'collage': { // несколько кадров внахлёст с поворотом
      const k = Math.min(4, Math.max(1, n));
      const slots: [number, number, number][] = [[0.28, 0.28, -0.05], [0.66, 0.26, 0.04], [0.32, 0.72, 0.04], [0.7, 0.7, -0.05]];
      return slots.slice(0, k).map(([x, y, r]) => ({ cx: W * x, cy: H * top + zh * y, w: W * 0.42, h: zh * 0.46, rot: r }));
    }
    default: // мягкие мазки: большой кадр с растворённым краем
      return [{ cx: W * 0.5, cy, w: W * 0.9, h: zh * 0.96, rot: 0 }];
  }
}

export default function MemoryScene({ photos, tokens, id, intensity, onFail }: {
  photos: Blob[]; tokens: StyleTokens; id: string; intensity: number; // 0..1: до «Войти» сцена приглушена
  onFail?: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ tokens, intensity });
  live.current = { tokens, intensity };

  useEffect(() => {
    const canvas = ref.current!;
    let raf = 0;
    let alive = true;
    const onLost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(raf); };
    const onRestored = () => { if (alive) setup(); };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    const setup = async () => {
    const gl = canvas.getContext('webgl', SCENE_CONTEXT);
    if (!gl) { onFail?.(); return; }
    let prog: WebGLProgram;
    // асинхронно: тяжёлый шейдер сцены (Кувахара) не замораживает страницу; после прогрева в архиве — из кэша
    try { prog = await compileAsync(gl, VERT, SCENE_FRAG); } catch (e) {
      if (!alive || gl.isContextLost()) return;
      console.error('scene shader', e); onFail?.(); return;
    }
    if (!alive) return;
    gl.useProgram(prog);
    quad(gl, prog);
    const u = uniforms(gl, prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    u.i('u_tex0', 0); u.i('u_tex1', 1);

    let texs: { tex: WebGLTexture; w: number; h: number }[] = [];
    Promise.all(photos.slice(0, 8).map((p) => loadTexture(gl, p).catch(() => null))).then((r) => {
      if (alive) texs = r.filter(Boolean) as typeof texs;
    });

    const seed = (parseInt(hashString(id), 36) % 1000) / 53;
    const t0 = performance.now();
    let shown = 0; // плавное «вхождение»
    const loop = () => {
      const { tokens: tk, intensity: target } = live.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // шейдер Кувахары тяжёлый
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const PW = Math.round(W * dpr), PH = Math.round(H * dpr);
      if (canvas.width !== PW || canvas.height !== PH) { canvas.width = PW; canvas.height = PH; }
      gl.viewport(0, 0, PW, PH);
      const t = (performance.now() - t0) / 1000;
      shown += (target - shown) * 0.035;
      const tech = TECH_INDEX[tk.technique];

      u.v2('u_res', PW, PH);
      u.f('u_time', t);
      u.i('u_tech', tech);
      u.f('u_grain', tk.grain); u.f('u_brush', tk.brush); u.f('u_duotone', tk.duotone);
      u.f('u_sharp', tk.sharpness); u.f('u_speed', tk.motion.speed); u.f('u_seed', seed);
      u.v3arr('u_pal', tk.palette.flatMap(hexToVec3));

      // фон
      u.i('u_pass', 0); u.f('u_rot', 0); u.f('u_alpha', 1);
      u.v4('u_rect', PW / 2, PH / 2, PW, PH); u.v2('u_size', PW, PH);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // фото
      const n = texs.length;
      if (n) {
        u.i('u_pass', 1);
        const rects = compose(tk.technique, W, H, n);
        const rhythm = tk.rhythm;
        const step = Math.floor(t / rhythm);
        const phase = (t % rhythm) / rhythm;
        const fade = Math.min(0.45, 1.4 / rhythm);
        rects.forEach((r, j) => {
          let a: (typeof texs)[number], b: (typeof texs)[number] | null = null, mixv = 0, alpha = 1;
          if (tk.technique === 'collage') {
            const k = Math.floor(t / (rhythm * 1.5));
            a = texs[(k + j) % n];
            if (n > rects.length && j === rects.length - 1) alpha = Math.min(1, (t % (rhythm * 1.5)) / 0.8);
          } else {
            a = texs[step % n];
            if (n > 1 && phase > 1 - fade) { b = texs[(step + 1) % n]; mixv = smoothstep((phase - (1 - fade)) / fade); }
          }
          // медленное «дыхание» кадра в темпе песни
          const breathe = 1 + 0.012 * Math.sin(t * tk.orb.breath * Math.PI * 2) + 0.02 * phase * (tk.technique === 'ma' ? 0.3 : 1);
          const w = r.w * dpr * breathe, h = r.h * dpr * breathe;
          u.v4('u_rect', r.cx * dpr, r.cy * dpr, w, h);
          u.v2('u_size', w, h);
          u.f('u_rot', r.rot);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.tex); u.v2('u_tex0Res', a.w, a.h);
          if (b) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, b.tex); u.v2('u_tex1Res', b.w, b.h); }
          u.f('u_mix', b ? mixv : 0);
          u.f('u_alpha', alpha * (0.3 + 0.7 * shown));
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    };
    setup();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      // контекст не «теряем» вручную: в StrictMode эффект повторяется на том же канвасе
    };
  }, [photos, id]);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}

function smoothstep(x: number) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}
