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

/**
 * Сфера дня — один шейдер, всё задают uniform-параметры из core/orb.ts (OrbParams).
 * Постоянное у всех сфер: круглый силуэт, подсветка по краю, тень под сферой, геометрия кадра.
 * Переменное: цвета слоёв, тяжесть, деформация, структура (полосы/вихрь/частицы/прожилки), зерно, свет, кольца.
 * lite — упрощённый вариант для телефонов (меньше октав шума, без прожилок).
 */
export const orbFrag = (lite: boolean) => /* glsl */ `
precision highp float;
${lite ? '#define LITE' : ''}
#ifdef LITE
#define OCT 3
#else
#define OCT 5
#endif
varying vec2 v_uv;
uniform float u_time, u_px, u_hover, u_birth;
uniform vec3 u_core, u_shell, u_accent;
uniform float u_contrast, u_depth, u_deform, u_dfreq;
uniform vec4 u_struct;   // полосы, вихрь, частицы, прожилки
uniform float u_bandAngle, u_flow, u_grain, u_breath, u_spin, u_glow, u_rimLight, u_moons;
uniform vec2 u_offset, u_swirlC;
uniform vec4 u_light;    // x, y, сила, теплота
uniform vec4 u_ring;     // число, радиус, наклон, поворот
uniform vec3 u_frame;    // центр x, центр y, радиус — доли кадра
uniform float u_shadowY;

// хэш с малыми множителями (Hoskins): у соседних клеток решётки нет расхождений от потери точности,
// иначе компилятор (ANGLE/HLSL) переставляет операции и на границах клеток силуэт рвётся
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<OCT;i++){ v+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return v; }
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,s,-s,c); }

// Кольца и «луны» (события дня): x — передняя половина, y — задняя (за сферой)
vec2 rings(vec2 p, float px){
  vec2 res = vec2(0.0);
  for (int i=0;i<3;i++){
    float fi = float(i);
    if (fi >= u_ring.x) break;
    float sc = u_ring.y + fi*0.1;
    float tilt = u_ring.z + fi*0.05;
    vec2 pr = rot(-(u_ring.w + fi*0.18)) * p;
    float e = length(vec2(pr.x, pr.y/tilt));
    vec2 gv = vec2(pr.x, pr.y/(tilt*tilt)) / max(e, 1e-4);
    float dd = abs(e - sc) / max(length(gv), 1e-4);
    float w = 0.011 - fi*0.002;
    float a = smoothstep(w + px, w, dd) * (0.62 - fi*0.14);
    if (pr.y > 0.0) res.y = max(res.y, a); else res.x = max(res.x, a);
    if (i == 0) {
      for (int k=0;k<6;k++){
        float fk = float(k);
        if (fk >= u_moons) break;
        float th = fk/max(u_moons,1.0)*6.2831853 + u_time*0.12*u_flow + u_offset.x;
        vec2 mp = vec2(sc*cos(th), sc*tilt*sin(th));
        float md = length(pr - mp);
        float ma = smoothstep(0.05 + px, 0.05, md) * 0.9;
        if (sin(th) > 0.0) res.y = max(res.y, ma); else res.x = max(res.x, ma);
      }
    }
  }
  return res;
}

vec4 over(vec4 top, vec4 base){ return top + base*(1.0 - top.a); }

void main(){
  vec2 p0 = vec2(v_uv.x - u_frame.x, u_frame.y - v_uv.y) / u_frame.z; // y вверх, единица — радиус
  float br = sin(u_time*u_breath*6.2831853);
  float sc = max((1.0 + 0.022*br + 0.045*u_hover) * u_birth, 1e-3);
  vec2 p = p0 / sc;
  float px = u_px / sc;
  float t = u_time;

  // Силуэт: круг с лёгкой деформацией шумом (амплитуда — от возбуждения дня)
  float r = length(p);
  vec2 dir = p / max(r, 1e-4);
  float rr = 1.0 + u_deform * (noise(dir*u_dfreq + u_offset + t*0.08) - 0.5) * 2.0;
  float body = smoothstep(rr + px*1.2, rr - px*1.2, r);

  // Тень под сферой — постоянный элемент
  vec2 sp = vec2(p0.x/0.95, (p0.y + u_shadowY)/0.16);
  float sh = exp(-dot(sp, sp)*1.7) * 0.3 * u_birth;
  vec4 acc = vec4(mix(u_shell, vec3(0.12, 0.09, 0.2), 0.6) * sh, sh);

  // Ореол
  float halo = exp(-max(r - rr, 0.0)*6.5) * (0.12 + 0.38*u_glow) * smoothstep(1.7, 1.0, r) * (1.0 - body) * (1.0 - 0.4*u_depth);
  acc = over(vec4(mix(u_shell, u_core, 0.4)*halo, halo), acc);

  vec3 ringCol = mix(mix(u_shell, u_accent, 0.25), vec3(1.0), 0.5) * (1.0 - 0.4*u_depth);
  vec2 rg = u_ring.x > 0.0 ? rings(p, px) : vec2(0.0);
  acc = over(vec4(ringCol*rg.y*0.7, rg.y*0.7), acc); // задняя половина колец — за сферой

  if (body > 0.0) {
    vec2 q = p / rr;
    float z = sqrt(max(1.0 - dot(q, q), 0.0));
    vec3 n = normalize(vec3(q, z));
    // координаты на поверхности: вращение от темпа песни
    float lon = atan(n.x, n.z) + t*u_spin*u_flow;
    float lat = asin(clamp(n.y, -1.0, 1.0));
    vec2 s = vec2(lon*0.95, lat*1.1);
    // вихрь вокруг своего центра
    vec2 sq = q - u_swirlC;
    float sw = u_struct.y * 3.2 * u_flow * (1.0 - smoothstep(0.0, 1.2, length(sq)));
    vec2 wq = rot(sw + t*0.05*u_flow*u_struct.y) * sq;
    vec2 base = mix(s, wq*1.3, 0.5)*1.6 + u_offset;
    float f = fbm(base + vec2(t*0.03, -t*0.02));
    float f2 = fbm(base*1.7 + f*1.4 + 3.1);

    // ядро и оболочка: при противоречии ядро компактное и отдельное
    float coreR = mix(0.95, 0.45, u_contrast);
    float d = length(q + 0.25*(vec2(f, f2) - 0.5));
    float coreMask = smoothstep(coreR, coreR*0.2, d);
    vec3 col = mix(u_shell*(0.55 + 0.55*f), u_core*(0.85 + 0.35*f2), coreMask);

    // полосы
    vec2 bd = vec2(cos(u_bandAngle), sin(u_bandAngle));
    float b = 0.5 + 0.5*sin(dot(s, bd)*(5.0 + u_struct.x*9.0) + f*4.0 + t*u_spin*2.0);
    col = mix(col, mix(u_accent, u_core, 0.35)*1.05, smoothstep(0.55, 0.9, b)*u_struct.x*0.5);
    // вихревые пряди
    float st = smoothstep(0.35, 0.75, f2) * smoothstep(1.0, 0.2, length(sq));
    col = mix(col, mix(u_core, vec3(1.0), 0.25), st*u_struct.y*0.35);
#ifndef LITE
    // прожилки
    float v = pow(1.0 - abs(fbm(base*2.3 + 7.7)*2.0 - 1.0), 10.0);
    col = mix(col, u_accent*1.2 + 0.08, v*u_struct.w*0.75);
#endif
    // частицы
    vec2 g = s*(9.0 + u_struct.z*9.0) + u_offset*3.0;
    vec2 gi = floor(g), gf = fract(g) - 0.5;
    float hs = hash(gi);
    float dm = step(1.0 - u_struct.z*0.55, hs) * smoothstep(0.18, 0.04, length(gf + (vec2(hash(gi + 3.1), hash(gi + 7.3)) - 0.5)*0.5));
    col += mix(u_core, vec3(1.0), 0.6) * dm * (0.6 + 0.4*sin(t*2.0 + hs*30.0)) * 0.7 * smoothstep(0.0, 0.3, z);

    // тяжесть дня: затемнение и приглушение
    col *= 1.0 - u_depth*0.68;
    col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))), u_depth*0.25);

    // свет по времени суток
    vec3 L = normalize(vec3(u_light.x, u_light.y, 0.75));
    float diff = max(dot(n, L), 0.0);
    col *= 0.55 + 0.6*diff*u_light.z + 0.15*(1.0 - u_light.z);
    vec3 tint = mix(vec3(0.86, 0.9, 1.0), vec3(1.0, 0.86, 0.7), u_light.w);
    col += tint * pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 36.0) * 0.55 * u_light.z;
    col += tint * pow(diff, 6.0) * 0.12 * u_light.z;
    // подсветка по краю — постоянный элемент
    col += mix(u_shell, vec3(1.0), 0.45) * pow(1.0 - z, 2.6) * (0.45 + 0.5*u_rimLight);
    col += u_core * coreMask * 0.22 * u_glow * (0.85 + 0.15*br) * (1.0 - 0.5*u_depth);
    // зерно от энергии песни
    col += (hash(gl_FragCoord.xy + floor(t*24.0)*17.0) - 0.5) * (0.03 + u_grain*0.14);
    acc = over(vec4(clamp(col, 0.0, 1.0)*body, body), acc);
  }
  acc = over(vec4(ringCol*rg.x*0.85, rg.x*0.85), acc); // передняя половина колец
  gl_FragColor = acc;
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
// GLSL ES 1.0: индексировать uniform-массив можно только константой/счётчиком цикла
vec3 palAt(int i){ if(i<=0) return u_pal[0]; if(i==1) return u_pal[1]; if(i==2) return u_pal[2]; if(i==3) return u_pal[3]; return u_pal[4]; }

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
    // контур контрастен месту: тёмный на светлом, светлый на тёмном (иначе искры салюта на ночном небе
    // становятся чёрными линиями и пропадают)
    vec3 ink = lum(c) > 0.35 ? u_pal[0]*0.6 : mix(u_pal[4], vec3(1.0), 0.45);
    c = mix(c, post, 0.55) * 1.15;
    c = mix(c, ink, e*0.75);
  } else if (u_tech == 2) {
    // Film Grain Night: лифт теней, ореолы, тёплые блики
    vec3 hal = vec3(0.0);
    for (int i=0;i<8;i++){ float a = float(i)*0.785; hal += max(texture2D(t, uv + vec2(cos(a),sin(a))*px*9.0).rgb - 0.6, 0.0); }
    c = c * 1.3 + hal * vec3(0.9, 0.35, 0.15) * 0.4;
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
  // если светлый конец палитры тёмный (ночной кадр), дуотон не гасит блики: огни и искры остаются светлыми
  float keep = smoothstep(0.45, 0.85, lum(c)) * (1.0 - smoothstep(0.3, 0.6, lum(u_pal[4])));
  c = mix(c, duo, u_duotone * (1.0 - keep));
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
        c = mix(c, palAt(1+int(mod(fi,4.0))), disc*0.35);
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
