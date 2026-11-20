'use client';
// Прогрев шейдеров в фоне, пока человек смотрит архив: шейдер сцены дня (тяжёлый, с Кувахарой) и шейдер сферы
// компилируются заранее и без блокировки (KHR_parallel_shader_compile). Браузер кэширует собранную программу,
// поэтому экран дня открывается без паузы на компиляцию. Один раз за загрузку страницы.
import { SCENE_CONTEXT, compileAsync, quad, uniforms } from '@/core/gl/gl';
import { SCENE_FRAG, VERT } from '@/core/gl/shaders';
import type { OrbParams } from '@/core/orb';
import { warmOrbEngine } from './orb-engine';

let started: Promise<void> | null = null;

async function warmScene() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const gl = canvas.getContext('webgl', SCENE_CONTEXT);
  if (!gl) return;
  try {
    const prog = await compileAsync(gl, VERT, SCENE_FRAG);
    gl.useProgram(prog);
    quad(gl, prog);
    const u = uniforms(gl, prog);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
    u.v2('u_res', 16, 16); u.v4('u_rect', 8, 8, 16, 16); u.v2('u_size', 16, 16); u.f('u_alpha', 1);
    u.v2('u_tex0Res', 1, 1); u.v2('u_tex1Res', 1, 1);
    // оба прохода (фон и фото): часть работы драйвер делает на первой отрисовке
    for (const pass of [0, 1]) { u.i('u_pass', pass); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  } finally {
    // контекстов у страницы мало — этот больше не нужен
    (gl.getExtension('WEBGL_lose_context') as { loseContext(): void } | null)?.loseContext();
  }
}

/** Запускает прогрев в простое браузера. o — параметры любой сферы (нужны для пробного кадра). */
export function warmShaders(o: OrbParams): Promise<void> {
  if (started) return started;
  started = new Promise<void>((resolve) => {
    // компиляция идёт в GPU-процессе параллельно и главный поток не держит — запускаем обе сразу и рано:
    // сцена на слабом GPU собирается ~3 с, а до клика по дню обычно проходит больше
    const run = async () => {
      const r = await Promise.allSettled([warmOrbEngine(o), warmScene()]);
      r.forEach((x) => { if (x.status === 'rejected') console.warn('shader warm-up', x.reason); }); // не критично
      resolve();
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 300 });
    else setTimeout(run, 300);
  });
  return started;
}
