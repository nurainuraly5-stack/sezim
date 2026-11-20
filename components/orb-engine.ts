// Один WebGL-контекст на всё приложение: сфера рисуется во внеэкранный канвас и копируется
// в 2D-канвас компонента. Так сфер на странице сколько угодно, а контекст браузера — один.
import { compile, compileAsync, quad, uniforms } from '@/core/gl/gl';
import { orbFrag, VERT } from '@/core/gl/shaders';
import type { OrbParams } from '@/core/orb';
import { orbFrame } from '@/design/tokens';

type Prog = { prog: WebGLProgram; u: ReturnType<typeof uniforms> };
export type OrbFrameOpts = { hover?: number; birth?: number; speed?: number };

/** Версия рендера: меняется вместе с шейдером — сохранённые миниатюры старой версии перерисовываются. */
export const ORB_RENDER_VERSION = 4;

class OrbEngine {
  canvas = document.createElement('canvas');
  gl: WebGLRenderingContext;
  progs: { full?: Prog; lite?: Prog } = {};
  current: Prog | null = null;
  lost = false;

  constructor() {
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL недоступен');
    this.gl = gl;
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; engine = null; });
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  use(lite: boolean): Prog {
    const key = lite ? 'lite' : 'full';
    let p = this.progs[key];
    if (!p) {
      const prog = compile(this.gl, VERT, orbFrag(lite));
      p = { prog, u: uniforms(this.gl, prog) };
      this.progs[key] = p;
    }
    if (this.current !== p) {
      this.gl.useProgram(p.prog);
      quad(this.gl, p.prog);
      this.current = p;
    }
    return p;
  }

  /** Рисует сферу в левый нижний квадрат size×size внеэкранного канваса. */
  render(o: OrbParams, size: number, time: number, opts: OrbFrameOpts, lite: boolean) {
    const { gl, canvas } = this;
    if (canvas.width < size || canvas.height < size) {
      canvas.width = Math.max(canvas.width, size);
      canvas.height = Math.max(canvas.height, size);
    }
    const { u } = this.use(lite);
    gl.viewport(0, 0, size, size);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, size, size);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);
    const v3 = (n: string, c: [number, number, number]) => u.v3(n, c);
    u.v2('u_res', size, size);
    u.v4('u_rect', size / 2, size / 2, size, size);
    u.f('u_rot', 0);
    u.f('u_time', time * (opts.speed ?? 1));
    u.f('u_px', 1.5 / (orbFrame.radius * size));
    u.f('u_hover', opts.hover ?? 0);
    u.f('u_birth', opts.birth ?? 1);
    v3('u_core', o.core); v3('u_shell', o.shell); v3('u_accent', o.accent);
    u.f('u_contrast', o.contrast);
    u.f('u_depth', o.depth);
    u.f('u_deform', o.deform);
    u.f('u_dfreq', o.deformFreq);
    u.v4('u_struct', o.bands, o.swirl, o.particles, o.veins);
    u.f('u_bandAngle', o.bandAngle);
    u.f('u_flow', o.flow);
    u.f('u_grain', o.grain);
    u.f('u_breath', o.breath);
    u.f('u_spin', o.spin);
    u.f('u_glow', o.glow);
    u.f('u_rimLight', o.rimLight);
    u.f('u_moons', o.moons);
    u.v2('u_offset', o.offset[0], o.offset[1]);
    u.v2('u_swirlC', o.swirlCenter[0], o.swirlCenter[1]);
    u.v4('u_light', o.light.x, o.light.y, o.light.intensity, o.light.warm);
    u.v4('u_ring', o.rings, o.ringScale, o.ringTilt, o.ringRot);
    v3('u_frame', [orbFrame.cx, orbFrame.cy, orbFrame.radius]);
    u.f('u_shadowY', orbFrame.shadowY);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Копирует последний кадр в 2D-контекст (тот же размер в пикселях). */
  blit(ctx: CanvasRenderingContext2D, size: number) {
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.canvas, 0, this.canvas.height - size, size, size, 0, 0, size, size);
  }
}

let engine: OrbEngine | null = null;
let failed = false;

function getEngine(): OrbEngine | null {
  if (failed) return null;
  if (!engine || engine.lost) {
    try { engine = new OrbEngine(); } catch (e) { console.error('orb engine', e); failed = true; return null; }
  }
  return engine;
}

/** Телефон/планшет с тач-экраном — упрощённый шейдер. */
export const preferLite = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/** Кадр сферы в 2D-канвас. false — WebGL недоступен. */
export function drawOrb(ctx: CanvasRenderingContext2D, o: OrbParams, size: number, time: number, opts: OrbFrameOpts = {}, lite = preferLite()): boolean {
  const e = getEngine();
  if (!e) return false;
  try {
    e.render(o, size, time, opts, lite);
    e.blit(ctx, size);
    return true;
  } catch (err) {
    console.error('orb render', err);
    return false;
  }
}

/** Прогрев: программа сферы компилируется без блокировки и кладётся в движок, затем один крошечный кадр
 *  (ANGLE доделывает часть работы при первой отрисовке). Повторно ничего не делает. */
export async function warmOrbEngine(o: OrbParams, lite = preferLite()) {
  const e = getEngine();
  if (!e) return;
  const key = lite ? 'lite' : 'full';
  if (!e.progs[key]) {
    const prog = await compileAsync(e.gl, VERT, orbFrag(lite));
    if (e.lost || engine !== e) return;
    if (!e.progs[key]) e.progs[key] = { prog, u: uniforms(e.gl, prog) };
  }
  e.render(o, 8, STILL_TIME, {}, lite);
}

/** Статичный кадр (миниатюра) — момент «вдоха», полный шейдер. */
export const STILL_TIME = 1.3;

/** PNG-миниатюра сферы с прозрачным фоном (thumb папки дня, кэш архива). */
export async function renderOrbBlob(o: OrbParams, size: number): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  if (!drawOrb(ctx, o, size, STILL_TIME, {}, false)) throw new Error('WebGL недоступен');
  return new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
}
