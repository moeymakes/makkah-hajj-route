// ============================================================================
// WGSL sources
// ============================================================================
// Noise, detail texture, blit/bloom and the composite chain follow Abyssal Garden (MIT); the air, sky, marble, the
// Kiswah, the arcades, the clock and the birds are this world's own. world.js loads first: its layout and time of day are baked in.

// smoothstep lives in its own string so modules that already have it (via S_G) can take the noise without it
const W_SS = /*wgsl*/`
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
`;
const W_NOISE = /*wgsl*/`
fn h31(p: vec3f) -> f32 { var q = fract(p * vec3f(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn h33(p: vec3f) -> vec3f { var q = fract(p * vec3f(.1031, .1030, .0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yxx) * q.zyx); }
fn vn(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(mix(h31(i), h31(i + vec3f(1., 0., 0.)), u.x), mix(h31(i + vec3f(0., 1., 0.)), h31(i + vec3f(1., 1., 0.)), u.x), u.y),
             mix(mix(h31(i + vec3f(0., 0., 1.)), h31(i + vec3f(1., 0., 1.)), u.x), mix(h31(i + vec3f(0., 1., 1.)), h31(i + vec3f(1., 1., 1.)), u.x), u.y), u.z);
}
fn fbm(p: vec3f, n: i32) -> f32 {
  var a = .5; var s = 0.; var q = p;
  for (var i = 0; i < n; i++) { s += a * vn(q); q = q * 2.03 + vec3f(17.1, 31.7, 5.3); a *= .5; }
  return s / (1. - 2. * a);
}
fn wor(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); var d = 9.;
  for (var x = -1; x <= 1; x++) { for (var y = -1; y <= 1; y++) { for (var z = -1; z <= 1; z++) {
    let o = vec3f(f32(x), f32(y), f32(z)); let r = o + h33(i + o) - f; d = min(d, dot(r, r));
  } } }
  return sqrt(d);
}
`;


// ---------------------------------------------------------------- ground model (compute, load time)
// The route and its surroundings, evaluated on the GPU twice: a 5 m grid over the route and a ~23 m grid out to
// 12 km. A valley runs along x: narrow between granite mountains at Mina, opening into Muzdalifah's plain, then the
// wide plain of Arafat closed by mountains to the east. Knolls and Jabal al-Rahmah stand on the plains.
// A = height, rock, road, paving · B = tents, trees, unused, unused
const W_GROUND = W_SS + W_NOISE + /*wgsl*/`
struct U { n: vec4u, o: vec4f };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read_write> A: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> B: array<vec4f>;
const KNOLLS = array<vec4f, 5>(vec4f(${RAHMA[0]}., ${RAHMA[1]}., 64., 135.), vec4f(380., 470., 46., 170.), vec4f(560., -520., 40., 150.), vec4f(-120., 520., 55., 190.), vec4f(1300., 760., 70., 260.));
fn sat(x: f32) -> f32 { return clamp(x, 0., 1.); }
fn ridged(p: vec2f, s: f32) -> f32 { return 1. - abs(fbm(vec3f(p * s, 5.), 4) * 2. - 1.); }
fn czf(x: f32) -> f32 { return 60. * sin(x * .0011) + 25. * sin(x * .0031 + 1.); }
fn halfw(x: f32) -> f32 { return mix(mix(mix(260., 380., ss(-2300., -1700., x)), 720., ss(-520., 0., x)), 1250., ss(700., 1000., x)); }
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u.n.x || id.y >= u.n.y) { return; }
  let x = u.o.x + f32(id.x) * u.o.z; let z = u.o.y + f32(id.y) * u.o.z; let p2 = vec2f(x, z);
  let zr = z - czf(x);
  let r = length(p2 - vec2f(320., 0.));
  let w = halfw(x);
  let dz = abs(zr) + 140. * (fbm(vec3f(x * .0016, 3., z * .0016), 3) - .5);
  var m = ss(w, w + 320., dz);
  m = max(m, ss(2320., 2800., x + 180. * (fbm(vec3f(z * .002, 7., 1.), 2) - .5)));
  m = max(m, ss(4500., 9000., r) * .9);
  let rg = ridged(p2, .0021); let rg2 = ridged(p2 + 400., .0058);
  var h = 3. * (fbm(vec3f(x * .006, 1.3, z * .006), 2) - .5) + .012 * clamp(x, -1800., 2400.);
  h += m * (260. * (.25 + .75 * pow(rg, 1.7)) + 90. * (rg2 - .5));
  var rock = sat(m * 1.6);
  for (var k = 0; k < 5; k++) {
    let c = KNOLLS[k]; let d = distance(p2, c.xy) / c.w;
    if (d < 1.) { let t = 1. - d; let lob = 1. + .35 * sin(atan2(z - c.y, x - c.x) * 2. + c.x); h += c.z * pow(t, 1.15) * (.85 + .3 * rg2) * mix(1., lob, ss(.0, .5, t) * (1. - ss(.6, 1., t))); rock = max(rock, ss(.0, .12, t)); }
  }
  h += 480. * ss(6000., 11500., r) * (.5 + .8 * fbm(vec3f(x * .0005, 9., z * .0005), 3));
  // the highway, the pedestrian way, the Jamarat plaza, the mosque forecourts: graded flat and paved
  let inRoute = ss(-1560., -1500., x) * ss(2300., 2250., x);
  let road = ss(15., 12., abs(zr + 75.)) * inRoute;
  let path = ss(9., 7., abs(zr - 35.)) * ss(-1220., -1180., x) * ss(1000., 960., x);
  let jam = ss(-1850., -1820., x) * ss(-1170., -1200., x) * ss(105., 90., abs(zr));
  let nam = max(ss(150., 130., abs(x - ${NAMIRAH[0]}.)) * ss(110., 90., abs(z - (${NAMIRAH[1]}.))), ss(160., 110., abs(x - ${NAMIRAH[0] + 160}.)) * ss(150., 120., abs(z - (${NAMIRAH[1] - 40}.))));
  let stair = ss(2.2, 1.6, abs((z - ${RAHMA[1]}.) - (x - ${RAHMA[0]}.) * .1)) * step(x, ${RAHMA[0]}. + 2.) * step(${RAHMA[0] - 140}., x);
  let paved = max(max(max(path, jam), nam), stair);
  h = mix(h, ${JH}., jam);
  h = mix(h, h - m * 60., max(road, path) * .0);
  rock *= 1. - max(road, paved);
  // tents fill Mina's floor and patches of Arafat; neem groves stand on Arafat's plain
  let floorM = 1. - ss(.02, .2, m);
  var tents = step(-1240., x) * step(x, -300.) * (1. - ss(.25, .5, m)) * (1. - ss(.3, .6, max(road, paved))) * step(18., abs(zr + 75.)) * step(10., abs(zr - 35.));
  let ar = step(1000., x) * step(x, 2260.) * floorM * step(220., distance(p2, vec2f(${RAHMA[0]}., ${RAHMA[1]}.))) * (1. - nam) * step(18., abs(zr + 75.));
  let ptch = fbm(vec3f(x * .0035, 2.2, z * .0035), 3);
  tents = max(tents, ar * step(.6, ptch) * step(14., abs(zr + 160.)) * max(step(-150., zr), step(1450., x)));
  let trees = ar * step(ptch, .5) * step(.42, fbm(vec3f(x * .02, 5.5, z * .02), 2)) * step(14., abs(zr + 160.));
  A[id.x + u.n.x * id.y] = vec4f(h, rock, road, paved);
  B[id.x + u.n.x * id.y] = vec4f(step(.5, tents), trees, 0., 0.);
}
`;

// ---------------------------------------------------------------- physically based atmosphere (Hillaire 2020)
// Rayleigh + Mie + ozone in km, Earth radius 6360 km. The route lies ~350-500 m up in dusty desert air, so the Mie
// (aerosol) density is a few times the clear-sky value and its absorption leans blue, which warms the haze. The
// same media drive the sun colour (CPU, below), the sky (LUTs, main.js) and the aerial perspective.
// turb: aerosol multiple of a clear sky; haze: the dusty boundary layer (per km, ~1 km deep) that fades the far
// mountains; dust: the 70 m ground layer (dawn mist lies thicker in the valley)
const ATM = { turb: [7, 8, 12][TOD], haze: [.06, .075, .04][TOD], dust: [1.3, 1, 1][TOD], alt: .42 };
const ATM_BR = [5.802e-3, 13.558e-3, 33.1e-3], ATM_BO = [.65e-3, 1.881e-3, .085e-3];
const ATM_BMS = 3.996e-3 * ATM.turb, ATM_BME = [4.5e-3, 4.75e-3, 5.2e-3].map((v) => v * ATM.turb);
// sun transmittance from altitude h (km) to space, integrated on the CPU with the same media as the LUTs
const atmT = (h) => {
  const N = 600, r0 = 6360 + h, mu = SUN[1], R2 = 6460 * 6460;
  const tmax = -r0 * mu + sqrt(r0 * r0 * (mu * mu - 1) + R2), dt = tmax / N, od = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    const t = (i + .5) * dt, x = t * sqrt(1 - mu * mu), y = r0 + t * mu, hh = hypot(x, y) - 6360;
    const dr = exp(-hh / 8), dm = exp(-hh / 1.2), dz = max(0, 1 - abs(hh - 25) / 15);
    for (let c = 0; c < 3; c++) od[c] += (ATM_BR[c] * dr + ATM_BME[c] * dm + ATM_BO[c] * dz) * dt;
  }
  return od.map((v) => exp(-v));
};
// the solar scale keeps each preset's sun brightness; the hue comes from the air it passes through. At night the
// moon gets a blue Purkinje tint, as the eye sees moonlight, so the night keeps its look.
const ATM_TS = atmT(ATM.alt), ATM_T6 = atmT(6), lum3 = (v) => v[0] * .2126 + v[1] * .7152 + v[2] * .0722;
const ATM_NT = NIGHT ? [.62, .78, 1.3] : [1, 1, 1];
const ATM_S = lum3(TD.sunc) / lum3(ATM_TS);
const SUNCP = ATM_TS.map((v, c) => v * ATM_S * ATM_NT[c] * (NIGHT ? .7 : 1)), CLOUDSUN = ATM_T6.map((v, c) => v * ATM_S * ATM_NT[c]);
const f3 = (a) => `vec3f(${a.map((v) => (+v).toPrecision(5)).join(', ')})`;
const W_ATMC = /*wgsl*/`
const RG = 6360.; const RT = 6460.; const HR = 8.; const HM = 1.2; const MG = .76;
const BR = ${f3(ATM_BR)}; const BO = ${f3(ATM_BO)};
const BMS = vec3f(${ATM_BMS.toPrecision(5)}); const BME = ${f3(ATM_BME)};
const SUNL = ${f3(SUN)}; const ALT = ${ATM.alt};
const PI = 3.1415927;
struct Md { sr: vec3f, sm: vec3f, e: vec3f };
fn medium(h: f32) -> Md {
  let dr = exp(-h / HR); let dm = exp(-h / HM);
  return Md(BR * dr, BMS * dm, BR * dr + BME * dm + BO * max(0., 1. - abs(h - 25.) / 15.));
}
fn phR(mu: f32) -> f32 { return .0596831 * (1. + mu * mu); }
fn phG(mu: f32, g: f32) -> f32 { let g2 = g * g; return .1193662 * (1. - g2) * (1. + mu * mu) / ((2. + g2) * pow(max(1. + g2 - 2. * g * mu, 1e-4), 1.5)); }
fn phM(mu: f32) -> f32 { return phG(mu, MG); }
fn tUV(r: f32, mu: f32) -> vec2f {
  let H = sqrt(RT * RT - RG * RG); let rho = sqrt(max(r * r - RG * RG, 0.));
  let d = max(-r * mu + sqrt(max(r * r * (mu * mu - 1.) + RT * RT, 0.)), 0.);
  let dmin = RT - r; let dmax = rho + H;
  return vec2f((d - dmin) / (dmax - dmin), rho / H);
}
// sky-view LUT: u = azimuth from the sun's vertical plane (0..pi, the sky is symmetric about it), v = elevation,
// squeezed toward the horizon where the colour changes fastest
fn svUV(rd: vec3f) -> vec2f {
  let h = vec2f(rd.x, rd.z); let s = vec2f(SUNL.x, SUNL.z);
  let az = acos(clamp(dot(h, s) / max(length(h) * length(s), 1e-5), -1., 1.)) / PI;
  let e = asin(clamp(rd.y, -1., 1.)) / (PI * .5);
  return vec2f(az, .5 + .5 * sign(e) * sqrt(abs(e)));
}
`;

// ---------------------------------------------------------------- shared: uniforms, time of day, sky, air
const S_G = /*wgsl*/`
// pvp: last frame's unjittered view-projection; jit: xy this frame's projection jitter in NDC, z history reset (1), w frame
// amb: sky light on an up-facing white surface, integrated from the sky-view LUT at load
struct G { vp: mat4x4f, sm: mat4x4f, cam: vec4f, right: vec4f, up: vec4f, fwd: vec4f, sun: vec4f, res: vec4f, mis: vec4f, pvp: mat4x4f, jit: vec4f, amb: vec4f };
const LUMA = vec3f(.2126, .7152, .0722);
const SUNC = ${f3(SUNCP)}; const CLOUDSUN = ${f3(CLOUDSUN)};
// sky radiance per unit of the LUT: pi * solar scale, because surfaces here take SUNC as irradiance / pi
const SKYS = ${f3(ATM_NT.map((v) => v * ATM_S * PI * (NIGHT ? .45 : 1)))};
const HORL = ${f3(TD.horL)};
const HORF = ${f3(TD.horF)};
const GND = ${f3(TD.gnd)};
const LIGHTS = ${TD.lights.toFixed(2)};
const SUN_ = vec3f(${SUN.map((v) => v.toFixed(4)).join(', ')});
const NIGHT = ${NIGHT};
const TAU = 6.2831853;
const LOW = ${LV > 1};
const NEARO = vec2f(${NOX}., ${NOZ}.); const NEARS = vec2f(${(NX - 1) * NC}., ${(NZ - 1) * NC}.);
const LAMPC = vec3f(1., .66, .34);
fn sat(x: f32) -> f32 { return clamp(x, 0., 1.); }
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(.06711056, .00583715)))); }
fn hs(x: f32) -> f32 { return fract(sin(x * 127.1) * 43758.5453); }
fn h2(p: vec2f) -> f32 { var q = fract(vec3f(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn fin(c: vec3f) -> vec4f { return vec4f(min(max(c, vec3f(0.)), vec3f(60.)), 1.); }
fn czf(x: f32) -> f32 { return 60. * sin(x * .0011) + 25. * sin(x * .0031 + 1.); }
fn cov(d: f32, w: f32, fw: f32) -> f32 { let h = max(fw, 1e-4) * .5; return max(min(w, d + h) - max(-w, d - h), 0.) / (2. * h); }
fn qrot(q: vec4f, v: vec3f) -> vec3f { return v + 2. * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
`;

const S_B = S_G + W_ATMC + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sR: sampler;
@group(0) @binding(2) var sC: sampler;
@group(0) @binding(3) var sS: sampler_comparison;
@group(0) @binding(4) var tSh: texture_depth_2d;
@group(0) @binding(5) var tD: texture_2d<f32>;
@group(0) @binding(8) var tF: texture_2d<f32>;
@group(0) @binding(9) var tN: texture_2d<f32>;
@group(0) @binding(10) var tH: texture_2d<f32>;
@group(0) @binding(6) var tSV: texture_2d<f32>;
@group(0) @binding(7) var tMS: texture_2d<f32>;
// sky radiance in direction rd, from the sky-view LUT; at night the lit route glows low on the horizon
fn skyCol(rd: vec3f, sun: vec3f) -> vec3f {
  var c = textureSampleLevel(tSV, sC, svUV(rd), 0.).rgb * SKYS;
  if (NIGHT) { c += vec3f(.30, .16, .07) * .2 * pow(sat(1. - max(rd.y, 0.) * 7.), 2.5); }
  return c;
}
// aerial perspective from the same media, in closed form: optical depth of each exponential layer along the ray,
// single scattering of the sun (Rayleigh and Mie phase) plus the LUT's multiple scattering, a ~1 km dusty boundary
// layer and a 70 m dust layer over the ground. Far away it hands over to the sky LUT so the horizon has no seam.
struct Air { t: vec3f, i: vec3f };
const DUST = vec3f(.8e-4, .86e-4, .95e-4) * ${ATM.dust};
// dust absorbs a little more blue than red, which is what warms the haze
const HAZE = vec3f(.9, 1., 1.12) * ${ATM.haze};
fn airAt(cam: vec3f, wp: vec3f, sun: vec3f) -> Air {
  let v = wp - cam; let d = max(length(v), 1e-3); let rd = v / d;
  let hc = max(cam.y, -30.) * 1e-3 + ALT; let dk = d * 1e-3;
  let kr = rd.y / HR; let km = rd.y / HM; let k2 = rd.y / 70.; let kh = rd.y / 1.;
  let odR = select((1. - exp(-kr * dk)) / kr, dk, abs(kr) < 1e-6) * exp(-hc / HR);
  let odM = select((1. - exp(-km * dk)) / km, dk, abs(km) < 1e-6) * exp(-hc / HM);
  let od2 = select((1. - exp(-k2 * d)) / k2, d, abs(k2) < 1e-7) * exp(-max(cam.y, -30.) / 70.);
  let odH = select((1. - exp(-kh * dk)) / kh, dk, abs(kh) < 1e-6) * exp(-max(cam.y, -30.) * 1e-3);
  let sR = BR * odR; let sM = BMS * odM; let sD = DUST * .9 * od2 + HAZE * .85 * odH;
  let tau = sR + BME * odM + DUST * od2 + HAZE * odH;
  let T = exp(-tau);
  let mu = dot(rd, sun);
  let ms = textureSampleLevel(tMS, sC, vec2f(sun.y * .5 + .5, ALT / (RT - RG)), 0.).rgb;
  var ins = (SUNC * PI * (sR * phR(mu) + sM * phM(mu) + sD * phG(mu, .45)) + SKYS * ms * (sR + sM + sD)) * (vec3f(1.) - T) / max(tau, vec3f(1e-7));
  ins = mix(ins, skyCol(normalize(vec3f(rd.x, max(rd.y, 0.) * .3 + .012, rd.z)), sun) * (vec3f(1.) - T), ss(4000., 16000., d));
  return Air(T, ins);
}
fn aerialAt(c: vec3f, cam: vec3f, wp: vec3f, sun: vec3f) -> vec3f { let a = airAt(cam, wp, sun); return c * a.t + a.i; }
// the near terrain's normal, filtered per pixel (no lattice from the mesh's triangles)
fn nearNormal(p: vec2f) -> vec3f { return normalize(textureSampleLevel(tH, sC, (p - NEARO) / NEARS, 0.).xyz * 2. - 1.); }
fn shUV(p: vec3f) -> vec3f { let s = g.sm * vec4f(p, 1.); return vec3f(s.x * .5 + .5, .5 - s.y * .5, s.z - .0003); }
fn shK(s: vec3f) -> f32 { let e = min(min(s.x, 1. - s.x), min(s.y, 1. - s.y)); return ss(0., .02, e) * step(s.z, 1.); }
// the near masks (rock, road, paving, sun visibility from the terrain), 1 outside the near grid
fn nearAt(p: vec2f) -> vec4f {
  let uv = (p - NEARO) / NEARS;
  if (any(uv < vec2f(0.)) || any(uv > vec2f(1.))) { return vec4f(0., 0., 0., 1.); }
  return textureSampleLevel(tN, sC, uv, 0.);
}
fn terrainSun(p: vec3f) -> f32 { return ss(.15, .85, nearAt(p.xz).a); }
fn shadow1(p: vec3f) -> f32 { let s = shUV(p); return mix(1., textureSampleCompareLevel(tSh, sS, s.xy, s.z), shK(s)) * terrainSun(p); }
fn shadow9(p: vec3f) -> f32 {
  if (LOW) { return shadow1(p); }
  let s = shUV(p); let e = 1.6 / ${SHADOW}.; var a = 0.;
  let r = h2(floor(p.xz * 233.) + floor(p.y * 197.)) * TAU; let cr = cos(r); let sr = sin(r);
  for (var x = 0; x < 4; x++) { for (var y = 0; y < 4; y++) { let o = vec2f(f32(x), f32(y)) - 1.5; a += textureSampleCompareLevel(tSh, sS, s.xy + vec2f(o.x * cr - o.y * sr, o.x * sr + o.y * cr) * e, s.z); } }
  return mix(1., a / 16., shK(s)) * terrainSun(p);
}
fn amb(n: vec3f, sky: f32) -> vec3f {
  let up = n.y * .5 + .5;
  let toSun = sat(dot(normalize(vec3f(n.x, 0., n.z) + vec3f(0., 1e-4, 0.)), normalize(vec3f(SUN_.x, 0., SUN_.z)))) * (1. - abs(n.y));
  return HORL * .3 * toSun * toSun * (.4 + .6 * sky) + g.amb.xyz * up * up * (.35 + .65 * sky) + GND * .72 * (1. - up) * (.65 + .35 * sky) + GND * .16 * (.5 + .5 * sky);
}
// lamps at night: pools of warm light under the road lamps, the Muzdalifah towers and round the Jamarat
fn lamps(p: vec3f, n: vec3f) -> vec3f {
  if (LIGHTS < .5) { return vec3f(0.); }
  var acc = 0.;
  let zr = p.z - czf(p.x);
  { let lx = round(p.x / 42.) * 42. + 10.; let q = vec3f(lx, 0., czf(lx) - 75.); let d = vec2f(p.x - q.x, p.z - q.z); acc += .9 / (1. + dot(d, d) * .02); }
  if (p.x > -260. && p.x < 760.) { let lx = floor((p.x + 260.) / 110. + .5) * 110. - 260.; let lz = round(zr / 110.) * 110.; let d = vec2f(p.x - lx, zr - lz); acc += 1.4 / (1. + dot(d, d) * .006); }
  if (p.x > -1700. && p.x < -1300.) { acc += 1.5 * ss(140., 40., abs(zr)) * ss(-1720., -1650., p.x) * ss(-1290., -1360., p.x); }
  if (p.x > -1180. && p.x < -460.) { acc += .5 * ss(420., 300., abs(zr)); }
  return LAMPC * LIGHTS * .05 * acc * (.5 + .5 * sat(n.y));
}
fn flood(p: vec3f, n: vec3f) -> vec3f { return vec3f(0.); }
fn aerial(c: vec3f, wp: vec3f) -> vec3f { return aerialAt(c, g.cam.xyz, wp, g.sun.xyz); }
// second target: the share of the pixel's light that is ambient (sky and bounce), so screen-space AO darkens only
// that part, never the sunlit or emissive part
struct FO { @location(0) c: vec4f, @location(1) a: vec4f };
fn outA(c: vec3f, amb: vec3f, wp: vec3f) -> FO {
  let air = airAt(g.cam.xyz, wp, g.sun.xyz);
  let col = min(max(min(max(c, vec3f(0.)), vec3f(60.)) * air.t + air.i, vec3f(0.)), vec3f(60.));
  return FO(vec4f(col, 1.), vec4f(sat(dot(amb * air.t, LUMA) / max(dot(col, LUMA), 1e-5))));
}
`;

// ---------------------------------------------------------------- solids: ground, tents, structures, trees
// instance c: x material, y seed, z distance at which the mesh has shrunk away (0 = never), w variant
const W_SOLID = S_B + /*wgsl*/`
struct VI { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) a: vec4f, @location(3) b: vec4f, @location(4) c: vec4f };
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) op: vec3f, @location(3) on: vec3f,
  @location(4) @interpolate(flat) m: vec4f, @location(5) @interpolate(flat) q: vec4f, @location(6) ao: f32 };
@vertex fn vs(i: VI) -> VO {
  var o: VO;
  var sc = i.a.w;
  if (i.c.z > .5) { sc *= 1. - ss(i.c.z * .7, i.c.z, distance(i.a.xyz, g.cam.xyz)); }
  let lp = i.p * sc;
  var w = i.a.xyz + qrot(i.b, lp);
  let mt = i.c.x;
  // neem canopies stir a little in the breeze
  if (abs(mt - 42.) < .5) { let t = g.cam.w; let ph = dot(i.a.xz, vec2f(.07, .05)); w += vec3f(sin(t * 1.1 + ph), 0., cos(t * .9 + ph * 1.3)) * .06 * max(lp.y - 2., 0.); }
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = qrot(i.b, i.n.xyz);
  o.op = select(lp, w, mt < 2.5); o.on = i.n.xyz;
  o.m = i.c; o.q = i.b; o.ao = i.n.w;
  return o;
}
struct TP { h: f32, c: f32, n: vec3f };
fn tri(p: vec3f, n: vec3f, s: f32) -> TP {
  var w = pow(abs(n), vec3f(4.)); w /= (w.x + w.y + w.z);
  let x = textureSample(tD, sR, p.zy * s); let y = textureSample(tD, sR, p.xz * s); let z = textureSample(tD, sR, p.xy * s);
  var o: TP;
  o.h = x.b * w.x + y.b * w.y + z.b * w.z;
  o.c = x.a * w.x + y.a * w.y + z.a * w.z;
  let a = x.rg * 2. - 1.; let b = y.rg * 2. - 1.; let c = z.rg * 2. - 1.;
  o.n = vec3f(0., a.y, a.x) * w.x + vec3f(b.x, 0., b.y) * w.y + vec3f(c.x, c.y, 0.) * w.z;
  return o;
}
fn arcade(u: f32, v: f32, bw: f32, ah: f32, v0: f32) -> f32 {
  let x = (fract(u / bw) - .5) * bw; let hw = bw * .36;
  let y = v - v0;
  let top = ah + hw * 1.15 * sqrt(max(1. - (x / hw) * (x / hw), 0.)) - abs(x) * .35;
  return step(abs(x), hw) * step(0., y) * step(y, top);
}
fn archD(bu: f32, v: f32, hw: f32, ys: f32, R: f32) -> vec2f {
  let dv = v - ys;
  if (dv <= 0.) { return vec2f(abs(bu) - hw, -1.); }
  let cu = sign(bu) * (hw - R);
  let r = vec2f(bu - cu, dv);
  return vec2f(length(r) - R, floor(atan2(dv, abs(bu - cu)) / .14));
}
@fragment fn fs(i: VO, @builtin(front_facing) ff: bool) -> FO {
  let mat = i32(i.m.x + .5); let sd = i.m.y; let fl_ = select(-1., 1., ff);
  let on = normalize(i.on) * fl_; let n0 = normalize(i.n) * fl_;
  let dist = length(i.wp - g.cam.xyz);
  let ground = mat <= 2;
  var onG = on;
  if (mat == 2) { onG = nearNormal(i.wp.xz); }
  let ts = select(1., .5, mat >= 5);
  let A = tri(i.op, on, select(.07, .035, mat == 1) * ts); let B = tri(i.op, on, .31 * ts); let C = tri(i.op, on, 1.3 * ts);
  let Lg = textureSample(tD, sR, i.wp.xz * .0045 + .31);
  let G2 = textureSample(tD, sR, i.wp.xz * .0021 + vec2f(.13, .71));
  let fm = textureSample(tF, sC, i.wp.xz / 24000. + .5);
  let nm = nearAt(i.wp.xz);
  let fwp = length(fwidth(i.wp.xz)); let fw3 = length(fwidth(i.wp)); let fwop = length(fwidth(i.op));
  var bump = 1.; var gloss = .08; var alb = vec3f(.5); var emi = vec3f(0.); var metal = 0.; var vao = 1.;
  let flt = ss(.7, .92, n0.y);
  let fu = select(i.op.z, i.op.x, abs(on.z) > abs(on.x)); let fv = i.op.y; let wall = 1. - ss(.45, .7, abs(on.y));
  if (ground) {
    // desert gravel and sand on the floors, dark granite on the mountains, asphalt, pale paving
    let rock = max(select(fm.r, nm.r, mat == 2), ss(.86, .7, onG.y) * select(1., 0., mat == 1)); let road = select(0., nm.g, mat == 2); let paved = select(0., nm.b, mat == 2);
    var sand = mix(vec3f(.60, .50, .38), vec3f(.70, .60, .46), sat(A.c * .9 + Lg.a * .9 - .55)) * (.78 + .34 * mix(B.h, Lg.b, .45)) * (.93 + .14 * C.c);
    sand = mix(sand, sand * vec3f(.82, .8, .78), ss(.55, .75, Lg.a) * .5);
    var gr = mix(vec3f(.12, .115, .11), vec3f(.27, .25, .23), sat(G2.a * 1.4 - .2)) * (.55 + .7 * mix(B.h, G2.b, .5));
    gr = mix(gr, gr * vec3f(1.18, 1.05, .92), ss(.5, .8, B.c) * .45);
    alb = mix(sand, gr, sat(rock * 1.3) * (1. - .25 * flt));
    let lane = cov(abs(abs(i.wp.z - czf(i.wp.x) + 75.) - 6.), .12, fwp) + cov(abs(abs(i.wp.z - czf(i.wp.x) + 75.) - 1.), .1, fwp) * step(.5, fract(i.wp.x / 9.));
    alb = mix(alb, mix(vec3f(.26, .25, .25), vec3f(.85, .83, .78), lane * (1. - ss(.3, 1.5, fwp))), road);
    let tile = max(cov(abs(fract(i.wp.x / 1.2) - .5) * 1.2 - .58, .01, fwp), cov(abs(fract(i.wp.z / 1.2) - .5) * 1.2 - .58, .01, fwp)) * (1. - ss(.015, .06, fwp));
    alb = mix(alb, vec3f(.78, .75, .70) * (1. - .2 * tile) * (.94 + .08 * h2(floor(i.wp.xz / 1.2))), paved);
    bump = mix(1., .1, max(road, paved)) * mix(.25, 1.2, rock); gloss = mix(.03, .12, paved);
  } else if (mat == 7) {
    // the mosques: pale stone with two storeys of arcades painted on, a band under the parapet
    alb = vec3f(.80, .76, .68) * (.96 + .05 * B.h) * (.97 + .05 * C.c);
    let wv = fv;
    let ar1 = arcade(fu + 3., wv, 6., 6., .8) * wall * step(.2, abs(on.x) + abs(on.z));
    let ar2 = arcade(fu + 3., wv + .25, 5.2, 5.6, .8) * wall;
    alb = mix(alb, alb * .72, (ar1 - ar2 * ar1) * step(wv, 14.));
    alb = mix(alb, mix(vec3f(.05, .045, .04), vec3f(.16, .13, .10), ss(4., .5, wv)), ar2 * ar1 * step(wv, 14.));
    let pil = cov(abs(fract((fu + 3.) / 6.) - .5) * 6. - 2.75, .18, fwop) * step(wv, 18.5) * step(9.5, wv) * wall;
    alb = mix(alb, alb * .86, pil);
    alb = mix(alb, alb * .7, cov(abs(wv - 18.6), .25, fwop) * wall);
    emi = LAMPC * LIGHTS * .12 * ar1 * step(wv, 14.);
    alb = mix(alb, alb * vec3f(.86, .8, .7), ss(.9, .97, fract(wv / 15.)) * wall);
    alb = mix(alb, vec3f(.72, .70, .66) * (.9 + .15 * B.c), ss(.6, .9, on.y));
    emi += alb * vec3f(1., .9, .76) * .2 * f32(NIGHT) * wall;
    bump = .05; gloss = .1;
  } else if (mat == 20) {
    alb = vec3f(.80, .76, .68) * (.96 + .05 * B.h);
    let ang = atan2(i.op.z, i.op.x); let fa = (fract(ang / TAU * 8. + .5) - .5) * TAU / 8.;
    let rr = length(i.op.xz); let fuo = rr * sin(fa);
    let k = i.m.w; let y = i.op.y / k;
    var st = vec3f(0.);
    if (y > 23.5 && y < 47.) { st = vec3f(24.5, 46., .8); }
    if (y > 53. && y < 66.) { st = vec3f(54., 65.2, .7); }
    if (y > 71. && y < 78.3) { st = vec3f(71.6, 77.6, .55); }
    if (y > 82.4 && y < 85.8) { st = vec3f(82.6, 85.4, .5); }
    if (st.z > 0. && rr < 4.2 * k && abs(on.y) < .5) {
      let ad = archD(fuo / k, y, st.z, st.y - st.z * 1.6, st.z * 1.5);
      let inN = step(st.x, y) * sat(-ad.x / max(fw3 / k, 1e-3) + .5);
      let lantern = step(82., y) * step(y, 86.);
      alb = mix(alb, mix(alb * .6, vec3f(.04, .035, .03), lantern), inN);
      emi += vec3f(1., .72, .42) * 2. * LIGHTS * inN * lantern;
    }
    let bal = vec3f(48.4, 66.6, 78.8);
    for (var b = 0; b < 3; b++) { emi += vec3f(1., .7, .4) * .6 * LIGHTS * ss(bal[b] - .4, bal[b] + .6, y) * ss(bal[b] + 2.1, bal[b] + 1.3, y) * step(on.y, -.1); }
    emi += alb * vec3f(1., .9, .76) * .3 * f32(NIGHT) * ss(140. * k, 10., i.op.y);
    bump = .05; gloss = .12;
  } else if (mat == 10) {
    alb = vec3f(1., .74, .32); gloss = .8; metal = 1.; bump = 0.;
  } else if (mat == 22) {
    alb = vec3f(.9, .85, .7); emi = vec3f(2.6, 1.9, 1.2) * 1.4 * max(LIGHTS, .3) * (.9 + .2 * sd); gloss = .8;
  } else if (mat == 27) {
    // w 1 concrete (the Jamarat, the rail line), w 2 granite boulders, w 3 the pillars' dressed stone
    if (i.m.w < 1.5) { alb = vec3f(.74, .72, .68) * (.9 + .14 * B.h) * (.95 + .08 * C.c); gloss = .1; bump = .1; emi = vec3f(1., .82, .6) * .05 * LIGHTS * f32(NIGHT) * wall; }
    else if (i.m.w < 2.5) { alb = mix(vec3f(.25, .23, .22), vec3f(.44, .40, .36), A.c) * (.7 + .5 * B.h) * (.8 + .4 * hs(sd * 17.)); gloss = .08; bump = 1.; }
    else { alb = vec3f(.46, .43, .40) * (.9 + .15 * B.h); let cj = cov(abs(fract(fv / .8) - .5) * .8 - .38, .015, fwop); alb *= 1. - .2 * cj; gloss = .15; bump = .2; }
  } else if (mat == 36) {
    alb = vec3f(.90, .89, .86) * (.96 + .05 * B.h); gloss = .3; bump = .05; emi = alb * .25 * f32(NIGHT);
  } else if (mat == 37) {
    alb = vec3f(.82, .80, .76) * (.94 + .08 * B.h); gloss = .25; bump = .05;
  } else if (mat == 41) {
    // tent fabric: white with seams; at night the light inside shows through the walls
    let seam = cov(abs(fract(fu / 1.6) - .5) * 1.6, .02, fwop) * (1. - ss(.02, .08, fwop));
    alb = vec3f(.84, .84, .82) * (1. - .12 * seam) * (.94 + .1 * hs(sd * 13.));
    let wallPart = step(fv, 2.4) * wall;
    emi = vec3f(1., .78, .52) * LIGHTS * (.02 + .06 * wallPart) * step(.15, hs(sd * 7.)) * f32(LIGHTS > .5);
    gloss = .2; bump = .02; vao = mix(.7, 1., ss(-.5, 1.5, fv));
  } else if (mat == 42) {
    alb = mix(vec3f(.20, .21, .14), vec3f(.27, .27, .18), B.c) * (.7 + .6 * C.h); gloss = .1; bump = 1.4;
    vao = mix(.55, 1., sat((i.op.y - 2.) / 3.5));
  } else if (mat == 43) {
    alb = vec3f(.24, .19, .14) * (.8 + .4 * C.h); bump = .8;
  } else if (mat == 44) {
    alb = vec3f(.55, .56, .58); metal = .5; gloss = .45; bump = .05;
  } else if (mat == 45) {
    let rib = cov(abs(fract(i.wp.x / 1.75) - .5) * 1.75, .04, fwp) * step(on.y, -.5) * (1. - ss(.02, .08, fwp));
    alb = vec3f(.92, .92, .90) * (1. - .25 * rib); gloss = .3; bump = .02;
    emi = vec3f(1., .82, .6) * .035 * LIGHTS * step(on.y, -.5) * f32(LIGHTS > .5) + SUNC * vec3f(1., .9, .75) * .1 * step(on.y, -.5) * (1. - rib) * f32(!NIGHT);
  }
  let N = normalize(qrot(i.q, normalize(onG + (A.n * .8 + B.n * .6 + C.n * .4 * ss(70., 10., dist)) * bump)));
  let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  let so = 1.;
  let ao = vao * select(mix(1., i.ao, .6), 1., ground);
  let sh = select(shadow9(i.wp + n0 * (.15 + dist * .002) + g.sun.xyz * .12), sat(i.ao * 1.6 - .3), mat == 1);
  let E = SUNC * sh;
  let ndl = sat(dot(N, L));
  // the fabric of tents and canopies lets a little light through
  let trans = select(0., .25, mat == 41 || mat == 45) * sat(-dot(N, L));
  let ab = amb(N, so) * ao;
  let am = ab + lamps(i.wp, N);
  var c = alb * (E * (ndl + trans) + am) * (1. - metal * .85) + emi;
  let Hh = normalize(V + L);
  let spc = mix(vec3f(.04), alb, metal);
  c += E * spc * pow(sat(dot(N, Hh)), mix(8., 160., gloss)) * gloss * ndl * 4.;
  let R = reflect(-V, N); let fr = pow(1. - sat(dot(N, V)), 5.);
  let env = mix(GND * .6, skyCol(R, L), ss(-.2, .3, R.y)) + LAMPC * LIGHTS * .02;
  let refl = env * ao * spc * gloss * mix(.25 + .75 * fr, 1., metal) * 1.5;
  return outA(c + refl, alb * ab * (1. - metal * .85) + refl, i.wp);
}
`;

// ---------------------------------------------------------------- fullscreen helpers
const W_FS = /*wgsl*/`
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0., 1.); }
`;

// LUT passes, run once at load (the sun does not move)
const W_ATMLUT = W_FS + W_ATMC + /*wgsl*/`
@group(0) @binding(0) var tT: texture_2d<f32>;
@group(0) @binding(1) var tM: texture_2d<f32>;
@group(0) @binding(2) var sL: sampler;
fn trans(r: f32, mu: f32) -> vec3f {
  if (mu < 0. && r * r * (mu * mu - 1.) + RG * RG >= 0.) { return vec3f(0.); }
  return textureSampleLevel(tT, sL, tUV(r, mu), 0.).rgb;
}
fn hitR(r: f32, mu: f32, R: f32) -> f32 { let d = r * r * (mu * mu - 1.) + R * R; return select(-1., -r * mu - sqrt(max(d, 0.)), d >= 0.); }
fn tmaxOf(r: f32, mu: f32) -> f32 {
  let g = hitR(r, mu, RG);
  if (mu < 0. && g > 0.) { return g; }
  return -r * mu + sqrt(max(r * r * (mu * mu - 1.) + RT * RT, 0.));
}
@fragment fn fsT(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / vec2f(256., 64.);
  let H = sqrt(RT * RT - RG * RG); let rho = H * uv.y; let r = sqrt(rho * rho + RG * RG);
  let dmin = RT - r; let dmax = rho + H; let d = dmin + uv.x * (dmax - dmin);
  let mu = clamp(select((H * H - rho * rho - d * d) / (2. * r * d), 1., d <= 0.), -1., 1.);
  var od = vec3f(0.); let dt = d / 40.;
  for (var i = 0; i < 40; i++) {
    let t = (f32(i) + .5) * dt; let hh = sqrt(r * r + t * t + 2. * r * mu * t) - RG;
    od += medium(hh).e * dt;
  }
  return vec4f(exp(-od), 1.);
}
// multiple scattering (Hillaire 2020 sec. 5.5): second-order light from 64 directions, as a geometric series
@fragment fn fsM(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / 32.; let mus = uv.x * 2. - 1.; let r = RG + uv.y * (RT - RG) + .01;
  let sd = vec3f(sqrt(1. - mus * mus), mus, 0.);
  var L2 = vec3f(0.); var fm = vec3f(0.);
  for (var i = 0; i < 8; i++) { for (var j = 0; j < 8; j++) {
    let th = PI * 2. * (f32(i) + .5) / 8.; let ph = acos(1. - 2. * (f32(j) + .5) / 8.);
    let rd = vec3f(cos(th) * sin(ph), cos(ph), sin(th) * sin(ph));
    let tm = tmaxOf(r, rd.y); let dt = tm / 20.;
    var T = vec3f(1.); var L = vec3f(0.); var f = vec3f(0.);
    for (var k = 0; k < 20; k++) {
      let p = vec3f(0., r, 0.) + rd * (f32(k) + .5) * dt; let pr = length(p);
      let m = medium(pr - RG); let s = m.sr + m.sm; let e = max(m.e, vec3f(1e-7));
      let st = trans(pr, dot(p / pr, sd));
      let x = (vec3f(1.) - exp(-e * dt)) / e;
      L += T * s * st * .0795775 * x; f += T * s * x;
      T *= exp(-e * dt);
    }
    if (hitR(r, rd.y, RG) > 0. && rd.y < 0.) {
      let gp = vec3f(0., r, 0.) + rd * tm; let gn = normalize(gp);
      L += T * trans(RG, dot(gn, sd)) * max(dot(gn, sd), 0.) * .3 / PI;
    }
    L2 += L / 64.; fm += f / 64.;
  } }
  return vec4f(L2 / (vec3f(1.) - fm), 1.);
}
@fragment fn fsS(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / vec2f(192., 108.);
  let az = uv.x * PI; let v = uv.y * 2. - 1.; let e = sign(v) * v * v * PI * .5;
  let sh = normalize(vec2f(SUNL.x, SUNL.z)); let ch = vec2f(-sh.y, sh.x);
  let hd = sh * cos(az) + ch * sin(az);
  let rd = vec3f(hd.x * cos(e), sin(e), hd.y * cos(e));
  let r = RG + ALT; let tm = tmaxOf(r, rd.y); let mu = dot(rd, SUNL);
  let pR = phR(mu); let pM = phM(mu);
  var T = vec3f(1.); var L = vec3f(0.); var t0 = 0.;
  for (var k = 0; k < 40; k++) {
    let t1 = tm * pow((f32(k) + 1.) / 40., 2.); let dt = t1 - t0; let t = (t0 + t1) * .5; t0 = t1;
    let p = vec3f(0., r, 0.) + rd * t; let pr = length(p); let up = p / pr;
    let m = medium(pr - RG); let e = max(m.e, vec3f(1e-7));
    let ms = textureSampleLevel(tM, sL, vec2f(dot(up, SUNL) * .5 + .5, (pr - RG) / (RT - RG)), 0.).rgb;
    let S = (m.sr * pR + m.sm * pM) * trans(pr, dot(up, SUNL)) + (m.sr + m.sm) * ms;
    L += T * S * (vec3f(1.) - exp(-e * dt)) / e;
    T *= exp(-e * dt);
  }
  return vec4f(L, 1.);
}
`;

// surface detail texture (tileable): rg = slope, b = height, a = mottling
const W_DETAIL = W_SS + W_NOISE + W_FS + /*wgsl*/`
fn hp(p: vec2f, per: f32) -> f32 { return h31(vec3f(p - per * floor(p / per), per)); }
fn tn(p: vec2f, per: f32) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(hp(i, per), hp(i + vec2f(1., 0.), per), u.x), mix(hp(i + vec2f(0., 1.), per), hp(i + vec2f(1., 1.), per), u.x), u.y);
}
fn tf(uv: vec2f, per: f32, n: i32) -> f32 { var a = .5; var s = 0.; var pr = per; for (var i = 0; i < n; i++) { s += a * tn(uv * pr + f32(i) * 7.3, pr); pr *= 2.; a *= .5; } return s / (1. - 2. * a); }
fn tw(p: vec2f, per: f32) -> vec3f {
  let i = floor(p); let f = fract(p); var d = vec2f(9.); var id = 0.;
  for (var x = -1; x <= 1; x++) { for (var y = -1; y <= 1; y++) {
    let o = vec2f(f32(x), f32(y)); let c = i + o; let cw = c - per * floor(c / per);
    let hh = h33(vec3f(cw, per)); let r = o + hh.xy - f; let l = dot(r, r);
    if (l < d.x) { d.y = d.x; d.x = l; id = hh.z; } else if (l < d.y) { d.y = l; }
  } }
  return vec3f(sqrt(d), id);
}
fn H(uv: vec2f) -> f32 {
  let wq = uv + .11 * (vec2f(tf(uv, 3., 4), tf(uv + .5, 3., 4)) - .5);
  let f = tf(wq, 3., 8);
  let r1 = 1. - abs(tf(wq + 1.7, 5., 6) * 2. - 1.);
  let cr = min(abs(tf(wq + 4.1, 4., 5) * 2. - 1.) * 7., 1.);
  let cr2 = min(abs(tf(wq.yx + 2.3, 9., 4) * 2. - 1.) * 9., 1.);
  let pt = tw(wq * 29., 29.);
  let pit = (1. - ss(.0, .34, pt.x)) * step(.62, pt.z);
  return f * .50 + r1 * r1 * .24 + cr * cr2 * .26 - pit * .07;
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / 1024.; let e = 1. / 1024.;
  let h = H(uv);
  let gx = H(uv + vec2f(e, 0.)) - H(uv - vec2f(e, 0.)); let gy = H(uv + vec2f(0., e)) - H(uv - vec2f(0., e));
  let s = clamp(vec2f(gx, gy) * 1024. * .5 * .075, vec2f(-1.), vec2f(1.));
  return vec4f(-s * .5 + .5, h, tf(uv + 3.7, 3., 5));
}
`;

// blit / mip / bloom chain
const W_BLIT = W_FS + /*wgsl*/`
@group(0) @binding(0) var t: texture_2d<f32>;
@group(0) @binding(1) var s: sampler;
fn uvOf(fc: vec4f, k: f32) -> vec2f { return fc.xy * k / vec2f(textureDimensions(t)); }
@fragment fn fsMip(@builtin(position) fc: vec4f) -> @location(0) vec4f { return textureSampleLevel(t, s, uvOf(fc, 2.), 0.); }
fn kar(c: vec3f) -> vec4f { let w = 1. / (1. + max(c.r, max(c.g, c.b))); return vec4f(c * w, w); }
@fragment fn fsDown0(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, 2.); let e = 1. / vec2f(textureDimensions(t));
  let a = kar(min(textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.).rgb, vec3f(24.)));
  let b = kar(min(textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.).rgb, vec3f(24.)));
  let c = kar(min(textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.).rgb, vec3f(24.)));
  let d = kar(min(textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.).rgb, vec3f(24.)));
  let m = a + b + c + d;
  return vec4f(m.rgb / m.a, 1.);
}
@fragment fn fsDown(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, 2.); let e = 1. / vec2f(textureDimensions(t));
  return (textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.)
        + textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.)) * .25;
}
@fragment fn fsUp(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, .5); let e = .75 / vec2f(textureDimensions(t));
  return (textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.)
        + textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.)) * .25;
}
`;


// ---------------------------------------------------------------- birds (pigeons): flight and flapping in the shader
const W_ANIM = S_B + /*wgsl*/`
struct VI { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) a: vec4f, @location(3) b: vec4f };
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) op: vec3f, @location(3) @interpolate(flat) sd: f32 };
@vertex fn vs(i: VI) -> VO {
  var o: VO;
  let s = i.b.x; let h = vec3f(hs(s), hs(s + .37), hs(s + .71));
  let R = i.a.w; let t = g.cam.w; let stand = R < .5;
  let ta = t * i.b.y + i.b.w * 6.3 + (h.x - .5) * (14. / max(R, .5));
  let ph = i.b.w * 17.;
  var P = i.a.xyz + vec3f(R * cos(ta), 4. * sin(2. * ta + ph), R * .8 * sin(ta));
  var T = normalize(vec3f(-R * sin(ta), 8. * cos(2. * ta + ph), R * .8 * cos(ta))) * sign(i.b.y);
  var off = vec3f(0.);
  if (stand) {
    let hd = i.b.y + .4 * sin(t * .3 + s * 9.);
    let peck = pow(max(sin(t * 2.2 + s * 30.), 0.), 6.);
    T = normalize(vec3f(cos(hd), -.5 * peck, sin(hd))); P = i.a.xyz + vec3f(0., .13 + .01 * sin(t * 5. + s), 0.);
  }
  let S = normalize(cross(vec3f(0., 1., 0.), T)); let Up = cross(T, S);
  if (!stand) { off = S * ((h.y - .5) * 9. + sin(t * .5 + s * 40.) * 1.5) + Up * ((h.z - .5) * 5. + cos(t * .4 + s * 31.) * 1.); }
  var l = i.p * i.b.z;
  let au = abs(i.n.w);
  let flap = ss(-.3, .4, sin(t * .45 + s * 23.));
  if (stand) { l.x *= mix(1.15, .2, au); l.y = l.y * 1.6 - .03 * au; }
  else { l.y += sin(t * 13. + s * 50.) * .55 * au * au * i.b.z * flap + au * .12 * i.b.z * (1. - flap); }
  let w = P + off + S * l.x + Up * l.y + T * l.z;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = S * i.n.x + Up * i.n.y + T * i.n.z; o.op = i.p; o.sd = s;
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let n = normalize(i.n); let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  var alb = mix(vec3f(.30, .32, .36), vec3f(.48, .49, .52), ss(-.02, .02, i.op.y));
  alb = mix(alb, vec3f(.12, .13, .15), ss(.7, .9, abs(i.op.x)));
  let E = SUNC * shadow1(i.wp);
  var c = alb * (E * (.2 + .8 * sat(dot(n, L))) + amb(n, 1.) * 1.2 + flood(i.wp, n) * 1.5) + E * pow(sat(dot(n, normalize(V + L))), 20.) * .2;
  return fin(aerial(c, i.wp));
}
`;

// ---------------------------------------------------------------- sky dome behind everything
const W_SKY = S_B + W_NOISE + /*wgsl*/`
struct VO { @builtin(position) cp: vec4f, @location(0) d: vec3f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  var o: VO;
  let p = vec2f(f32(i & 1u), f32(i >> 1u)) * 2. - 1.;
  o.d = g.fwd.xyz + g.right.xyz * (p.x * g.right.w) + g.up.xyz * (p.y * g.up.w);
  o.cp = vec4f(p, 1e-9, 1.);
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let rd = normalize(i.d); let L = g.sun.xyz; let mu = dot(rd, L);
  var c = skyCol(rd, L);
  if (NIGHT) {
    // stars: one per cell of a grid on the sphere, drawn as a filtered disc so they never sparkle
    let p = rd * 260.; let ce = floor(p); let hh = h33(ce);
    let d = length(p - ce - .5 - (hh - .5) * .5);
    let fw = max(length(fwidth(p)), 1e-3);
    let b = pow(hh.x, 28.) * ss(.02, .25, rd.y);
    let disc = sat((max(fw * .7, .05) - d) / fw + .5) * min(1., .05 / max(fw * .7, .05));
    c += vec3f(.8, .85, 1.) * b * disc * .9;
    // the moon: a disc with soft limb darkening and faint maria
    let md = acos(clamp(mu, -1., 1.));
    let mr = .0095;
    let lim = sqrt(sat(1. - (md / mr) * (md / mr)));
    let mar = .8 + .2 * fbm(rd * 900. + 1., 3);
    c = mix(c, vec3f(1.6, 1.58, 1.5) * (.55 + .45 * lim) * mar, sat((mr - md) / max(fwidth(md), 1e-5) + .5));
  } else {
    // high thin cloud on a plane 6 km up, lit gold toward the sun and rose away from it
    if (rd.y > .004) {
      let q = rd.xz / rd.y * 6000.;
      let r = vec2f(q.x * .96 + q.y * .28, q.y * .96 - q.x * .28) * vec2f(.00011, .00042) + vec2f(g.cam.w * .002, 0.);
      let n = fbm(vec3f(r, 1.3), 5) + .35 * (fbm(vec3f(r * 3.1, 4.1), 3) - .5);
      let cov_ = ss(.6, .97, n) * ss(.03, .2, rd.y) * (1. - ss(.35, .9, rd.y));
      let lit = (CLOUDSUN * (.05 + .45 * pow(max(mu, 0.), 4.)) + g.amb.xyz * .9) * (.75 + .5 * fbm(vec3f(r * 7., 2.), 2));
      c = mix(c, lit, cov_ * .3);
    }
    c += SUNC * 9. * ss(.99988, .99994, mu);
  }
  return fin(c);
}
`;

// ---------------------------------------------------------------- dust motes in the low sun (additive)
const W_SPR = S_B + /*wgsl*/`
struct VO { @builtin(position) cp: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) pr: vec4f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) a: vec4f) -> VO {
  var o: VO; let q = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2. - 1.; let t = g.cam.w;
  let B = 26.;
  var p = a.xyz * B + vec3f(t * .18, t * .03, t * .07) + .4 * vec3f(sin(t * .3 + a.x * 60.), sin(t * .23 + a.y * 50.), cos(t * .27 + a.z * 70.));
  p = g.cam.xyz + (fract((p - g.cam.xyz) / B + .5) - .5) * B;
  let d = length(p - g.cam.xyz);
  let sz = .006 + .02 * a.w * a.w * a.w;
  let w = p + (g.right.xyz * q.x + g.up.xyz * q.y) * max(sz, d * .0016);
  o.cp = g.vp * vec4f(w, 1.); o.uv = q;
  let fade = ss(B * .5, B * .3, d) * ss(.4, 2., d) * min(1., sz / (d * .0016)) * ss(-2., 1., -abs(p.y - 4.) + 4.) * .3;
  let mu = dot(normalize(p - g.cam.xyz), g.sun.xyz);
  let ph = .15 + 2.2 * pow(max(mu, 0.), 6.);
  o.pr = vec4f(fade * ph * shadow1(p), a.w, 0., 0.);
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let m = ss(1., .15, length(i.uv));
  return vec4f(min(SUNC * mix(vec3f(1.), vec3f(1., .9, .6), i.pr.y) * m * m * i.pr.x * .9, vec3f(6.)), 0.);
}
`;

// ---------------------------------------------------------------- sun shafts through the morning dust (half res)
const W_RAYS = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sS: sampler_comparison;
@group(0) @binding(2) var tSh: texture_depth_2d;
@group(0) @binding(3) var tDp: texture_depth${AA > 1 ? '_multisampled' : ''}_2d;
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let dp = textureLoad(tDp, vec2i(fc.xy) * 2, 0);
  let uv = fc.xy * 2. * g.res.zw;
  let nd = vec2f(uv.x * 2. - 1., 1. - uv.y * 2.);
  let rv = g.fwd.xyz + g.right.xyz * (nd.x * g.right.w) + g.up.xyz * (nd.y * g.up.w);
  let rl = length(rv); let rd = rv / rl;
  let zl = g.fwd.w / max(dp, 1e-6);
  let tm = min(zl * rl, 160.);
  let ro = g.cam.xyz; let sx = g.sun.xyz;
  let dt = tm / ${RAYN}.;
  let j = ign(fc.xy);
  var acc = 0.;
  for (var n = 0; n < ${RAYN}; n++) {
    let t = (f32(n) + j) * dt;
    let p = ro + rd * t;
    let s = g.sm * vec4f(p, 1.);
    let su = vec2f(s.x * .5 + .5, .5 - s.y * .5);
    let inb = ss(0., .01, min(min(su.x, 1. - su.x), min(su.y, 1. - su.y)));
    let vis = mix(1., textureSampleCompareLevel(tSh, sS, su, s.z - .0003), inb);
    let dust = (.10 + exp(-max(p.y, 0.) / 10.) * 1.4) * mix(.3, 1., inb);
    acc += vis * dust * exp(-t * .004);
  }
  let mu = dot(rd, sx);
  let gg = .72;
  let ph = (1. - gg * gg) / pow(1. + gg * gg - 2. * gg * mu, 1.5) * .07 + .1;
  return vec4f(min(SUNC * vec3f(1., .84, .62) * acc * dt * .007 * ph * g.mis.y, vec3f(20.)), zl);
}
`;
// depth-aware 3x3 blur of the half-res shafts (hides the sampling dither)
const W_RBLUR = W_FS + /*wgsl*/`
@group(0) @binding(0) var tR: texture_2d<f32>;
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = vec2i(fc.xy); let mx = vec2i(textureDimensions(tR)) - 1;
  let c = textureLoad(tR, p, 0);
  var acc = vec3f(0.); var ws = 0.;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let r = textureLoad(tR, clamp(p + vec2i(x, y), vec2i(0), mx), 0);
    let w = 1. / (.03 + abs(r.a - c.a) / c.a);
    acc += r.rgb * w; ws += w;
  } }
  return vec4f(acc / ws, c.a);
}
`;

// ---------------------------------------------------------------- final composite
const W_POST = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sC: sampler;
@group(0) @binding(2) var tS: texture_2d<f32>;
@group(0) @binding(3) var tR: texture_2d<f32>;
@group(0) @binding(4) var tB: texture_2d<f32>;
@group(0) @binding(5) var tDp: texture_depth${AA > 1 ? '_multisampled' : ''}_2d;
fn tmap(x: vec3f) -> vec3f { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), vec3f(0.), vec3f(1.)); }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let px = vec2i(fc.xy);
  let uv = fc.xy * g.res.zw;
  let zf = g.fwd.w / max(textureLoad(tDp, px, 0), 1e-6);
  let h = fc.xy * .5 - .5; let b = floor(h); let f = h - b; let bi = vec2i(b);
  let mx = vec2i(textureDimensions(tR)) - 1;
  var acc = vec3f(0.); var ws = 0.;
  for (var k = 0; k < 4; k++) {
    let o = vec2i(k & 1, k >> 1);
    let r = textureLoad(tR, clamp(bi + o, vec2i(0), mx), 0);
    let bw = mix(1. - f.x, f.x, f32(o.x)) * mix(1. - f.y, f.y, f32(o.y));
    let w = (bw + .02) / (.02 + abs(r.a - zf) / zf);
    acc += r.rgb * w; ws += w;
  }
  var c = textureLoad(tS, px, 0).rgb;
  if (${LV < 2}) {
    // TAA averages sub-pixel detail away; a clamped unsharp mask brings it back without halos
    let sm = vec2i(textureDimensions(tS)) - 1;
    let n0 = textureLoad(tS, clamp(px + vec2i(1, 0), vec2i(0), sm), 0).rgb; let n1 = textureLoad(tS, clamp(px - vec2i(1, 0), vec2i(0), sm), 0).rgb;
    let n2 = textureLoad(tS, clamp(px + vec2i(0, 1), vec2i(0), sm), 0).rgb; let n3 = textureLoad(tS, clamp(px - vec2i(0, 1), vec2i(0), sm), 0).rgb;
    c = clamp(c + (c - (n0 + n1 + n2 + n3) * .25) * .8, min(min(min(n0, n1), min(n2, n3)), c), max(max(max(n0, n1), max(n2, n3)), c));
  }
  c += acc / ws;
  let bl = textureSampleLevel(tB, sC, uv, 0.).rgb;
  c = mix(c, bl, .03) + bl * .012;
  c *= g.mis.x;
  let q = uv - .5;
  c *= 1. - dot(q, q) * .45;
  c = tmap(c);
  let l0 = dot(c, vec3f(.2126, .7152, .0722));
  let l = mix(l0, l0 * l0 * (3. - 2. * l0), .4);
  c *= l / max(l0, 1e-4);
  c = mix(vec3f(l), c, 1.04) + vec3f(.006, .003, 0.);
  c = pow(max(c, vec3f(0.)), vec3f(1. / 2.2));
  let n = ign(fc.xy) + ign(fc.xy + 37.) - 1.;
  return vec4f(c + n / 255., 1.);
}
`;
// ---------------------------------------------------------------- ground-truth ambient occlusion (half res)
// GTAO (Jimenez et al. 2016, structure after XeGTAO): per slice direction, find the highest horizon on each side
// from the depth buffer, then integrate the cosine-weighted visible arc against the projected normal. Positions
// are camera-relative world space, so no view matrix is needed. Noise rotates every frame; TAA averages it.
const W_AO = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var tDp: texture_depth_multisampled_2d;
const SLICES = ${LV ? 2 : 3}; const STEPS = ${LV ? 3 : 4};
fn zAt(p: vec2i) -> f32 { return g.fwd.w / max(textureLoad(tDp, clamp(p, vec2i(0), vec2i(g.res.xy) - 1), 0), 1e-7); }
fn posAt(q: vec2f, z: f32) -> vec3f {
  let uv = q * g.res.zw; let nd = vec2f(uv.x * 2. - 1., 1. - uv.y * 2.) - g.jit.xy;
  return (g.fwd.xyz + g.right.xyz * (nd.x * g.right.w) + g.up.xyz * (nd.y * g.up.w)) * z;
}
fn fastAcos(x: f32) -> f32 { let a = abs(x); let r = (-.156583 * a + 1.570796) * sqrt(max(1. - a, 0.)); return select(3.141593 - r, r, x >= 0.); }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = vec2i(fc.xy) * 2; let q = vec2f(p) + .5;
  let dp = textureLoad(tDp, p, 0);
  if (dp < 1e-7) { return vec4f(1., 6e4, 0., 0.); }
  let z = g.fwd.w / dp; let P = posAt(q, z);
  let zr = zAt(p + vec2i(2, 0)); let zl = zAt(p - vec2i(2, 0)); let zd = zAt(p + vec2i(0, 2)); let zu = zAt(p - vec2i(0, 2));
  let dx = select(P - posAt(q - vec2f(2., 0.), zl), posAt(q + vec2f(2., 0.), zr) - P, abs(zr - z) < abs(zl - z));
  let dy = select(P - posAt(q - vec2f(0., 2.), zu), posAt(q + vec2f(0., 2.), zd) - P, abs(zd - z) < abs(zu - z));
  let V = -normalize(P);
  var N = normalize(cross(dx, dy));
  if (dot(N, V) < 0.) { N = -N; }
  // 2.5 m around the point, but never under 8 px, so far tent blocks still get dark alleys and feet
  let ppm = g.res.y * .5 / (z * g.up.w);
  let rpx = clamp(2.5 * ppm, 8., 110.); let R = rpx / ppm;
  let fr = R * .62; let fmul = -1. / fr; let fadd = (R - fr) / fr + 1.;
  let nz = fract(ign(fc.xy) + g.jit.w * .618034); let nz2 = fract(ign(fc.xy + 71.) + g.jit.w * .754877);
  var vis = 0.;
  for (var sl = 0; sl < SLICES; sl++) {
    let phi = (f32(sl) + nz) / f32(SLICES) * 3.141593;
    let om = vec2f(cos(phi), -sin(phi));
    let dir = g.right.xyz * om.x - g.up.xyz * om.y;
    let od = dir - dot(dir, V) * V;
    let ax = normalize(cross(od, V));
    let pn = N - ax * dot(N, ax); let pl = length(pn);
    let cn = sat(dot(pn, V) / max(pl, 1e-4));
    let n = sign(dot(od, pn)) * fastAcos(cn);
    let lo0 = cos(n + 1.570796); let lo1 = cos(n - 1.570796);
    var h0 = lo0; var h1 = lo1;
    for (var st = 0; st < STEPS; st++) {
      var t = (f32(st) + nz2) / f32(STEPS); t = t * t;
      let o = om * max(t * rpx, 2. + f32(st));
      let a = vec2i(q + o); let b = vec2i(q - o);
      let da = posAt(vec2f(a) + .5, zAt(a)) - P; let db = posAt(vec2f(b) + .5, zAt(b)) - P;
      let la = max(length(da), 1e-4); let lb = max(length(db), 1e-4);
      h0 = max(h0, mix(lo0, dot(da / la, V), sat(la * fmul + fadd)));
      h1 = max(h1, mix(lo1, dot(db / lb, V), sat(lb * fmul + fadd)));
    }
    let a0 = n + clamp(-fastAcos(h1) - n, -1.570796, 1.570796);
    let a1 = n + clamp(fastAcos(h0) - n, -1.570796, 1.570796);
    vis += pl * ((cn + 2. * a0 * sin(n) - cos(2. * a0 - n)) + (cn + 2. * a1 * sin(n) - cos(2. * a1 - n))) * .25;
  }
  return vec4f(pow(sat(vis / f32(SLICES)), 1.6), z, 0., 0.);
}
`;
// depth-aware 5x5 blur of the half-res AO
const W_AOB = W_FS + /*wgsl*/`
@group(0) @binding(0) var tO: texture_2d<f32>;
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = vec2i(fc.xy); let mx = vec2i(textureDimensions(tO)) - 1;
  let c = textureLoad(tO, p, 0);
  var acc = 0.; var ws = 0.;
  for (var y = -2; y <= 2; y++) { for (var x = -2; x <= 2; x++) {
    let r = textureLoad(tO, clamp(p + vec2i(x, y), vec2i(0), mx), 0);
    let w = (1. - .1 * f32(x * x + y * y)) / (.02 + abs(r.y - c.y) / c.y);
    acc += r.x * w; ws += w;
  } }
  return vec4f(acc / ws, c.y, 0., 0.);
}
`;
// ---------------------------------------------------------------- temporal anti-aliasing (full res)
// AO is applied to the ambient share here; then the frame is blended with last frame's result, reprojected by
// depth, with the history clipped to the 3x3 neighbourhood's colour range so moving birds and canopies do not ghost.
const W_TAA = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sC: sampler;
@group(0) @binding(2) var tS: texture_2d<f32>;
@group(0) @binding(3) var tA: texture_2d<f32>;
@group(0) @binding(4) var tO: texture_2d<f32>;
@group(0) @binding(5) var tDp: texture_depth_multisampled_2d;
@group(0) @binding(6) var tH: texture_2d<f32>;
fn tm(c: vec3f) -> vec3f { return c / (1. + dot(c, LUMA)); }
fn itm(c: vec3f) -> vec3f { return c / max(1. - dot(c, LUMA), 1e-3); }
fn aoUp(p: vec2i, z: f32) -> f32 {
  let h = (vec2f(p) + .5) * .5 - .5; let b = floor(h); let f = h - b; let bi = vec2i(b);
  let mx = vec2i(textureDimensions(tO)) - 1;
  var acc = 0.; var ws = 0.;
  for (var k = 0; k < 4; k++) {
    let o = vec2i(k & 1, k >> 1);
    let r = textureLoad(tO, clamp(bi + o, vec2i(0), mx), 0);
    let w = (mix(1. - f.x, f.x, f32(o.x)) * mix(1. - f.y, f.y, f32(o.y)) + .01) / (.01 + abs(r.y - z) / z);
    acc += r.x * w; ws += w;
  }
  return acc / ws;
}
// 5-tap Catmull-Rom history fetch: sharper than bilinear, so the image does not soften as frames accumulate
fn hs5(uv: vec2f) -> vec3f {
  let sz = vec2f(textureDimensions(tH)); let p = uv * sz; let tc = floor(p - .5) + .5; let f = p - tc;
  let w0 = f * (-.5 + f * (1. - .5 * f)); let w1 = 1. + f * f * (-2.5 + 1.5 * f); let w2 = f * (.5 + f * (2. - 1.5 * f)); let w3 = f * f * (-.5 + .5 * f);
  let w12 = w1 + w2; let t0 = (tc - 1.) / sz; let t3 = (tc + 2.) / sz; let t12 = (tc + w2 / w12) / sz;
  let a = w12.x * w0.y; let b = w0.x * w12.y; let c = w12.x * w12.y; let d = w3.x * w12.y; let e = w12.x * w3.y;
  let r = textureSampleLevel(tH, sC, vec2f(t12.x, t0.y), 0.).rgb * a + textureSampleLevel(tH, sC, vec2f(t0.x, t12.y), 0.).rgb * b
    + textureSampleLevel(tH, sC, t12, 0.).rgb * c + textureSampleLevel(tH, sC, vec2f(t3.x, t12.y), 0.).rgb * d + textureSampleLevel(tH, sC, vec2f(t12.x, t3.y), 0.).rgb * e;
  return max(r / (a + b + c + d + e), vec3f(0.));
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let px = vec2i(fc.xy); let mx = vec2i(g.res.xy) - 1;
  var m1 = vec3f(0.); var m2 = vec3f(0.); var lo = vec3f(1e9); var hi = vec3f(-1e9); var cur = vec3f(0.);
  var zmin = 1e9; var dpn = 0.; var pn = px;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let q = clamp(px + vec2i(x, y), vec2i(0), mx);
    let dp = textureLoad(tDp, q, 0); let z = g.fwd.w / max(dp, 1e-7);
    let c = tm(textureLoad(tS, q, 0).rgb * (1. - (1. - aoUp(q, z)) * textureLoad(tA, q, 0).r));
    m1 += c; m2 += c * c; lo = min(lo, c); hi = max(hi, c);
    if (x == 0 && y == 0) { cur = c; }
    if (z < zmin) { zmin = z; dpn = dp; pn = q; }
  } }
  // reproject the nearest surface in the neighbourhood, so thin foreground edges do not trail
  let uv = (vec2f(pn) + .5) * g.res.zw; let nd = vec2f(uv.x * 2. - 1., 1. - uv.y * 2.) - g.jit.xy;
  let rv = g.fwd.xyz + g.right.xyz * (nd.x * g.right.w) + g.up.xyz * (nd.y * g.up.w);
  let pc = select(g.pvp * vec4f(g.cam.xyz + rv * zmin, 1.), g.pvp * vec4f(rv, 0.), dpn < 1e-7);
  let pu = vec2f(pc.x / pc.w * .5 + .5, .5 - pc.y / pc.w * .5) - uv + (vec2f(px) + .5) * g.res.zw;
  let mean = m1 / 9.; let sg = sqrt(max(m2 / 9. - mean * mean, vec3f(0.)));
  let blo = max(lo, mean - sg * 1.25); let bhi = min(hi, mean + sg * 1.25);
  let hist = clamp(tm(hs5(pu)), blo, bhi);
  let off = any(pu < vec2f(0.)) || any(pu > vec2f(1.)) || pc.w <= 0.;
  let a = select(max(g.jit.z, .1), 1., off);
  var o = itm(mix(hist, cur, a));
  if (any(o != o)) { o = itm(cur); }
  return vec4f(min(o, vec3f(60.)), 1.);
}
`;
