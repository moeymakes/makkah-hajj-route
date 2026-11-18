// ============================================================================
// world layout + procedural content generation (load time only)
// ============================================================================
// Axes: +x east, -z north, y up, metres. The route is composed along x, west to east: the Jamarat at the Makkah end
// of Mina, Mina's tent valley, the road and pedestrian way out to Muzdalifah's plain, then Arafat with the Namirah
// mosque on its western edge and Jabal al-Rahmah. Real distances (~15-20 km) are compressed to about 4 km.

// time of day: the key light (the moon at night), sky colours, exposure and how bright the lamps are
const TODS = [
  { az: 70, el: 6, sunc: [2.8, 1.62, 1.0], zen: [.13, .24, .54], horL: [1.45, .82, .52], horF: [.72, .66, .70], gnd: [.80, .68, .58], expo: .44, rays: 1, lights: .2 },
  { az: 252, el: 12, sunc: [2.9, 2.1, 1.35], zen: [.10, .24, .58], horL: [1.35, .84, .44], horF: [.74, .68, .66], gnd: [.86, .70, .52], expo: .45, rays: .6, lights: 1 },
  { az: 140, el: 35, sunc: [.11, .135, .2], zen: [.004, .008, .022], horL: [.05, .045, .05], horF: [.02, .025, .04], gnd: [.04, .036, .034], expo: 1.5, rays: 0, lights: 6 },
];
const TD = TODS[TOD], NIGHT = TOD === 2;
const SUN = (() => { const a = TD.az * PI / 180, e = TD.el * PI / 180; return [sin(a) * cos(e), sin(e), -cos(a) * cos(e)]; })();

// the valley's centre line wanders a little; everything along the route is placed relative to it
const czf = (x) => 60 * sin(x * .0011) + 25 * sin(x * .0031 + 1);
// near terrain grid: 5 m cells over the whole route
const NX = 840, NZ = 448, NC = 5, NOX = -1760, NOZ = -1120;
// the Jamarat: three pillars along x, floor levels every 12 m above the plaza (JH)
const JH = -18, JX = [-1660, -1500, -1340], JX0 = -1720, JX1 = -1280, JW = 40;
const NAMIRAH = [1060, -390], RAHMA = [1820, 300], MUZ = [260, 150], KHAYF = [-640, 290];
// viewpoints: x, eye height above the ground (absolute y when flying), z (relative to the valley line), look-at
// x, y (above the ground there), z (relative), flying
const POSES_R = [
  [-1080, 1.7, -540, -560, -35, 170, 0],
  [1222, 1.7, -530, 1060, 30, -430, 0],
  [1858, 1.7, 425, 1862, -10, 237, 0],
  [360, 1.7, 15, -400, 2, -110, 0],
  [-420, 1.7, 35, -1100, 6, 35, 0],
  [-1150, 170, -380, -1520, 0, 10, 1],
];
// 60 s scripted flight: over the tents, out along the road, over Muzdalifah, round Jabal al-Rahmah, then up and back
const FLY_R = [
  -1150, 45, -60, -700, 10, 0,
  -800, 40, 20, -300, 8, 0,
  -400, 32, -20, 100, 10, 0,
  0, 28, 0, 500, 12, 0,
  500, 30, -30, 1000, 15, -300,
  900, 40, -200, 1060, 20, -390,
  1300, 45, -150, 1820, 50, 300,
  1650, 55, 150, 1820, 40, 237,
  1850, 75, 420, 1820, 30, 237,
  1700, 110, 300, 900, -20, 0,
  1300, 200, 0, -1500, 0, 0,
];
const FLYR = 2600, FLYH = 420;
const POSES = [], FLY = new Float32Array(FLY_R.length);
function setupRoute(g) {
  for (const [x, y, zr, tx, ty, tzr, f] of POSES_R) { const z = czf(x) + zr, tz = czf(tx) + tzr; POSES.push([x, f ? y + g(x, z) : y + g(x, z), z, tx, ty + g(tx, tz), tz, f]); }
  for (let i = 0; i < FLY_R.length; i += 6) { const x = FLY_R[i], z = czf(x) + FLY_R[i + 2], tx = FLY_R[i + 3], tz = czf(tx) + FLY_R[i + 5]; FLY.set([x, FLY_R[i + 1] + g(x, z), z, tx, FLY_R[i + 4] + g(tx, tz), tz], i); }
}

// ---------------------------------------------------------------- far landscape: polar grid out to 12 km
const FN = 1024, FC = 24000 / (FN - 1), FO = -12000, FCX = 320;
function farSampler(FA) {
  return (x, z) => {
    const gx = clamp((x - FO) / FC, 0, FN - 1.001), gz = clamp((z - FO) / FC, 0, FN - 1.001), ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz;
    const i = (ix + FN * iz) * 4;
    return mix(mix(FA[i], FA[i + 4], fx), mix(FA[i + FN * 4], FA[i + FN * 4 + 4], fx), fz);
  };
}
const inNear = (x, z, m = 0) => x > NOX + m && x < NOX + (NX - 1) * NC - m && z > NOZ + m && z < NOZ + (NZ - 1) * NC - m;
function buildFar(fh) {
  const NR = 200, NS = 768, R0 = 900, R1 = 12000, nv = NR * NS;
  const vb = new ArrayBuffer(nv * 16), vf = new Float32Array(vb), v8 = new Int8Array(vb);
  const sx = SUN[0], sy = SUN[1], sz = SUN[2], sl = hypot(sx, sz), tn = sy / sl;
  for (let r = 0; r < NR; r++) {
    const rad = R0 * pow(R1 / R0, r / (NR - 1));
    for (let s = 0; s < NS; s++) {
      const a = (s + (r & 1) * .5) / NS * TAU, x = FCX + cos(a) * rad, z = sin(a) * rad, k = r * NS + s;
      let h = fh(x, z);
      // inside the near grid the far mesh sinks out of the way
      if (inNear(x, z, 12)) h -= 40;
      const e = max(FC * .7, rad * .004);
      let nx = fh(x - e, z) - fh(x + e, z), ny = 2 * e, nz = fh(x, z - e) - fh(x, z + e); const l = hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      let sh = 1;
      for (let t = 25; t < 3600; t *= 1.09) { const c = h + 2 + t * tn - fh(x + sx / sl * t, z + sz / sl * t); if (c < 0) { sh = 0; break; } sh = min(sh, c / (t * .045)); }
      vf[k * 4] = x; vf[k * 4 + 1] = h; vf[k * 4 + 2] = z;
      v8[k * 16 + 12] = round(nx * 127); v8[k * 16 + 13] = round(ny * 127); v8[k * 16 + 14] = round(nz * 127); v8[k * 16 + 15] = round(clamp(sh, 0, 1) * 127);
    }
  }
  const ib = [];
  for (let r = 0; r < NR - 1; r++) for (let s = 0; s < NS; s++) {
    const a = r * NS + s, b = r * NS + (s + 1) % NS, c = (r + 1) * NS + s, d = (r + 1) * NS + (s + 1) % NS;
    if (r & 1) ib.push(a, c, b, b, c, d); else ib.push(a, c, d, a, d, b);
  }
  return { vb, ib: new Uint32Array(ib), nv };
}
// the near terrain: a regular grid with normals and a baked sun visibility (soft heightfield shadow) per vertex;
// tex = rock, road, paving, sun visibility for the shaders
function buildNear(NA, fh) {
  const H = (i, j) => NA[(clamp(i, 0, NX - 1) + NX * clamp(j, 0, NZ - 1)) * 4];
  const g = (x, z) => {
    if (!inNear(x, z)) return fh(x, z);
    const gx = (x - NOX) / NC, gz = (z - NOZ) / NC, ix = min(gx | 0, NX - 2), iz = min(gz | 0, NZ - 2), fx = gx - ix, fz = gz - iz;
    return mix(mix(H(ix, iz), H(ix + 1, iz), fx), mix(H(ix, iz + 1), H(ix + 1, iz + 1), fx), fz);
  };
  const nv = NX * NZ, vb = new ArrayBuffer(nv * 16), vf = new Float32Array(vb), v8 = new Int8Array(vb), tex = new Uint8Array(nv * 4), nrm = new Uint8Array(nv * 4);
  const sx = SUN[0], sy = SUN[1], sz = SUN[2], sl = hypot(sx, sz), tn = sy / sl;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = i + NX * j, x = NOX + i * NC, z = NOZ + j * NC, h = H(i, j);
    let nx = H(i - 1, j) - H(i + 1, j), ny = 2 * NC, nz = H(i, j - 1) - H(i, j + 1); const l = hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    let sh = 1;
    for (let t = 6; t < 3000; t *= 1.12) { const c = h + .5 + t * tn - g(x + sx / sl * t, z + sz / sl * t); if (c < 0) { sh = 0; break; } sh = min(sh, c / (t * .05)); }
    vf[k * 4] = x; vf[k * 4 + 1] = h; vf[k * 4 + 2] = z; nrm[k * 4] = (nx * .5 + .5) * 255; nrm[k * 4 + 1] = (ny * .5 + .5) * 255; nrm[k * 4 + 2] = (nz * .5 + .5) * 255; nrm[k * 4 + 3] = 255;
    v8[k * 16 + 12] = round(nx * 127); v8[k * 16 + 13] = round(ny * 127); v8[k * 16 + 14] = round(nz * 127); v8[k * 16 + 15] = round(clamp(sh, 0, 1) * 127);
    tex[k * 4] = NA[k * 4 + 1] * 255; tex[k * 4 + 1] = NA[k * 4 + 2] * 255; tex[k * 4 + 2] = NA[k * 4 + 3] * 255; tex[k * 4 + 3] = clamp(sh, 0, 1) * 255;
  }
  const ib = new Uint32Array((NX - 1) * (NZ - 1) * 6); let n = 0;
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const a = i + NX * j, b = a + 1, c = a + NX, d = c + 1;
    ib[n++] = a; ib[n++] = c; ib[n++] = d; ib[n++] = a; ib[n++] = d; ib[n++] = b;
  }
  return { vb, ib, nv, tex, nrm, g };
}

// ---------------------------------------------------------------- mesh toolkit
const face = (m, pts, n, aux = 1) => {
  const a = pts[0], b = pts[1], c = pts[2];
  const cx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0, v = pts.map((p) => m.v(p[0], p[1], p[2], aux));
  if (flip) v.reverse();
  for (let i = 1; i < v.length - 1; i++) m.tri(v[0], v[i], v[i + 1]);
};
const box = (m, x0, y0, z0, x1, y1, z1, aux = 1) => {
  const P = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  face(m, [P(0), P(2), P(6), P(4)], [-1, 0, 0], aux); face(m, [P(1), P(3), P(7), P(5)], [1, 0, 0], aux);
  face(m, [P(0), P(1), P(5), P(4)], [0, -1, 0], aux); face(m, [P(2), P(3), P(7), P(6)], [0, 1, 0], aux);
  face(m, [P(0), P(1), P(3), P(2)], [0, 0, -1], aux); face(m, [P(4), P(5), P(7), P(6)], [0, 0, 1], aux);
};
function lathe(m, prof, seg, cx = 0, cy = 0, cz = 0, rot = PI / seg) {
  const rings = [];
  for (const [r, h, ao = 1] of prof) { const ring = []; for (let s = 0; s < seg; s++) { const a = s / seg * TAU + rot; ring.push(m.v(cx + cos(a) * r, cy + h, cz + sin(a) * r, ao)); } rings.push(ring); }
  for (let k = 0; k < rings.length - 1; k++) for (let s = 0; s < seg; s++) { const s2 = (s + 1) % seg; m.quad(rings[k][s], rings[k + 1][s], rings[k + 1][s2], rings[k][s2]); }
}
const domeProf = (r, drum, point = 1.12, n = 14) => {
  const p = [[r * 1.04, 0], [r * 1.04, drum], [r * 1.08, drum + .2], [r, drum + .35]];
  for (let i = 1; i <= n; i++) { const a = i / n * PI / 2; p.push([r * cos(a), drum + .35 + r * point * pow(sin(a), .92)]); }
  return p;
};
const pointed = (a0, a1, ys, rho, n = 8) => {
  const w = a1 - a0, R = rho * w, ta = Math.acos((R - w / 2) / R), L = [], Rr = [];
  for (let k = 0; k <= n; k++) { const t = k / n * ta; L.push([a0 + R - R * cos(t), ys + R * sin(t)]); Rr.push([a1 - R + R * cos(t), ys + R * sin(t)]); }
  return L.concat(Rr.reverse().slice(1));
};
function merlons(m, x0, z0, x1, z1, y, sp = 1.5, s = 1) {
  const L = hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
  for (let t = sp / 2; t < L; t += sp) {
    const cx = x0 + ux * t, cz = z0 + uz * t, d = .16 * s;
    const P = (u, v, w) => [cx + ux * u - uz * w, y + v, cz + uz * u + ux * w];
    const out = [[-.36 * s, 0], ...pointed(-.36 * s, .36 * s, .62 * s, .75, 4), [.36 * s, 0]];
    for (const w of [-d, d]) face(m, out.map(([u, v]) => P(u, v, w)), [-uz * w, 0, ux * w]);
    for (let k = 0; k < out.length; k++) {
      const p = out[k], q = out[(k + 1) % out.length], nu = q[1] - p[1], nv = -(q[0] - p[0]);
      face(m, [P(p[0], p[1], -d), P(q[0], q[1], -d), P(q[0], q[1], d), P(p[0], p[1], d)], [-ux * nu, -nv, -uz * nu]);
    }
  }
}
const MINARET_N = [[3.3, 22], [3.3, 34.6], [3.55, 34.8], [3.55, 35.5], [3.3, 35.7], [3.3, 48.4], [4.5, 50.4], [4.5, 52.2], [3, 52.5], [3, 59.2], [3.22, 59.4], [3.22, 60], [3, 60.2], [3, 66.6], [4.1, 68.4], [4.1, 70.2], [2.5, 70.5], [2.5, 74.4], [2.7, 74.6], [2.7, 75.1], [2.5, 75.3], [2.5, 78.8], [3.5, 80.4], [3.5, 81.9], [2.1, 82.2], [2.1, 86], [2.4, 86.2], [2.25, 87.8], [1.3, 89.8], [.3, 91.3], [0, 91.5]];
function meshMinaret(k) {
  const m = new Mesh(), base = 9 * k, baseH = 22 * k;
  box(m, -base * .6, -4, -base * .6, base * .6, 1.6, base * .6, .8);
  box(m, -base / 2, 1.6, -base / 2, base / 2, baseH, base / 2);
  box(m, -base / 2 - .25, baseH - 1.2, -base / 2 - .25, base / 2 + .25, baseH - .5, base / 2 + .25);
  lathe(m, MINARET_N.map(([r, h]) => [r * k, h * k]), 8);
  for (let i = 1; i < MINARET_N.length - 1; i++) if (MINARET_N[i][0] > MINARET_N[i - 1][0] + .6) {
    const r0 = MINARET_N[i - 1][0] * k, r1 = MINARET_N[i][0] * k * 1.03, y0 = MINARET_N[i - 1][1] * k, y1 = MINARET_N[i][1] * k, y2 = MINARET_N[i + 1][1] * k;
    lathe(m, [[r0 * 1.01, y0], [r0 + (r1 - r0) * .55, y0 + (y1 - y0) * .45], [r1, y1], [r1, y2], [r1 + .08, y2 + .04], [r1 + .08, y2 + .2], [r1 - .18, y2 + .2], [r1 - .18, y1 + .3]], 24);
  }
  return m;
}
// alem: a short pole with stacked spheres and an upturned crescent on top (checked in silhouette: no cross)
function meshFinial(s) {
  const m = new Mesh(), ball = (y, r) => { const p = []; for (let i = 0; i <= 8; i++) { const a = -PI / 2 + i / 8 * PI; p.push([cos(a) * r, y + r + sin(a) * r]); } return p; };
  lathe(m, [[.15 * s, 0], [.15 * s, .9 * s], [.1 * s, .9 * s]], 10);
  lathe(m, ball(.9 * s, .34 * s), 12); lathe(m, ball(1.55 * s, .24 * s), 12);
  lathe(m, [[.07 * s, 2 * s], [.07 * s, 2.35 * s], [0, 2.36 * s]], 8);
  const R = .55 * s, cy = 2.3 * s + R * .95, pts = [];
  for (let k = 0; k <= 16; k++) { const a = (200 + k / 16 * 140) * PI / 180; pts.push([cos(a) * R, cy + sin(a) * R, 0]); }
  m.tube(pts, (k) => .015 * s + .1 * s * sin(PI * k / 16), 6, false, () => 1);
  return m;
}
// a Mina tent: low walls under a peaked pyramid roof with a little overhang (w x d metres)
function meshTent(w, d) {
  const m = new Mesh(), hw = w / 2, hd = d / 2;
  box(m, -hw, -.6, -hd, hw, 2.4, hd, .85);
  const o = .25, eave = [[-hw - o, 2.25, -hd - o], [hw + o, 2.25, -hd - o], [hw + o, 2.25, hd + o], [-hw - o, 2.25, hd + o]];
  const hip = w > d + 1, r0 = hip ? [-(w - d) / 2, 5.1, 0] : [0, 5.3, 0], r1 = hip ? [(w - d) / 2, 5.1, 0] : r0;
  face(m, hip ? [eave[0], eave[1], r1, r0] : [eave[0], eave[1], r0], [0, .6, -1]);
  face(m, hip ? [eave[2], eave[3], r0, r1] : [eave[2], eave[3], r0], [0, .6, 1]);
  face(m, [eave[1], eave[2], r1], [1, .6, 0]); face(m, [eave[3], eave[0], r0], [-1, .6, 0]);
  lathe(m, [[.06, 5.1], [.06, 5.6], [0, 5.65]], 6, r0[0], 0, 0);
  return m;
}
function meshBird() {
  const m = new Mesh(), X = [.17, .1, 0, -.12, -.2], Hh = [.01, .045, .055, .04, .012];
  const rings = [];
  for (let i = 0; i < 5; i++) { const r = []; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; r.push(m.v(sin(a) * Hh[i] * .9, cos(a) * Hh[i], X[i], 0)); } rings.push(r); }
  for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) { const k2 = (k + 1) % 6; m.quad(rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2]); }
  for (const sx of [-1, 1]) {
    const a = m.v(sx * .03, .02, .06, 0), b = m.v(sx * .03, .02, -.06, 0), c = m.v(sx * .36, .03, -.02, sx), d = m.v(sx * .3, .03, -.12, sx);
    m.quad(a, c, d, b);
  }
  const t0 = m.v(0, .01, -.18, 0), t1 = m.v(.07, .01, -.3, 0), t2 = m.v(-.07, .01, -.3, 0); m.tri(t0, t1, t2);
  return m;
}

// ---------------------------------------------------------------- materials (W_SOLID fs)
// 1 far ground · 2 near ground · 7 plain stone (mosques, arcades painted on) · 10 gold · 20 minaret stone ·
// 22 lamp glass · 27 granite / concrete (w 1 Jamarat concrete, w 2 boulders) · 36 white plaster (the pillar) ·
// 37 domes · 41 tent fabric (w: the camp's tone) · 42 neem foliage · 43 bark · 44 steel / poles · 45 canopy fabric ·
// 46 camp fence panels · 47 camp service blocks
function makeWorld(FAR, NEAR, flyPts) {
  const meshes = [], solids = [];
  const add = (m) => { meshes.push(m); return meshes.length - 1; };
  const solid = (mesh, x, y, z, sc, q, mat, seed, far = 0, ex = 0) => (solids[mesh] ||= []).push(x, y, z, sc, q[0], q[1], q[2], q[3], mat, seed, far, ex);
  const Q0 = [0, 0, 0, 1], yawQ = (a) => qAxis(0, 1, 0, a);
  const fh = farSampler(FAR.A);
  const gy = NEAR.g;
  const NB = NEAR.B, nb = (x, z, c) => { const i = clamp(round((x - NOX) / NC), 0, NX - 1), j = clamp(round((z - NOZ) / NC), 0, NZ - 1); return NB[(i + NX * j) * 4 + c]; };
  const na = (x, z, c) => { const i = clamp(round((x - NOX) / NC), 0, NX - 1), j = clamp(round((z - NOZ) / NC), 0, NZ - 1); return NEAR.A[(i + NX * j) * 4 + c]; };
  const slope = (x, z, r) => max(abs(gy(x + r, z) - gy(x - r, z)), abs(gy(x, z + r) - gy(x, z - r)));
  const CB = [], CC = [];
  const cbox = (x0, x1, y0, y1, z0, z1) => CB.push(x0, x1, y0, y1, z0, z1);
  // tents block walking: an occupancy grid at 2 m
  const OCC = new Uint8Array(((NX - 1) * NC / 2 | 0) * ((NZ - 1) * NC / 2 | 0)), OW = (NX - 1) * NC / 2 | 0;
  const occ = (x0, x1, z0, z1) => { for (let z = z0; z < z1; z += 2) for (let x = x0; x < x1; x += 2) { const i = ((x - NOX) / 2) | 0, j = ((z - NOZ) / 2) | 0; if (i >= 0 && j >= 0 && i < OW) OCC[i + OW * j] = 1; } };

  // --- tents: Mina's valley floor in blocks with alleys, and patches on Arafat
  rseed(3);
  const tentM = [meshTent(8, 8), meshTent(12, 8), meshTent(6, 8)].map(add);
  // camps: each block of cells is one camp with its own tent size, facing, tone (instance w) and fill; a fence runs
  // round it, one cell holds a flat-roofed service block, and every tent has its air-conditioning unit beside it
  const fence = new Mesh(), svc = new Mesh(), acM = new Mesh();
  box(acM, -.55, 0, -.4, .55, .95, .4, .8); box(acM, -.42, .95, -.32, .42, 1.05, .32);
  const acId = add(acM), camps = new Map();
  for (let x = -1230; x < -300; x += 9.6) {
    const cz = czf(x);
    for (let z = cz - 470; z < cz + 470; z += 9.6) {
      const bi = round((x + 1230) / 9.6), bj = round((z - cz + 470) / 9.6);
      if (bi % 6 === 5 || bj % 7 === 6) continue;
      const ci = floor(bi / 6), cj = floor(bj / 7), ch = ihash(ci, cj, 3), ck = (ci * 64 + cj) * 3 + (z - cz < -75 ? 0 : z - cz < 35 ? 1 : 2);
      const tx = x + rr(-.15, .15), tz = z + rr(-.15, .15);
      if (nb(tx, tz, 0) < .5 || slope(tx, tz, 5) > 2 || rnd() < .03) continue;
      if (hypot(tx - KHAYF[0], tz - KHAYF[1]) < 90) continue;
      const c = camps.get(ck) || camps.set(ck, [1e9, -1e9, 1e9, -1e9, 0]).get(ck);
      c[0] = min(c[0], tx); c[1] = max(c[1], tx); c[2] = min(c[2], tz); c[3] = max(c[3], tz);
      const y = min(gy(tx - 3.5, tz - 3.5), gy(tx + 3.5, tz + 3.5), gy(tx - 3.5, tz + 3.5), gy(tx + 3.5, tz - 3.5));
      if (bi % 6 === 2 && bj % 7 === 3 && ch > .25) { box(svc, tx - 4.4, y - .5, tz - 4.4, tx + 4.4, y + 3.4, tz + 4.4); cbox(tx - 4.4, tx + 4.4, y - 1, y + 3.4, tz - 4.4, tz + 4.4); continue; }
      const narrow = ch < .3, turn = narrow && ihash(ci, cj, 7) < .5;
      solid(tentM[narrow ? 2 : 0], tx, y + .05, tz, rr(.97, 1.03), yawQ((turn ? PI / 2 : 0) + rr(-.015, .015)), 41, rnd(), 0, ch);
      const s = rnd() < .5 ? 1 : -1, ax = turn ? tx + s * 3.9 : tx + rr(-2, 2), az = turn ? tz + rr(-2, 2) : tz + s * (narrow ? 3.9 : 4.6);
      if (rnd() < .85) solid(acId, ax, gy(ax, az), az, rr(.9, 1.1), yawQ(turn ? PI / 2 : 0), 44, rnd(), 260, 1);
      occ(tx - 4.3, tx + 4.3, tz - 4.3, tz + 4.3);
    }
  }
  // camp fences: 1.8 m metal panels round each camp, a gap for the gate on the alley side
  for (const [, c] of camps) {
    const x0 = c[0] - 4.9, x1 = c[1] + 4.9, z0 = c[2] - 4.9, z1 = c[3] + 4.9, gx = (x0 + x1) / 2;
    for (const [a0, a1, zz] of [[x0, gx - 3, z0], [gx + 3, x1, z0], [x0, x1, z1]]) box(fence, a0, gy(a0, zz) - .6, zz - .06, a1, gy(a1, zz) + 1.8, zz + .06, .85);
    for (const xx of [x0, x1]) box(fence, xx - .06, gy(xx, z0) - .6, z0, xx + .06, gy(xx, z1) + 1.8, z1, .85);
  }
  solid(add(fence), 0, 0, 0, 1, Q0, 46, 0); solid(add(svc), 0, 0, 0, 1, Q0, 47, 0);
  for (let x = 1000; x < 2260; x += 13.6) for (let z = -900; z < 900; z += 9.6) {
    const cz = czf(x), tx = x + rr(-.2, .2), tz = cz + z;
    const bi = round((x - 1000) / 13.6), bj = round((z + 900) / 9.6);
    if (bi % 5 === 4 || bj % 6 === 5) continue;
    if (nb(tx, tz, 0) < .5 || slope(tx, tz, 6) > 2) continue;
    solid(tentM[1], tx, gy(tx, tz), tz, 1, Q0, 41, rnd(), 0, 1);
    occ(tx - 6.3, tx + 6.3, tz - 4.3, tz + 4.3);
  }

  // --- the Jamarat: floor slabs on columns, parapets, ramps, three pillars rising through every level, canopies
  {
    const jz = czf(-1500), slab = new Mesh(), col = new Mesh(), pil = new Mesh(), canopy = new Mesh(), rail = new Mesh();
    for (const y of [12, 24, 36, 48]) {
      box(slab, JX0, JH + y - 1.3, jz - JW, JX1, JH + y, jz + JW, .8);
      for (const s of [-1, 1]) box(rail, JX0, JH + y, jz + s * JW - .15, JX1, JH + y + 1.15, jz + s * JW + .15);
      cbox(JX0, JX1, JH + y - 1.3, JH + y + 1.2, jz - JW, jz + JW);
    }
    for (let x = JX0 + 10; x < JX1; x += 20) for (const z of [-30, -10, 10, 30]) {
      if (JX.some((px) => abs(px - x) < 16) && abs(z) < 15) continue;
      lathe(col, [[1.1, -2], [1.1, 47.2], [1.5, 47.8]], 12, x, JH, jz + z);
      CC.push(x, jz + z, 1.2, JH + 48);
    }
    // the pillars: stadium-shaped stone walls 26 m long, each in an oval basin on every level
    for (const px of JX) {
      const P = []; for (let k = 0; k <= 24; k++) { const a = k / 24 * TAU, c = cos(a), s = sin(a); P.push([px + (c > 0 ? 11.5 : -11.5) + c * 1.6, jz + s * 1.6]); }
      for (let k = 0; k < 24; k++) { const a = P[k], b = P[k + 1]; face(pil, [[a[0], JH - 1, a[1]], [b[0], JH - 1, b[1]], [b[0], JH + 58, b[1]], [a[0], JH + 58, a[1]]], [(a[0] + b[0]) / 2 - px, 0, (a[1] + b[1]) / 2 - jz]); }
      face(pil, P.slice(0, 24).map(([x, z]) => [x, JH + 58, z]), [0, 1, 0]);
      cbox(px - 13.2, px + 13.2, JH - 2, JH + 53, jz - 1.7, jz + 1.7);
      for (const y of [0, 12, 24, 36, 48]) {
        const B = []; for (let k = 0; k <= 32; k++) { const a = k / 32 * TAU; B.push([px + cos(a) * 21, JH + y + .55, jz + sin(a) * 7.5]); }
        rail.sweep(B, .4, 1.1, null, false);
      }
    }
    // ramps from the plaza up to the first two levels at both ends
    for (const [x0, dir, y1, zo] of [[JX0, -1, 12, -25], [JX0, -1, 24, 25], [JX1, 1, 12, 25], [JX1, 1, 24, -25]]) {
      const L = y1 * 3.6, x1 = x0 + dir * L;
      const pts = [[x0, JH + y1 - .65, jz + zo], [x1, JH - .65 + .3, jz + zo]];
      slab.sweep(pts, 12, 1.3, null, true);
      for (const s of [-1, 1]) rail.sweep(pts.map(([x, y, z]) => [x, y + 1.2, z + s * 6]), .3, 1.1, null, false);
      for (let t = .2; t < 1; t += .2) lathe(col, [[.9, 0], [.9, (y1 - .65) * (1 - t)]], 10, mix(x0, x1, t), JH - 1, jz + zo);
    }
    // white tensile canopies on the top level

    solid(add(slab), 0, 0, 0, 1, Q0, 27, .1, 0, 1); solid(add(col), 0, 0, 0, 1, Q0, 27, .3, 0, 1);
    solid(add(rail), 0, 0, 0, 1, Q0, 44, 0); solid(add(pil), 0, 0, 0, 1, Q0, 27, .6, 0, 3);
  }

  // --- mosques: a stone hall with arcades painted on, domes, minarets with crescent finials
  const finId = add(meshFinial(1));
  const minIds = new Map();
  const mosque = (cx, cz, w, d, h, mins, k, domes) => {
    const y0 = gy(cx, cz), body = new Mesh(), dm = new Mesh();
    // built round its own origin so the facade pattern is measured from the ground
    box(body, -w / 2, -6, -d / 2, w / 2, h, d / 2); box(body, -w / 2 - 6, -6, -d / 2 - 6, w / 2 + 6, .5, d / 2 + 6, .9); box(body, -w / 2 - 3, .5, -d / 2 - 3, w / 2 + 3, 1, d / 2 + 3, .9);
    merlons(body, -w / 2, -d / 2, w / 2, -d / 2, h, 1.8, 1.1); merlons(body, -w / 2, d / 2, w / 2, d / 2, h, 1.8, 1.1);
    merlons(body, -w / 2, -d / 2, -w / 2, d / 2, h, 1.8, 1.1); merlons(body, w / 2, -d / 2, w / 2, d / 2, h, 1.8, 1.1);
    for (const [dx, r] of domes) { lathe(dm, [[r * 1.15, 0], [r * 1.15, 3]], 24, cx + dx, y0 + h, cz); lathe(dm, domeProf(r, 1, 1.08), 28, cx + dx, y0 + h + 3, cz); solid(finId, cx + dx, y0 + h + 3 + 1.35 + r * 1.08 - .3, cz, r * .14, Q0, 10, 0); }
    solid(add(body), cx, y0, cz, 1, Q0, 7, rnd(), 0, 1); if (domes.length) solid(add(dm), 0, 0, 0, 1, Q0, 37, 0);
    if (!minIds.has(k)) minIds.set(k, add(meshMinaret(k)));
    for (const [mx, mz] of mins) {
      const x = cx + mx * (w / 2 + 2), z = cz + mz * (d / 2 + 2), y = gy(x, z);
      solid(minIds.get(k), x, y, z, 1, yawQ(PI / 8), 20, rnd(), 0, k);
      solid(finId, x, y + 91.3 * k, z, 1.6 * k, Q0, 10, 0);
      CC.push(x, z, 5 * k + 1, y + 92 * k);
    }
    cbox(cx - w / 2, cx + w / 2, -100, y0 + h + 2, cz - d / 2, cz + d / 2);
  };
  // Namirah: six 60 m minarets, three domes; al-Khayf in Mina: four; al-Mash'ar al-Haram in Muzdalifah: two
  mosque(NAMIRAH[0], NAMIRAH[1], 200, 120, 20, [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]], .66, [[-55, 13], [0, 17], [55, 13]]);
  mosque(KHAYF[0], KHAYF[1], 110, 70, 15, [[-1, -1], [1, -1], [-1, 1], [1, 1]], .5, [[0, 10]]);
  mosque(MUZ[0], MUZ[1], 90, 55, 14, [[-1, -1], [1, -1]], .45, []);

  // --- Jabal al-Rahmah: granite boulders over the knoll, a pale stair, the white pillar on a stepped base at the top
  {
    rseed(7);
    const rk = (sx, sy, sz, f, sub = 0) => icosphere(sub, (x, y, z) => { const r = .8 + .4 * fbm(x * f + sx, y * f, z * f, 2); return [x * r * sx, y * r * sy, z * r * sz]; });
    const rids = [rk(1.3, .7, 1, 2.1, 1), rk(1, .9, .8, 3.3), rk(1.6, .55, 1.1, 1.7)].map(add), rid = rids[0];
    for (let i = 0; i < 1500; i++) {
      const a = rnd() * TAU, d = sqrt(rnd()) * 132, x = RAHMA[0] + cos(a) * d, z = RAHMA[1] + sin(a) * d;
      if (abs(z - RAHMA[1] - (x - RAHMA[0]) * .04) < 3 && x > RAHMA[0]) continue;
      const s = rr(.7, 4.8) * (1.25 - d / 170) * (rnd() < .08 ? 1.6 : 1);
      solid(rids[i % 3], x, gy(x, z) - s * .25, z, s, qRand(), 27, rnd(), 0, 2);
      if (s > 1.4) CC.push(x, z, s * .8, gy(x, z) + s);
    }
    // boulders on the mountain slopes round Mina and along the valley sides
    for (let i = 0; i < 5000; i++) {
      const x = rr(-1500, 2200), side = rnd() < .5 ? -1 : 1, z = czf(x) + side * rr(300, 1000);
      if (na(x, z, 1) < .4 || rnd() > .3 + .7 * sstep(500, 100, hypot(x + 760, z - czf(-760) + 560))) continue;
      const s = rr(.6, 3.5);
      solid(rids[i % 3], x, gy(x, z) - s * .3, z, s, qRand(), 27, rnd(), 900, 2);
    }
    // scattered granite and a few low shrubs on the plain at the foot of Jabal al-Rahmah
    { const cx = 1858, cz = czf(1858) + 400;
      for (let i = 0; i < 160; i++) { const x = cx + rr(-90, 70), z = cz + rr(-150, -10); if (hypot(x - cx, z - cz - 25) < 14) continue; const s = rr(.15, 1.4) * (rnd() < .15 ? 2 : 1); solid(rids[i % 3], x, gy(x, z) - s * .3, z, s, qRand(), 27, rnd(), 400, 2); } }
    // pebbles on Muzdalifah's plain round the viewpoint and along the walkway
    for (let i = 0; i < 9000; i++) {
      const x = rr(-60, 420), z = czf(x) + rr(-160, 60);
      if (rnd() > .35 + .65 * sstep(140, 20, abs(x - 320))) continue;
      const s = rr(.04, .16) * (rnd() < .1 ? 2.2 : 1);
      solid(rid, x, gy(x, z) - s * .3, z, s, qRand(), 27, rnd(), 60, 2);
    }
    const top = gy(RAHMA[0], RAHMA[1]), pl = new Mesh(), pw = new Mesh();
    box(pl, RAHMA[0] - 4, top - .8, RAHMA[1] - 4, RAHMA[0] + 4, top + .2, RAHMA[1] + 4); box(pl, RAHMA[0] - 2.6, top + .2, RAHMA[1] - 2.6, RAHMA[0] + 2.6, top + .55, RAHMA[1] + 2.6);
    box(pl, RAHMA[0] - 1.6, top + .55, RAHMA[1] - 1.6, RAHMA[0] + 1.6, top + .9, RAHMA[1] + 1.6);
    box(pl, RAHMA[0] - 1.25, top + .5, RAHMA[1] - 1.25, RAHMA[0] + 1.25, top + 1.1, RAHMA[1] + 1.25);
    box(pl, RAHMA[0] - 1.1, top + .9, RAHMA[1] - 1.1, RAHMA[0] + 1.1, top + 12.4, RAHMA[1] + 1.1);
    box(pl, RAHMA[0] - .85, top + 12.4, RAHMA[1] - .85, RAHMA[0] + .85, top + 12.8, RAHMA[1] + .85);
    solid(add(pl), 0, 0, 0, 1, Q0, 36, 0);
    CC.push(RAHMA[0], RAHMA[1], 2.2, top + 13);
  }

  // --- neem trees on Arafat: a trunk and a lumpy rounded canopy
  {
    rseed(9);
    const tr = new Mesh(); tr.tube([[0, -.3, 0], [.1, 1.6, .05], [.05, 2.8, -.1]], (k) => .22 - .05 * k, 6, false, (k) => .6 + .2 * k);
    const cn = icosphere(2, (x, y, z) => { const r = 1 + .22 * fbm(x * 2.5 + 3, y * 2.5, z * 2.5, 3); return [x * r * 2.6, 3.6 + y * r * 1.9, z * r * 2.6]; });
    const tid = add(tr), cid = add(cn);
    const groves = [];
    for (let i = 0; i < 4000 && groves.length < 60; i++) { const x = rr(900, 2300), z = czf(x) + rr(-1100, 1100); if (nb(x, z, 1) > .5) groves.push([x, z, rr(15, 40)]); }
    for (let i = 0; i < 26000 && (solids[tid] || []).length < 1100 * 12; i++) {
      const gv = groves[i % groves.length], a = rnd() * TAU, d = sqrt(rnd()) * gv[2], x = gv[0] + cos(a) * d, z = gv[1] + sin(a) * d;
      if (nb(x, z, 1) < .5 || slope(x, z, 3) > 2) continue;
      const s = rr(.75, 1.25), y = gy(x, z), q = yawQ(rnd() * TAU);
      solid(tid, x, y, z, s, q, 43, rnd(), 0, 0); solid(cid, x, y, z, s, q, 42, rnd(), 0, 0);
      CC.push(x, z, .5 * s, y + 4);
    }
  }

  // --- along the route: a highway with lamp posts, a covered pedestrian way, the elevated rail line
  {
    const post = new Mesh(), lampG = new Mesh(), canopy = new Mesh(), pier = new Mesh(), deck = new Mesh(), tower = new Mesh(), towerL = new Mesh();
    lathe(post, [[.18, -.5], [.15, 11], [.1, 12]], 6); box(post, -.08, 11.4, -1.6, .08, 11.6, 1.6);
    for (const s of [-1, 1]) box(lampG, -.25, 11.1, s * 1.6 - .35, .25, 11.4, s * 1.6 + .35);
    const postId = add(post), lampId = add(lampG);
    for (let x = -1300; x < 2250; x += 42) { const z = czf(x) - 75, y = gy(x, z); solid(postId, x, y, z, 1, Q0, 44, 0); solid(lampId, x, y, z, 1, Q0, 22, rnd()); CC.push(x, z, .4, y + 12); }
    // the pedestrian way: a module every 14 m, two posts and a shallow white roof
    for (const z of [-5.2, 5.2]) lathe(canopy, [[.3, -.4], [.3, .25], [.17, .4], [.15, 4.9], [.24, 5.05]], 8, 0, 0, z);
    box(canopy, -.22, 5.05, -6.4, .22, 5.42, 6.4);
    const canId = add(canopy), vault = new Mesh(), ys = [];
    for (let x = -1150; x < 980; x += 14) { const z = czf(x) + 35, y = gy(x, z); if (na(x, z, 3) < .3) continue; solid(canId, x, y, z, 1, Q0, 44, rnd(), 0, 1); CC.push(x, z - 5.2, .3, y + 6); CC.push(x, z + 5.2, .3, y + 6); ys.push([x, y, z]); }
    // the roof rides a smoothed line over the posts, as three strips stepping up to the centre
    // the roof: one continuous membrane resting on the cross beams, a ridge beam down the middle
    vault.sweep(ys.map(([x, y, z]) => [x, y + 5.55, z]), 13, .26, null, true);
    vault.sweep(ys.map(([x, y, z]) => [x, y + 5.3, z]), .45, .3, null, true);
    solid(add(vault), 0, 0, 0, 1, Q0, 45, .5, 0, 1);
    // the rail viaduct: piers every 30 m under a deck that rides 14 m over the smoothed ground
    box(pier, -1.2, -24, -2, 1.2, -1, 2, .8); box(pier, -1.6, -1.6, -2.6, 1.6, -1, 2.6, .8); box(deck, -15.2, -1.1, -5, 15.2, 0, 5); box(deck, -15.2, 0, -5, 15.2, 1.1, -4.7); box(deck, -15.2, 0, 4.7, 15.2, 1.1, 5);
    const pierId = add(pier), deckId = add(deck);
    for (let x = -1230; x < 2150; x += 30) {
      const z = czf(x) - 160, gyS = (gy(x - 30, z) + gy(x, z) * 2 + gy(x + 30, z)) / 4, y = max(gyS, gy(x, z)) + 14;
      const zn = czf(x + 30) - 160, yn = max((gy(x, zn) + gy(x + 30, zn) * 2 + gy(x + 60, zn)) / 4, gy(x + 30, zn)) + 14;
      const q = qMul(yawQ(-atan2(zn - z, 30)), qAxis(0, 0, 1, atan2(yn - y, 30)));
      solid(pierId, x, y, z, 1, Q0, 27, rnd(), 0, 1);
      solid(deckId, x + 15, (y + yn) / 2, (z + zn) / 2, 1, q, 27, rnd(), 0, 1);
      CC.push(x, z, 1.6, y);
    }
    // the rail line's station at its Mina end
    { const st = new Mesh(), x = -1260, z = czf(x) - 160, y = gy(x, z); box(st, x - 45, y - 3, z - 9, x + 15, y + 18, z + 9); box(st, x - 48, y + 18, z - 11, x + 18, y + 19.2, z + 11); solid(add(st), 0, 0, 0, 1, Q0, 7, .7, 0, 1); cbox(x - 45, x + 15, -200, y + 19, z - 9, z + 9); }
    // Muzdalifah: tall light towers over the open plain
    lathe(tower, [[.5, -1], [.45, 6], [.3, 30], [.2, 32]], 8); box(tower, -2.4, 30.5, -2.4, 2.4, 31, 2.4);
    for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) box(towerL, dx - .6, 31, dz - .6, dx + .6, 32, dz + .6);
    const towId = add(tower), towLId = add(towerL);
    for (let x = -260; x < 760; x += 110) for (let z = -600; z <= 600; z += 110) {
      const tx = x + 30 * sin(z * .01), tz = czf(tx) + z;
      if (nb(tx, tz, 0) > .3 || na(tx, tz, 2) > .3) continue;
      if (slope(tx, tz, 6) > 3 || hypot(tx - MUZ[0], tz - MUZ[1]) < 90 || abs(tz - czf(tx) + 160) < 14) continue;
      const y = gy(tx, tz); solid(towId, tx, y, tz, 1, Q0, 44, 0); solid(towLId, tx, y, tz, 1, Q0, 22, rnd()); CC.push(tx, tz, .6, y + 32);
    }
  }

  // --- life: a few birds wheeling over the valley and the plain
  rseed(13);
  const birds = [];
  for (const f of [[-800, 60, 0, 40, 20, 1], [-300, 50, 60, 30, 14, -1], [600, 70, -100, 50, 18, 1], [1700, 90, 200, 60, 16, -1]]) {
    const ss_ = rnd(); f[1] += gy(f[0], f[2]);
    for (let i = 0; i < f[4]; i++) birds.push(f[0], f[1], f[2], f[3], ss_ + rnd() * .2, f[5] * rr(.9, 1.1) * 7 / f[3], rr(1.4, 1.8), rnd());
  }
  const motes = new Float32Array(4000 * 4);
  for (let i = 0; i < motes.length; i++) motes[i] = rnd();

  // --- packing
  const fmap = new Uint8Array(FN * FN * 4);
  for (let k = 0; k < FN * FN; k++) { fmap[k * 4] = FAR.A[k * 4 + 1] * 255; fmap[k * 4 + 1] = FAR.A[k * 4 + 2] * 255; fmap[k * 4 + 2] = FAR.B[k * 4] * 255; fmap[k * 4 + 3] = FAR.B[k * 4 + 1] * 255; }
  const sol = { data: [], ranges: [] }; let si = 0;
  for (let m = 0; m < meshes.length; m++) { const a = solids[m] || []; sol.ranges.push([si, a.length / 12]); si += a.length / 12; for (let i = 0; i < a.length; i++) sol.data.push(a[i]); }
  for (const p of flyPts) {
    if (p[1] < gy(p[0], p[2]) + 3) { console.warn(`fly path at ${p.map((v) => v.toFixed(1))} is underground`); break; }
  }
  return { fh, gy, meshes, solids: { data: new Float32Array(sol.data), ranges: sol.ranges }, birds: new Float32Array(birds), motes, fmap,
    CB: new Float64Array(CB), CC: new Float64Array(CC), OCC, OW, farIds: new Set() };
}
const fract = (x) => x - floor(x);
