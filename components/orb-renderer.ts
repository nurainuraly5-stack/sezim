// Рисует много сфер в одном WebGL-канвасе (контекстов у браузера мало).
import type { StyleTokens } from '@/core/types';
import { compile, quad, uniforms } from '@/core/gl/gl';
import { ORB_FRAG, VERT } from '@/core/gl/shaders';
import { hashString, hexToVec3 } from '@/core/color';

export type OrbDraw = {
  x: number; y: number; size: number; // CSS px, центр и сторона квадрата (с ореолом)
  tokens: StyleTokens; contrast: number; id: string;
  hover?: number; birth?: number; speed?: number;
};

export class OrbRenderer {
  gl: WebGLRenderingContext;
  prog: WebGLProgram;
  u: ReturnType<typeof uniforms>;
  constructor(public canvas: HTMLCanvasElement, opts: { preserve?: boolean } = {}) {
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: !!opts.preserve });
    if (!gl) throw new Error('WebGL недоступен');
    this.gl = gl;
    this.prog = compile(gl, VERT, ORB_FRAG);
    gl.useProgram(this.prog);
    quad(gl, this.prog);
    this.u = uniforms(gl, this.prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  resize(w: number, h: number, dpr: number) {
    const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
  }

  draw(orbs: OrbDraw[], time: number, dpr: number, opts: { opaqueBg?: string } = {}) {
    const { gl, u } = this;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    u.v2('u_res', this.canvas.width, this.canvas.height);
    u.f('u_time', time);
    u.f('u_rot', 0);
    u.f('u_opaque', opts.opaqueBg ? 1 : 0);
    u.v3('u_bg', hexToVec3(opts.opaqueBg || '#000000'));
    for (const o of orbs) {
      const t = o.tokens;
      u.v4('u_rect', o.x * dpr, o.y * dpr, o.size * dpr, o.size * dpr);
      u.v3('u_core', hexToVec3(t.orb.core));
      u.v3('u_rim', hexToVec3(t.orb.rim));
      u.f('u_glow', t.orb.glow);
      u.f('u_breath', t.orb.breath);
      u.f('u_contrast', o.contrast);
      u.f('u_grain', t.grain);
      u.f('u_speed', o.speed ?? t.motion.speed);
      u.f('u_seed', (parseInt(hashString(o.id), 36) % 1000) / 37);
      u.f('u_hover', o.hover ?? 0);
      u.f('u_birth', o.birth ?? 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  dispose() {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/** Снимок сферы в JPEG (thumb.jpg папки дня). */
export async function renderOrbSnapshot(tokens: StyleTokens, contrast: number, size = 256): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const r = new OrbRenderer(c, { preserve: true });
  r.draw([{ x: size / 2, y: size / 2, size, tokens, contrast, id: tokens.orb.core + tokens.orb.rim }], 1.3, 1, { opaqueBg: '#07070b' });
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.9));
  r.dispose();
  return blob;
}
