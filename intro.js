// Opening sequence: an original katana, modelled in code, drawn from its scabbard by scroll.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const V2 = pts => pts.map(([x, y]) => new THREE.Vector2(x, y));
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

/* ---------------------------------------------------------------------
   Katana dimensions (metres). The blade runs along +x from the habaki.
   --------------------------------------------------------------------- */
const BL = .72, SORI = .019, TSUKA = .27;
// the blade is a true circular arc, tangent to the grip at the guard. Blade and scabbard share it,
// so drawing the sword is a rotation about the arc's centre and the blade never leaves the scabbard's line.
const R_ARC = BL * BL / (2 * SORI);
const arcY = x => R_ARC - Math.sqrt(R_ARC * R_ARC - x * x);

// blade: a shinogi-zukuri section swept along the curve, each face its own strip for crisp ridge lines
function bladeGeometry() {
  const N = 160, pos = [], uv = [], idx = [];
  // section corners, from the back ridge around to the edge and back: [height from back, half-thickness]
  const ring = s => {
    const w = mix(.031, .0215, s), t = mix(.0072, .0048, s), tip = sstep(.9, 1, s);
    const kis = Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, s - .9) / .1, 2)));   // fukura: the edge curves up into the point
    const ww = w * (s > .9 ? kis : 1), tt = t * (s > .9 ? Math.max(.25, kis) : 1);
    const shin = ww * mix(.27, .5, tip);                                                // shinogi line height from the back
    return [[0, 0], [.0028 * (1 - tip), tt * .42], [shin, tt * .5], [ww, 0], [shin, -tt * .5], [.0028 * (1 - tip), -tt * .42]];
  };
  const faces = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]];
  for (const [fa, fb] of faces) {
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const s = i / N, r = ring(s), x = s * BL, yb = arcY(x) + .0155;               // back of the blade sits at yb
      for (const c of [fa, fb]) {
        const [h, z] = r[c];
        pos.push(x, yb - h, z);
        uv.push(s, 1 - h / .031);
      }
    }
    for (let i = 0; i < N; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make the faces wind outward on both sides
  const n = g.attributes.normal, p = g.attributes.position;
  for (let i = 0; i < n.count; i++) if (Math.sign(n.getZ(i)) !== Math.sign(p.getZ(i)) && Math.abs(p.getZ(i)) > 1e-5) { g.index.array.reverse(); g.computeVertexNormals(); break; }
  return g;
}

/* ---------------------------------------------------------------------
   Procedural surface maps (generated once at load, pixel by pixel)
   --------------------------------------------------------------------- */
// smooth value noise + fbm, for grain, patina and lacquer
function noise2(seed) {
  const R = rng(seed), N = 256, p = Float32Array.from({ length: N * N }, R);
  const at = (i, j) => p[((j & 255) << 8) | (i & 255)];
  const n = (x, y) => {
    const i = Math.floor(x), j = Math.floor(y); let u = x - i, v = y - j; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
    return mix(mix(at(i, j), at(i + 1, j), u), mix(at(i, j + 1), at(i + 1, j + 1), u), v);
  };
  return (x, y, oct = 4) => { let s = 0, a = .5, f = 1; for (let o = 0; o < oct; o++) { s += a * n(x * f, y * f); a *= .5; f *= 2.03; } return s / (1 - Math.pow(.5, oct)); };
}
// paints a texture one pixel at a time: fn(u, v) → [r, g, b] in 0–255
function pixelTex(w, h, fn, srgb = true) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4, [r, gg, b] = fn(x / w, y / h, x, y); d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// tangent-space normal map from a height function, by central differences
function normalTex(w, h, height, k) {
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = height(x / w, y / h);
  const at = (x, y) => H[((y + h) % h) * w + ((x + w) % w)];
  return pixelTex(w, h, (u, v, x, y) => {
    const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k, l = Math.hypot(dx, dy, 1);
    return [(-dx / l * .5 + .5) * 255, (dy / l * .5 + .5) * 255, (1 / l * .5 + .5) * 255];
  }, false);
}

// blade surface: burnished ridge face, polished ji with wood-grain hada, misty hamon with nie and ashi, bright edge
function bladeMaps() {
  const W = 2048, Hh = 128, nz = noise2(7), R = rng(8);
  const line = s => .3 + .055 * Math.sin(s * 41 + Math.sin(s * 7) * 2.2) + .03 * Math.sin(s * 113 + 1) + .02 * (nz(s * 30, 3) - .5) + sstep(.86, 1, s) * .22;  // height of the hamon above the edge
  const ashi = Array.from({ length: 70 }, () => [R(), R() * .6 + .4]);
  const sample = (s, d) => {
    const shin = s > .9 ? mix(.27, .5, sstep(.9, 1, s)) : .27, hl = 1 - line(s);
    const grain = Math.sin((nz(s * 24, d * 3 + nz(s * 6, d * 2) * 1.6) + d * .4) * 46);           // itame hada: stretched wood grain
    let col, rough;
    if (d < shin) { col = 74 + 10 * grain * .25; rough = 22; }                                             // shinogi-ji: burnished, darker
    else if (d < hl - .035) { col = 128 + 9 * grain; rough = 34 + 6 * (grain * .5 + .5); }               // ji: mirror polish with grain
    else {
      const m = sstep(hl - .035, hl + .02, d);                                                              // nioi: the soft misty boundary
      col = mix(128, 214, m) + 8 * (nz(s * 300, d * 40, 2) - .5); rough = mix(36, 88, m);
      for (const [p, len] of ashi) if (Math.abs(s - p) < .0016 && d > hl && d < hl + .08 * len) { col += 14; rough += 10; }   // ashi
    }
    if (d > hl - .03 && d < hl + .04 && nz(s * 900, d * 60, 1) > .82) { col += 30; rough -= 14; }        // nie crystals sparkle
    if (d > .955) { col = 236; rough = 46; }                                                               // the sharpened edge
    if (Math.abs(s - .9) < .0011 && d > shin) { col += 40; }                                               // yokote line at the point
    return [col, rough];
  };
  const color = pixelTex(W, Hh, (u, v) => { const c = sample(u, v)[0]; return [c * .97, c, c * 1.03]; });
  const rough = pixelTex(W, Hh, (u, v) => { const r = sample(u, v)[1]; return [r, r, r]; }, false);
  color.anisotropy = rough.anisotropy = 4;                                    // only the blade is seen at grazing angles
  return { color, rough };
}

// iron guard: hammered (tsuchime) and patinated, with rust bloom
function ironMaps() {
  const nz = noise2(21), R = rng(22), dents = Array.from({ length: 60 }, () => [R(), R(), .05 + R() * .07]);
  const dent = (u, v) => { let h = 0; for (const [x, y, r] of dents) { const d = Math.hypot(((u - x + 1.5) % 1) - .5, ((v - y + 1.5) % 1) - .5); if (d < r) h -= Math.cos(d / r * Math.PI / 2) ** 2; } return h; };
  const color = pixelTex(256, 256, (u, v) => { const rust = sstep(.66, .86, nz(u * 4, v * 4)) * .7, n = nz(u * 40, v * 40, 2); return [mix(30, 70, rust) + n * 10, mix(28, 44, rust) + n * 8, mix(27, 30, rust) + n * 7]; });
  const rough = pixelTex(256, 256, (u, v) => { const r = mix(110, 210, sstep(.5, .8, nz(u * 6, v * 6))); return [r, r, r]; }, false);
  const normal = normalTex(256, 256, (u, v) => dent(u, v) * .7 + nz(u * 50, v * 50, 2) * .15, 6);
  for (const t of [color, rough, normal]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); }
  return { color, rough, normal };
}

// shakudo fittings: blue-black alloy with a nanako ground of tiny raised dots
function nanakoNormal() {
  const t = normalTex(128, 128, (u, v) => { const x = (u * 16) % 1 - .5, y = (v * 16 + (Math.floor(u * 16) % 2) * .5) % 1 - .5; return Math.max(0, 1 - Math.hypot(x, y) * 3); }, 2);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
  return t;
}

// urushi: deep black with a faint tame-nuri warmth, and an orange-peel top coat
function lacquerMaps() {
  const nz = noise2(31);
  const color = pixelTex(512, 64, (u, v) => { const n = nz(u * 18, v * 3), w = sstep(.55, .85, n); return [10 + w * 22, 8 + w * 6, 7 + w * 3]; });
  const peel = normalTex(256, 256, (u, v) => nz(u * 60, v * 60, 3), 1.2);
  color.wrapS = THREE.RepeatWrapping; color.repeat.set(2, 1);
  peel.wrapS = peel.wrapT = THREE.RepeatWrapping; peel.repeat.set(6, 2);
  return { color, peel };
}

// one lathe-like part around the x axis
const alongX = g => g.rotateZ(-Math.PI / 2);
function ovalTube(len, r, squash, segs = 40, cap = true) {
  const g = new THREE.CylinderGeometry(r, r, len, segs, 1, !cap);
  g.scale(1, 1, squash); alongX(g);
  return g;
}

// tsuka: the silk ito modelled as raised, crossing bands over beaded rayskin, open diamonds on the flat faces
function tsukaGeometry(x0, len, r, squash) {
  const NA = 80, NL = 190, WR = 8.5, HW = .25, pos = [], col = [], idx = [];
  const silk = new THREE.Color("#0f0d0c"), silkHi = new THREE.Color("#2a241f"), same = new THREE.Color("#e6dfcc"), bead = new THREE.Color("#b7ad97"), c = new THREE.Color();
  const frac = x => x - Math.floor(x);
  for (let j = 0; j <= NL; j++) {
    const a = j / NL, waist = 1 - .055 * Math.sin(a * Math.PI), x = x0 - a * len, p = a * WR;
    for (let i = 0; i <= NA; i++) {
      const f = i / NA * Math.PI * 2;
      const d1 = Math.abs(frac(p - f / Math.PI + .5) - .5), d2 = Math.abs(frac(p + f / Math.PI + .5) - .5);
      const h1 = d1 < HW ? Math.sqrt(1 - (d1 / HW) ** 2) : 0, h2 = d2 < HW ? Math.sqrt(1 - (d2 / HW) ** 2) : 0;
      const top = Math.floor(p + .5) % 2 ? h1 : h2, h = Math.max(h1, h2) + (h1 && h2 ? .25 * top : 0);   // alternate which strand lies on top
      let rr = r * waist;
      if (h > 0) {
        rr += .0006 + .0013 * h;
        const along = (h1 >= h2 ? p - f / Math.PI : p + f / Math.PI) * 60;                                // fine silk twill across the band
        c.copy(silk).lerp(silkHi, h * (.55 + .45 * Math.sin(along * 6.283)));
      } else {
        const b = Math.max(0, Math.sin(f * 70) * Math.sin(a * 900));                                      // rayskin nodules
        rr += -.0004 + .00035 * b;
        c.copy(bead).lerp(same, .4 + .6 * b);
      }
      pos.push(x, Math.sin(f) * rr, Math.cos(f) * rr * squash);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < NL; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + NA + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }   // outward-facing winding
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function buildKatana() {
  // standard PBR everywhere; physical only for the blade's brushed (anisotropic) polish
  const std = (o) => new THREE.MeshStandardMaterial({ envMapIntensity: 1, ...o });
  const steel = bladeMaps(), ironM = ironMaps(), nanako = nanakoNormal(), urushi = lacquerMaps();
  const fileTex = pixelTex(64, 64, (u, v) => { const r = 95 + 35 * (Math.sin((u + v) * 60) * .5 + .5); return [r, r, r]; }, false);   // habaki file marks
  fileTex.wrapS = fileTex.wrapT = THREE.RepeatWrapping; fileTex.repeat.set(150, 150);
  const M = {
    blade: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: steel.color, roughnessMap: steel.rough, metalness: 1, roughness: 1, anisotropy: .45, envMapIntensity: 1.25 }),
    habaki: std({ color: 0xd09a55, metalness: 1, roughness: 1, roughnessMap: fileTex }),
    brass: std({ color: 0xc89a4a, metalness: 1, roughness: .32 }),
    gold: std({ color: 0xe0b45e, metalness: 1, roughness: .18 }),
    iron: std({ color: 0xffffff, map: ironM.color, roughnessMap: ironM.rough, normalMap: ironM.normal, normalScale: new THREE.Vector2(.35, .35), metalness: .7, roughness: 1 }),
    shakudo: std({ color: 0x1e2229, metalness: .92, roughness: .3, normalMap: nanako, normalScale: new THREE.Vector2(.5, .5) }),
    horn: std({ color: 0x120d0a, roughness: .2 }),
    cord: std({ color: 0xffffff, roughness: .8 }),
    ito: std({ vertexColors: true, roughness: .55 }),
    // urushi: one glossy layer reads the same as a clear coat on solid black, at half the reflection cost
    saya: std({ color: 0xffffff, map: urushi.color, roughness: .06, normalMap: urushi.peel, normalScale: new THREE.Vector2(.1, .1) }),
  };
  // braided sageo: diagonal herringbone in deep indigo
  M.cord.map = pixelTex(64, 16, (u, v) => { const k = Math.sin((u * 8 + (v < .5 ? v : 1 - v) * 2) * 6.283) * .5 + .5; return [28 + 30 * k, 26 + 26 * k, 48 + 40 * k]; });
  M.cord.map.wrapS = THREE.RepeatWrapping; M.cord.map.repeat.set(220, 1);

  /* ---- sword: blade, habaki, seppa, tsuba, tsuka ---- */
  const sword = new THREE.Group(), blade = new THREE.Mesh(bladeGeometry(), M.blade);
  sword.add(blade);
  sword.userData.blade = blade;
  // habaki: a wedge-section collar following the blade, gilded copper with diagonal file marks
  { const sh = new THREE.Shape(V2([[-.0062, .0185], [.0062, .0185], [.0072, .006], [.0045, -.0175], [-.0045, -.0175], [-.0072, .006]]));
    const hb = new THREE.ExtrudeGeometry(sh, { depth: .033, bevelEnabled: true, bevelThickness: .001, bevelSize: .0009, bevelSegments: 2 });
    hb.rotateY(Math.PI / 2); hb.translate(.0005, arcY(.017), 0); sword.add(new THREE.Mesh(hb, M.habaki)); }
  for (const x of [-.0035, -.0185]) { const s = ovalTube(.003, .03, .72, 40); s.translate(x, 0, 0); sword.add(new THREE.Mesh(s, M.brass)); }
  // tsuba: hammered iron guard with four openwork crescents, the two hitsu-ana and a gold rim
  {
    const sh = new THREE.Shape(), R0 = .043, n = 72;
    for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, r = R0 * (1 - .06 * Math.pow(Math.abs(Math.cos(a * 2)), 3)); i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r * .92) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r * .92); }
    const nk = new THREE.Path(); nk.moveTo(-.006, -.015); nk.lineTo(.006, -.015); nk.lineTo(.004, .016); nk.lineTo(-.004, .016); nk.closePath(); sh.holes.push(nk);   // nakago-ana
    for (const s of [-1, 1]) { const h = new THREE.Path(); h.absellipse(s * .018, 0, .0045, .009, 0, Math.PI * 2); sh.holes.push(h); }
    for (let k = 0; k < 4; k++) {                                                        // sukashi crescents
      const a = k * Math.PI / 2 + Math.PI / 4, cx = Math.cos(a) * .029, cy = Math.sin(a) * .027, c = new THREE.Path();
      c.absarc(cx, cy, .008, a + 1.1, a + Math.PI * 2 - 1.1, false); c.absarc(cx + Math.cos(a) * .004, cy + Math.sin(a) * .004, .0055, a + Math.PI * 2 - 1.2, a + 1.2, true); c.closePath();
      sh.holes.push(c);
    }
    const g = new THREE.ExtrudeGeometry(sh, { depth: .0055, bevelEnabled: true, bevelThickness: .0009, bevelSize: .0009, bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -.00275); g.rotateY(Math.PI / 2); g.translate(-.011, 0, 0);
    sword.add(new THREE.Mesh(g, M.iron));
    const rim = new THREE.TorusGeometry(.0428, .0012, 8, 96); rim.scale(1, .92, 1); rim.rotateY(Math.PI / 2); rim.translate(-.011, 0, 0);
    sword.add(new THREE.Mesh(rim, M.gold));
  }
  // tsuka: shakudo fuchi, raised silk wrap over rayskin, gold menuki under the wrap, shakudo kashira
  {
    const x0 = -.022, x1 = x0 - TSUKA;
    const fuchi = ovalTube(.014, .0168, .74, 48); fuchi.translate(x0 - .007, 0, 0); sword.add(new THREE.Mesh(fuchi, M.shakudo));
    const fr = new THREE.TorusGeometry(.0168, .0009, 6, 48); fr.scale(1, 1, .74); fr.rotateY(Math.PI / 2); fr.translate(x0 - .0002, 0, 0); sword.add(new THREE.Mesh(fr, M.gold));
    sword.add(new THREE.Mesh(tsukaGeometry(x0 - .014, TSUKA - .018, .0152, .74), M.ito));
    // menuki: a small gold motif on each face, half hidden under the silk
    for (const s of [-1, 1]) {
      const parts = [];
      for (let i = 0; i < 6; i++) { const t = i / 5, b = new THREE.SphereGeometry(.0028 + .0012 * Math.sin(t * Math.PI), 10, 8); b.translate(x0 - TSUKA * .36 - t * .03, Math.sin(t * 3.2) * .004, 0); parts.push(b); }
      const base = new THREE.SphereGeometry(.006, 14, 10); base.scale(2.8, .8, .5); base.translate(x0 - TSUKA * .36 - .015, 0, 0); parts.push(base);
      const m = mergeGeometries(parts); m.translate(0, 0, s * .0118); sword.add(new THREE.Mesh(m, M.gold));
    }
    const kash = new THREE.SphereGeometry(.0178, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2); kash.scale(.75, 1, .74); kash.rotateZ(Math.PI / 2); kash.translate(x1 + .004, 0, 0); sword.add(new THREE.Mesh(kash, M.shakudo));
    const kr = new THREE.TorusGeometry(.0162, .0013, 8, 48); kr.scale(1, 1, .74); kr.rotateY(Math.PI / 2); kr.translate(x1 + .004, 0, 0); sword.add(new THREE.Mesh(kr, M.gold));
  }

  /* ---- saya: follows the blade's curve; koiguchi, kurikata, sageo, kojiri ---- */
  const saya = new THREE.Group();
  {
    const SL = BL + .03, pts = [];
    for (let i = 0; i <= 40; i++) { const s = i / 40; pts.push(new THREE.Vector3(s * SL, arcY(s * SL), 0)); }
    const path = new THREE.CatmullRomCurve3(pts);
    const body = new THREE.TubeGeometry(path, 110, .0185, 32, false);
    { const p = body.attributes.position; for (let i = 0; i < p.count; i++) { const s = p.getX(i) / SL; p.setZ(i, p.getZ(i) * .62 * mix(1, .85, s)); } body.computeVertexNormals(); }
    saya.add(new THREE.Mesh(body, M.saya));
    const koi = ovalTube(.022, .0195, .64, 48); koi.translate(.011, 0, 0); saya.add(new THREE.Mesh(koi, M.horn));
    const koj = new THREE.SphereGeometry(.0188, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2); koj.scale(1.4, 1, .55); koj.rotateZ(-Math.PI / 2); koj.translate(SL, arcY(SL), 0); saya.add(new THREE.Mesh(koj, M.shakudo));
    const kjr = new THREE.TorusGeometry(.0186, .001, 6, 40); kjr.scale(1, 1, .55); kjr.rotateY(Math.PI / 2); kjr.translate(SL, arcY(SL), 0); saya.add(new THREE.Mesh(kjr, M.gold));
    const kuri = new THREE.TorusGeometry(.0055, .0026, 10, 20); kuri.scale(1.3, 1, 1); kuri.translate(.11, arcY(.11) - .0205, 0); saya.add(new THREE.Mesh(kuri, M.horn));
    // sageo cord, wound around the scabbard below the kurikata
    const cord = [];
    for (let i = 0; i <= 160; i++) { const a = i / 160 * Math.PI * 8, x = .125 + i / 160 * .034; cord.push(new THREE.Vector3(x, arcY(x) + Math.cos(a) * .0188, Math.sin(a) * .0118)); }
    const cg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cord), 320, .0016, 6);
    saya.add(new THREE.Mesh(cg, M.cord));
  }
  return { sword, saya };
}

// studio lighting for the steel: long softbox strips give the crisp reflections polished metal is read by
function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x060504);
  const panel = (w, h, hex, k, p) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...p); m.lookAt(0, 0, 0); env.add(m);
  };
  panel(7, .55, 0xffffff, 7, [0, 3.4, 1.2]);            // overhead strip: the long highlight down the blade
  panel(2.4, 3, 0xfff0dc, 3.2, [-3.2, 1.2, 2.4]);       // warm key softbox
  panel(.45, 4.5, 0xdde7ff, 5, [3.3, .6, -1.4]);        // cool rim strip
  panel(6, .45, 0xff4a2a, 2.4, [0, -2.6, -2.2]);        // red kicker, low behind
  panel(9, 9, 0x2a201a, .35, [0, -4.5, .5]);           // dim warm floor bounce
  const pm = new THREE.PMREMGenerator(renderer), tex = pm.fromScene(env, .015).texture;
  pm.dispose();
  return tex;
}

export function createIntro(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = .9;

  const camera = new THREE.PerspectiveCamera(28, 1, .01, 20);
  const key = new THREE.DirectionalLight(0xfff1e0, 2.2); key.position.set(-1, 2, 3);
  const rim = new THREE.DirectionalLight(0xff3a22, 2.4); rim.position.set(1, -1.5, -2.5);   // blood-red rim from behind
  const gleam = new THREE.PointLight(0xffffff, 0, 1.2, 1.5);                               // travels along the blade as it is drawn
  scene.add(key, rim, gleam);

  // rig (moves the hand during the slash) > katana (hero framing) > sword / scabbard pivots on the arc centre
  const { sword, saya } = buildKatana();
  const rig = new THREE.Group(), katana = new THREE.Group(), sp = new THREE.Group(), yp = new THREE.Group(), fall = new THREE.Group();
  sp.position.set(0, R_ARC, 0); sword.position.set(0, -R_ARC, 0); sp.add(sword);
  yp.position.set(0, R_ARC, 0); saya.position.set(0, -R_ARC, 0); yp.add(saya);
  fall.add(yp); katana.add(fall, sp); rig.add(katana); scene.add(rig);

  // motion trail behind the blade during the slash: a ribbon from mid-blade to the tip
  const TRAIL = 22, trailPos = new Float32Array(TRAIL * 2 * 3), trailA = new Float32Array(TRAIL * 2), tIdx = [];
  for (let i = 0; i < TRAIL - 1; i++) { const a = i * 2; tIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const trailG = new THREE.BufferGeometry();
  trailG.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  trailG.setAttribute("alpha", new THREE.BufferAttribute(trailA, 1));
  trailG.setIndex(tIdx);
  const trail = new THREE.Mesh(trailG, new THREE.ShaderMaterial({
    vertexShader: "attribute float alpha; varying float vA; void main() { vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "varying float vA; void main() { gl_FragColor = vec4(vec3(1.0, .93, .86) * vA, vA); }",
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  trail.frustumCulled = false;
  scene.add(trail);

  // the cut: a thin white streak across the frame at the end
  let w = 1, h = 1;
  function resize() {
    w = innerWidth; h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();

  const ptr = { x: 0, y: 0, sx: 0, sy: 0 };
  const v = new THREE.Vector3(), lookAt = new THREE.Vector3(), hand = new THREE.Vector3();
  const tipIn = new THREE.Vector3(), midIn = new THREE.Vector3(), q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);
  const RAISED = 2.05;                                                       // blade held up over the shoulder before the cut
  // a point on the sword (sword-local x, y) after the sword has rotated phi about the arc centre, in katana space
  const onArc = (x, y, phi, out) => out.set(x * Math.cos(phi) - (y - R_ARC) * Math.sin(phi), R_ARC + x * Math.sin(phi) + (y - R_ARC) * Math.cos(phi), 0);
  const rigPose = (c, k, out) => {                                          // rig angle and hand position for slash progress c
    const sw = Math.min(1, c / .22), swing = sw * sw * (2.2 - 1.2 * sw);   // accelerate through the stroke, stop hard
    const cut = Math.atan2(.24 * h, w);                                     // finish along the on-screen cut line
    const ex = -.4, ey = ex * Math.tan(cut);                                // the blade comes to rest on the cut line through the centre
    out.set(mix(mix(0, -.26, k), ex, swing), mix(mix(0, -.44, k), ey, swing), 0);
    return mix(mix(0, RAISED, k), cut, swing);
  };

  // labelled points on the sword, projected to screen for the HTML callouts
  const NOTES = [
    [sword, -.011, .046, "Tsuba", "hammered iron guard"],
    [sword, -.16, .018, "Tsuka-ito", "silk braid over rayskin"],
    [saya, .142, arcY(.142) + .021, "Sageo", "braided silk cord"],
    [saya, .52, arcY(.52) + .019, "Saya", "black urushi lacquer"],
    [sword, .3, arcY(.3) + .005, "Hamon", "the temper line"],
  ];
  const anchors = NOTES.map(([obj, x, y, name, text]) => ({ obj, p: new THREE.Vector3(x, y, 0), name, text, x: 0, y: 0 }));
  const pv = new THREE.Vector3();
  function project() { for (const a of anchors) { a.obj.localToWorld(pv.copy(a.p)).project(camera); a.x = (pv.x + 1) / 2 * w; a.y = (1 - pv.y) / 2 * h; } }

  // t: scroll progress through the intro (0–1). c: the timed slash once the sword is raised (0–1).
  // rev: the stroke runs backwards (closing), so the trail follows behind on the other side
  function update(t, c, time, dt, rev = false) {
    ptr.sx += (ptr.x - ptr.sx) * Math.min(1, dt * 3); ptr.sy += (ptr.y - ptr.sy) * Math.min(1, dt * 3);
    const near = w < 700;
    // A  0–.12   macro close-up, breathing           B  .12–.45  pull back to a side view
    // C  .42–.7  the blade slides out along its arc   D  .7–.84   scabbard drops, blade rises over the shoulder
    const pull = sstep(.12, .45, t), draw = sstep(.42, .7, t), k = sstep(.7, .84, t);
    const idle = Math.sin(time * .5) * .02 * (1 - k);
    katana.rotation.set(
      mix(mix(.45, .02, pull) + idle + ptr.sy * .08, 0, k),
      mix(mix(-.75, 0, pull) + ptr.sx * .12 + idle, 0, k),
      mix(mix(.62, .1, pull) + idle * .5, 0, k));
    // drawing: the sword turns left about the arc centre, the scabbard right; together they part by a blade length
    const phiS = -(draw * .42 + k * .1) / R_ARC;
    sp.rotation.z = phiS; yp.rotation.z = draw * .38 / R_ARC;
    sword.userData.blade.visible = draw > .002;                               // sheathed: the blade would only be overdrawn
    fall.position.set(k * .2, -k * k * 1.2, 0); fall.rotation.z = -k * .7; fall.visible = k < .97;
    // the hand (middle of the grip) becomes the pivot of the rig for the raise and the slash
    onArc(-.15, 0, phiS, hand);
    katana.position.set(mix(.06, -hand.x, k), mix(0, -hand.y, k), 0);
    const ang = rigPose(c, k, rig.position);
    rig.rotation.z = ang;
    // camera: very close at first, then far enough to frame the whole blade
    const fit = Math.max(2.05, .62 / (Math.tan(camera.fov * Math.PI / 360) * camera.aspect));
    const dist = mix(near ? .5 : .36, fit, pull);
    camera.position.set(mix(.08, 0, pull), mix(.03, .02, pull) * (1 - k), dist);
    lookAt.set(mix(mix(.1, .05, pull) - draw * .2, 0, k), 0, 0);
    camera.lookAt(lookAt);
    // light rakes the steel once it is out; flares at the moment of the cut
    sword.localToWorld(v.set(mix(.0, .7, (time * .25) % 1), .04, .08));
    gleam.position.copy(v); gleam.intensity = draw * 1.6 + 6 * Math.max(0, 1 - Math.abs(c - .2) / .08);
    // trail: earlier poses of the slash, tip and mid-blade, fading with age
    const live = c > 0 && c < .45;
    trail.visible = live;
    if (live) {
      onArc(BL, arcY(BL) + .0155, phiS, tipIn).add(katana.position);
      onArc(BL * .3, arcY(BL * .3) + .0155, phiS, midIn).add(katana.position);
      const fade = rev ? sstep(0, .1, c) : 1 - sstep(.22, .42, c);
      for (let i = 0; i < TRAIL; i++) {
        const ci = rev ? Math.min(.22, c + i * .011) : Math.max(0, c - i * .011), a = rigPose(ci, 1, v);
        q.setFromAxisAngle(Z, a);
        const o = v.clone();
        const tp = tipIn.clone().applyQuaternion(q).add(o), mp = midIn.clone().applyQuaternion(q).add(o);
        trailPos.set([mp.x, mp.y, mp.z, tp.x, tp.y, tp.z], i * 6);
        const al = Math.pow(1 - i / (TRAIL - 1), 1.6) * fade * (ci > 0 ? 1 : 0);
        const k = rev ? .5 : 1;                                                // the return stroke is softer
        trailA[i * 2] = al * .15 * k; trailA[i * 2 + 1] = al * .9 * k;
      }
      trailG.attributes.position.needsUpdate = trailG.attributes.alpha.needsUpdate = true;
    }
    renderer.render(scene, camera);
    project();
  }
  return {
    update, resize,
    setPointer(x, y) { ptr.x = x; ptr.y = y; },
    renderer, scene, camera, anchors,
    dispose() { renderer.dispose(); renderer.forceContextLoss(); },
  };
}
