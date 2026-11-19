// Свои GLSL-шейдеры: сфера воспоминания и сцена дня (одна программа, техники — uniform-параметры).

const NOISE = /* glsl */ `
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return v; }
`;

// Квадрат в пикселях: u_rect = (cx, cy, w, h), u_rot — поворот, u_res — размер канваса.
export const VERT = /* glsl */ `
attribute vec2 a_pos;
uniform vec4 u_rect; uniform vec2 u_res; uniform float u_rot;
varying vec2 v_uv;
void main(){
  v_uv = a_pos + 0.5;
  vec2 p = a_pos * u_rect.zw;
  float c = cos(u_rot), s = sin(u_rot);
  p = vec2(c*p.x - s*p.y, s*p.x + c*p.y) + u_rect.xy;
  vec2 clip = (p / u_res) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

export const ORB_FRAG = /* glsl */ `
precision highp float;
varying vec2 v_uv;
uniform float u_time, u_glow, u_breath, u_contrast, u_grain, u_seed, u_speed, u_hover, u_opaque, u_birth;
uniform vec3 u_core, u_rim, u_bg;
${NOISE}
void main(){
  vec2 p = v_uv*2.0 - 1.0;
  float r = length(p);
  float br = sin(u_time * u_breath * 6.2831853);
  float R = 0.56 * (1.0 + 0.03*br + 0.05*u_hover) * u_birth;
  vec3 col = vec3(0.0); float a = 0.0;
  // ореол
  float halo = exp(-max(r - R, 0.0) * 7.0) * (0.35 + 0.65*u_glow) * (0.85 + 0.15*br);
  vec3 haloCol = mix(u_rim, u_core, 0.35);
  if (r < R) {
    vec2 q = p / R;
    float z = sqrt(max(1.0 - dot(q,q), 0.0));
    float fres = pow(1.0 - z, 2.4);
    float t = u_time * 0.06 * (0.6 + u_speed);
    vec2 w = q*1.6 + vec2(fbm(q*2.0 + t + u_seed), fbm(q*2.0 - t + u_seed*1.7));
    float flow = fbm(w*1.8 + vec2(t*0.7, -t*0.5));
    // ядро: при высоком противоречии — компактное и отдельное, при низком — разливается
    float coreR = mix(0.95, 0.5, u_contrast);
    float d = length(q + 0.22*(vec2(flow, fbm(w + 3.1)) - 0.5));
    float coreMask = smoothstep(coreR, coreR*0.15, d);
    vec3 shell = u_rim * (0.35 + 0.45*flow);
    col = mix(shell, u_core * (0.9 + 0.4*flow), coreMask);
    col += u_rim * fres * 1.5;                 // подсветка по краю
    col *= 0.62 + 0.38*z;                      // объём
    float spec = pow(max(dot(normalize(vec3(q, z)), normalize(vec3(-0.45, 0.55, 0.7))), 0.0), 28.0);
    col += vec3(1.0, 0.97, 0.92) * spec * 0.45;
    col += u_core * coreMask * 0.25 * (0.7 + 0.3*br) * u_glow;
    float edge = smoothstep(R, R - 0.012, r);
    col = mix(haloCol*halo, col, edge);
    a = max(edge, halo);
  } else {
    col = haloCol * halo;
    a = halo;
  }
  // плёночное зерно
  float g = hash(gl_FragCoord.xy + fract(u_time*7.0)*100.0) - 0.5;
  col += g * (0.04 + u_grain*0.12) * a;
  if (u_opaque > 0.5) { col = u_bg*(1.0-a) + col; a = 1.0; }
  gl_FragColor = vec4(col, a);
}`;

// u_pass: 0 — фон, 1 — фото. u_tech: 0 softStrokes, 1 geometric, 2 filmNight, 3 ma, 4 collage.
export const SCENE_FRAG = /* glsl */ `
precision highp float;
varying vec2 v_uv;
uniform int u_pass, u_tech;
uniform sampler2D u_tex0, u_tex1;
uniform vec2 u_res, u_size, u_tex0Res, u_tex1Res;
uniform float u_mix, u_time, u_grain, u_brush, u_duotone, u_sharp, u_speed, u_seed, u_alpha;
uniform vec3 u_pal[5];
${NOISE}

vec2 coverUV(vec2 uv, vec2 texRes){
  float ra = u_size.x/u_size.y, ta = texRes.x/texRes.y;
  vec2 s = ra > ta ? vec2(1.0, ta/ra) : vec2(ra/ta, 1.0);
  return (uv - 0.5) * s + 0.5;
}
float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 kuwahara(sampler2D t, vec2 uv, vec2 px, float rad){
  vec3 m[4]; vec3 s[4];
  for (int k=0;k<4;k++){ m[k]=vec3(0.0); s[k]=vec3(0.0); }
  for (int j=-4;j<=4;j++) for (int i=-4;i<=4;i++){
    vec2 o = vec2(float(i), float(j)) * rad / 4.0;
    vec3 c = texture2D(t, uv + o*px).rgb;
    if (i<=0 && j<=0){ m[0]+=c; s[0]+=c*c; }
    if (i>=0 && j<=0){ m[1]+=c; s[1]+=c*c; }
    if (i<=0 && j>=0){ m[2]+=c; s[2]+=c*c; }
    if (i>=0 && j>=0){ m[3]+=c; s[3]+=c*c; }
  }
  float best = 1e9; vec3 res = vec3(0.0);
  for (int k=0;k<4;k++){
    vec3 mm = m[k]/25.0; vec3 vv = abs(s[k]/25.0 - mm*mm);
    float sv = vv.r+vv.g+vv.b;
    if (sv < best){ best = sv; res = mm; }
  }
  return res;
}

vec3 paletteMap(float l){
  float x = clamp(l, 0.0, 0.999) * 4.0;
  int i = int(floor(x));
  vec3 a = u_pal[0], b = u_pal[1];
  if (i==1){ a=u_pal[1]; b=u_pal[2]; } else if (i==2){ a=u_pal[2]; b=u_pal[3]; } else if (i>=3){ a=u_pal[3]; b=u_pal[4]; }
  return mix(a, b, fract(x));
}

vec3 shade(sampler2D t, vec2 texRes){
  vec2 uv = coverUV(v_uv, texRes);
  vec2 px = 1.0 / texRes;
  if (u_tech == 2) uv += vec2(noise(vec2(u_time*3.0, 1.0))-0.5, noise(vec2(1.0, u_time*2.5))-0.5) * 0.0015; // дрожание кадра
  vec3 c = texture2D(t, uv).rgb;
  // резкость (unsharp)
  vec3 blur = (texture2D(t, uv+vec2(px.x*1.5,0.0)).rgb + texture2D(t, uv-vec2(px.x*1.5,0.0)).rgb
             + texture2D(t, uv+vec2(0.0,px.y*1.5)).rgb + texture2D(t, uv-vec2(0.0,px.y*1.5)).rgb) * 0.25;
  if (u_tech == 0) {
    // Soft Strokes: Кувахара + направленный мазок
    float rad = 2.0 + u_brush * 6.0;
    vec2 dir = vec2(cos(fbm(uv*6.0)*6.28), sin(fbm(uv*6.0)*6.28));
    c = kuwahara(t, uv + dir*px*u_brush*2.0, px * (texRes.x/900.0), rad);
    c = mix(c, c*1.08 + vec3(0.04, 0.03, 0.0), 0.5);
  } else if (u_tech == 1) {
    // Geometric Tension: постеризация в палитру + контуры
    float l = lum(c);
    float steps = 4.0;
    vec3 post = paletteMap(floor(l*steps)/steps + 0.12);
    float gx = lum(texture2D(t, uv+vec2(px.x,0.0)).rgb) - lum(texture2D(t, uv-vec2(px.x,0.0)).rgb);
    float gy = lum(texture2D(t, uv+vec2(0.0,px.y)).rgb) - lum(texture2D(t, uv-vec2(0.0,px.y)).rgb);
    float e = smoothstep(0.08, 0.22, length(vec2(gx, gy)) * (1.0 + u_sharp));
    c = mix(c, post, 0.7);
    c = mix(c, u_pal[0]*0.6, e*0.85);
  } else if (u_tech == 2) {
    // Film Grain Night: лифт теней, ореолы, тёплые блики
    vec3 hal = vec3(0.0);
    for (int i=0;i<8;i++){ float a = float(i)*0.785; hal += max(texture2D(t, uv + vec2(cos(a),sin(a))*px*9.0).rgb - 0.6, 0.0); }
    c = c + hal * vec3(0.9, 0.35, 0.15) * 0.35;
    c = mix(u_pal[0]*0.9 + c*0.9, c, smoothstep(0.0, 0.5, lum(c)));
    c = pow(c, vec3(1.08, 1.0, 0.94));
  } else if (u_tech == 3) {
    // Ma: тихий, почти монохромный
    c = mix(vec3(lum(c)), c, 0.35);
    c = mix(c, vec3(0.5), 0.12);
  } else {
    // Collage: печатная фактура, растр
    float l = lum(c);
    vec2 g = fract(v_uv * u_size / 6.0) - 0.5;
    float dots = smoothstep(0.5, 0.45, length(g) / sqrt(max(1.0 - l, 0.02)));
    c = mix(c, mix(u_pal[0], c*1.1, dots), 0.25);
  }
  c = mix(c, c + (c - blur) * 1.6, u_sharp * (u_tech == 0 ? 0.1 : 0.6));
  // дуотон в палитру дня
  vec3 duo = mix(u_pal[0], u_pal[4], smoothstep(0.03, 0.97, lum(c)));
  c = mix(c, duo, u_duotone);
  return c;
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  float gr = (hash(frag + fract(u_time*13.0)*91.0) - 0.5);
  if (u_pass == 0) {
    // Фон: глубокая тёмная среда с медленными пятнами света палитры
    vec2 uv = v_uv; vec2 p = (uv - 0.5) * vec2(u_res.x/u_res.y, 1.0);
    float t = u_time * 0.02 * (0.5 + u_speed);
    vec3 c = u_pal[0] * 0.35;
    for (int i=1;i<4;i++){
      float fi = float(i);
      vec2 cpos = vec2(sin(t*fi*1.3 + u_seed*fi), cos(t*fi*0.9 + u_seed*2.0*fi)) * 0.45;
      float d = length(p - cpos);
      c += u_pal[i] * exp(-d*d*(u_tech==3 ? 9.0 : 4.0)) * (u_tech==3 ? 0.12 : 0.22);
    }
    if (u_tech == 1) {
      // Кандинский: круги и диагонали
      for (int i=0;i<4;i++){
        float fi = float(i);
        vec2 cc = vec2(hash(vec2(fi, u_seed))-0.5, hash(vec2(u_seed, fi))-0.5) * vec2(1.4, 0.8);
        float rr = 0.05 + hash(vec2(fi*3.1, u_seed))*0.18;
        float ring = smoothstep(0.004, 0.0, abs(length(p-cc) - rr));
        float disc = smoothstep(rr*0.5, rr*0.48, length(p-cc+vec2(0.03)));
        c = mix(c, u_pal[1+int(mod(fi,4.0))], disc*0.35);
        c += u_pal[4] * ring * 0.4;
      }
      float ln = smoothstep(0.003, 0.0, abs(p.y - p.x*0.55 + 0.1)) + smoothstep(0.002, 0.0, abs(p.y + p.x*1.6 - 0.25));
      c += u_pal[3] * ln * 0.35;
    }
    if (u_tech == 4) c += (fbm(uv*vec2(80.0, 6.0)) - 0.5) * 0.04; // волокна бумаги
    float vig = smoothstep(1.25, 0.25, length(p * vec2(0.9, 1.1)));
    c *= mix(0.45, 1.0, vig);
    c += gr * (0.03 + u_grain * 0.08);
    gl_FragColor = vec4(c, 1.0);
    return;
  }
  vec3 c = shade(u_tex0, u_tex0Res);
  if (u_mix > 0.0) c = mix(c, shade(u_tex1, u_tex1Res), u_mix);
  // маска края кадра
  vec2 e = min(v_uv, 1.0 - v_uv) * u_size;
  float feather = (u_tech == 0 || u_tech == 3) ? 38.0 : (u_tech == 2 ? 10.0 : 1.5);
  float m = smoothstep(0.0, feather, min(e.x, e.y));
  if (u_tech == 0) m *= smoothstep(0.25, 0.6, fbm(v_uv*5.0 + u_seed) + min(e.x, e.y)/80.0);
  if (u_tech == 4) { // бумажная рамка
    float frame = step(min(e.x, e.y), 7.0);
    c = mix(c, vec3(0.93, 0.91, 0.86), frame);
  }
  if (u_tech == 2) { vec2 q = v_uv - 0.5; c *= smoothstep(0.85, 0.2, length(q)*1.2); }
  c += gr * (0.02 + u_grain * (u_tech == 2 ? 0.22 : 0.1));
  gl_FragColor = vec4(c * m * u_alpha, m * u_alpha);
}`;
