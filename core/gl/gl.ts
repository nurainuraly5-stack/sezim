// Минимальные WebGL-утилиты.
export function compile(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
  return p;
}

export function quad(gl: WebGLRenderingContext, prog: WebGLProgram) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
}

export function uniforms(gl: WebGLRenderingContext, prog: WebGLProgram) {
  const cache = new Map<string, WebGLUniformLocation | null>();
  const u = (n: string) => {
    if (!cache.has(n)) cache.set(n, gl.getUniformLocation(prog, n));
    return cache.get(n)!;
  };
  return {
    f: (n: string, v: number) => gl.uniform1f(u(n), v),
    i: (n: string, v: number) => gl.uniform1i(u(n), v),
    v2: (n: string, a: number, b: number) => gl.uniform2f(u(n), a, b),
    v3: (n: string, v: [number, number, number]) => gl.uniform3f(u(n), v[0], v[1], v[2]),
    v4: (n: string, a: number, b: number, c: number, d: number) => gl.uniform4f(u(n), a, b, c, d),
    v3arr: (n: string, flat: number[]) => gl.uniform3fv(u(n), new Float32Array(flat)),
  };
}

export async function loadTexture(gl: WebGLRenderingContext, blob: Blob): Promise<{ tex: WebGLTexture; w: number; h: number }> {
  let src: TexImageSource; let w: number; let h: number;
  try {
    const bmp = await createImageBitmap(blob);
    src = bmp; w = bmp.width; h = bmp.height;
  } catch {
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await img.decode();
    src = img; w = img.naturalWidth; h = img.naturalHeight;
  }
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return { tex, w, h };
}
