import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* =====================================================================
   Terrain
   ===================================================================== */
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const SHRINE = { x: 0, z: -238, y: 10.5 };

function Hraw(x, z) {
  let h = Math.sin(x * .045 + 1.3) * 1.6 + Math.cos(z * .028 + x * .012) * 2.2 + Math.sin((x - z) * .09) * .45;
  if (Math.abs(x) > 38) h += (Math.abs(x) - 38) * .14;            // valley walls rise away from the path
  const d = Math.hypot(x - SHRINE.x, z - SHRINE.z);
  h += 8 * sstep(48, 16, d);                                       // shrine hill
  h += (SHRINE.y - h) * sstep(19, 10, d);                          // flat top for the gate and hall
  const b = sstep(8, 34, z);                                       // beach slides under the sea
  return h * (1 - b) + (1.2 - (z - 8) * .16) * b;
}

// river crossing the valley between the fields and the forest
export const RIVER_Z = x => -96 + Math.sin(x * .045) * 5;
// terraced rice paddies: 3 × 4 flat basins on the right of the road
export const PADDIES = [];
for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
  const x0 = 15 + i * 6.8, z0 = -34 - j * 7.6;
  PADDIES.push({ x0, z0, x1: x0 + 6, z1: z0 - 6.8, y: Hraw(x0 + 3, z0 - 3.4) });
}
const paddyDist = (p, x, z) => Math.hypot(Math.max(p.x0 - x, 0, x - p.x1), Math.max(z - p.z0, 0, p.z1 - z));
function Hland(x, z) {
  let h = Hraw(x, z);
  if (x > 12 && x < 40 && z < -31 && z > -70) for (const p of PADDIES) { const d = paddyDist(p, x, z); if (d < 1.4) h += (p.y - h) * sstep(1.4, .3, d); }
  return h;
}
export function H(x, z) {
  return Hland(x, z) - 2.3 * sstep(5.6, 1.6, Math.abs(z - RIVER_Z(x)));
}

/* =====================================================================
   Camera path — [progress, x, z, look x, look dy, look z]
   ===================================================================== */
const KF = [
  [0,    0,   10,   0,  -.6,  90],
  [.08,  3,    8,  60,  -.5,  26],
  [.17,  5,    1, -12,  -.5, -40],
  [.27,  1,  -25,  -6,  -.4, -70],
  [.37, -8,  -55,   2,  -.3, -100],
  [.47, -3,  -85,   8,  -.3, -130],
  [.56,  5, -112,   0,  -.2, -160],
  [.65,  0, -145,  -6,  -.2, -190],
  [.73, -2, -180,   0,   2,  -236],
  [.80,  0, -206,   0,  -.2, -240],
  [.88,  0, -231.5, 0, -1.3, -238],
  [.935, 0, -232,   0,  -.9, -238],
  [1,  -13, -258,   0,  20,  -390],
];
const EYE = 2.6;

/* =====================================================================
   Palettes — one per chapter, blended by scroll
   ===================================================================== */
const pal = o => {
  const r = {};
  for (const [k, v] of Object.entries(o)) r[k] = typeof v === "number" ? v : Array.isArray(v) ? new THREE.Vector3(...v).normalize() : new THREE.Color(v);
  return r;
};
const PALETTES = [
  [.04, pal({ top: "#34405e", horizon: "#f0b394", fog: "#d7a79a", density: .0042, sun: "#ffe2c0", sunDir: [0, .07, 1], sunSize: .0016, ground: "#5d5a40", sand: "#c9b08a", grassBase: "#3d3f24", grassTip: "#b5a46f", leaf: "#f6d9d2", glow: 0, light: 1.6, amb: .9, stars: 0, cloud: .55 })],
  [.31, pal({ top: "#5c4630", horizon: "#f5b65c", fog: "#dca35d", density: .0062, sun: "#ffd58e", sunDir: [-.55, .1, -.83], sunSize: .0019, ground: "#6a4c22", sand: "#c9b08a", grassBase: "#6b4818", grassTip: "#f5d58d", leaf: "#f7db96", glow: 0, light: 2.1, amb: 1, stars: 0, cloud: .45 })],
  [.6,  pal({ top: "#3c1d18", horizon: "#e9804e", fog: "#c25c3c", density: .0115, sun: "#ffb072", sunDir: [.4, .14, -.9], sunSize: .0019, ground: "#3b1e13", sand: "#c9b08a", grassBase: "#4b2214", grassTip: "#cf6d3d", leaf: "#d63c22", glow: 0, light: 1.7, amb: .85, stars: 0, cloud: .6 })],
  [.83, pal({ top: "#5a616d", horizon: "#d6d6d0", fog: "#babdbc", density: .0105, sun: "#fff6e6", sunDir: [0, .34, -1], sunSize: .0045, ground: "#4a4b42", sand: "#c9b08a", grassBase: "#4a4f45", grassTip: "#f1eee4", leaf: "#ffffff", glow: 0, light: 1.3, amb: 1.1, stars: 0, cloud: .8 })],
  [.98, pal({ top: "#04060c", horizon: "#1f2d4a", fog: "#121a2c", density: .0085, sun: "#e8edf7", sunDir: [0, .3, -1], sunSize: .0034, ground: "#0b0f17", sand: "#2a2c33", grassBase: "#0e141c", grassTip: "#61728e", leaf: "#ffd877", glow: 1, light: .55, amb: .55, stars: 1, cloud: .35 })],
];

/* =====================================================================
   Procedural textures (made once at load, no image files)
   ===================================================================== */
function noiseTexture(size = 256) {
  const R = rng(7), oct = [[4, .42], [8, .26], [16, .16], [32, .1], [64, .06]];
  const grids = oct.map(([p]) => Float32Array.from({ length: p * p }, R));
  const data = new Uint8Array(size * size * 4);
  const sample = (x, y) => {
    let v = 0;
    oct.forEach(([p, a], o) => {
      const fx = x / size * p, fy = y / size * p, x0 = Math.floor(fx), y0 = Math.floor(fy);
      let sx = fx - x0, sy = fy - y0; sx = sx * sx * (3 - 2 * sx); sy = sy * sy * (3 - 2 * sy);
      const g = grids[o], at = (i, j) => g[((j % p + p) % p) * p + ((i % p + p) % p)];
      v += a * ((at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy);
    });
    return v;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    data[i] = sample(x, y) * 255;
    data[i + 1] = sample(x + size * .37, y + size * .61) * 255;
    data[i + 2] = 128; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// one maple leaf, white so each card can be tinted
function mapleLeaf(g, x, y, r, rot) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.beginPath();
  for (let i = 0; i <= 140; i++) {
    const a = i / 140 * Math.PI * 2;
    const lobe = Math.pow(Math.abs(Math.cos(a * 2.5)), .55);               // five pointed lobes
    const k = (.42 + .58 * lobe) * (a > Math.PI * .8 && a < Math.PI * 1.2 ? .55 : 1);
    const px = Math.sin(a) * r * k, py = -Math.cos(a) * r * k;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath(); g.fill();
  g.strokeStyle = "rgba(120,120,120,.55)"; g.lineWidth = r * .05;
  for (let i = 0; i < 5; i++) { const a = (i - 2) * 1.26; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(a) * r * .8, -Math.cos(a) * r * .8); g.stroke(); }
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, r * .55); g.stroke();
  g.restore();
}

/* =====================================================================
   Shaders
   ===================================================================== */
const FOG_V = "#include <fog_pars_vertex>";
const FOG_F = "#include <fog_pars_fragment>";
const fogMat = o => new THREE.ShaderMaterial({ fog: true, ...o, uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, o.uniforms]) });

const SWAY = /* glsl */`
float swayAt(vec2 xz, float ph) {
  float s = sin(uTime * 1.7 + ph) * .16 + sin(uTime * .83 + ph * .4) * .1;
  float wave = sin(dot(xz, uWind) * .09 - uTime * 2.2) * .5 + .5;
  return s + uGust * (.25 + wave * .75);
}`;

const grassVS = /* glsl */`
attribute vec4 offset;  // world xyz + yaw
attribute vec2 shape;   // height, shade
uniform float uTime, uGust;
uniform vec2 uWind;
varying float vY, vShade;
${FOG_V}
${SWAY}
void main() {
  float y = position.y, h = shape.x;
  vec3 p = vec3(position.x * (1.0 - y * .9), y * h, 0.0);
  float c = cos(offset.w), s = sin(offset.w);
  p.xz = mat2(c, -s, s, c) * p.xz;
  float bend = swayAt(offset.xz, offset.x * .17 + offset.z * .13) * y * y * h;
  p.xz += uWind * bend;
  p.y -= bend * bend * .3 / h;
  vec4 mvPosition = modelViewMatrix * vec4(offset.xyz + p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vY = y; vShade = shape.y;
  #include <fog_vertex>
}`;
const grassFS = /* glsl */`
uniform vec3 uBase, uTip;
varying float vY, vShade;
${FOG_F}
void main() {
  vec3 col = mix(uBase, uTip, smoothstep(.05, 1.0, vY)) * (.78 + .42 * vShade);
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

// pampas plumes: feather cards riding the tip of their blade
const plumeVS = /* glsl */`
attribute vec4 offset;
attribute vec2 shape;
uniform float uTime, uGust;
uniform vec2 uWind;
varying vec2 vUv;
varying float vShade;
${FOG_V}
${SWAY}
void main() {
  float h = shape.x;
  float bend = swayAt(offset.xz, offset.x * .17 + offset.z * .13) * h;
  vec3 tip = offset.xyz + vec3(uWind.x * bend, h - bend * bend * .3 / h, uWind.y * bend);
  vec3 axis = normalize(vec3(uWind.x * bend * .9, 1.0, uWind.y * bend * .9));
  vec3 side = normalize(cross(axis, normalize(cameraPosition - tip)));
  float L = .55 + shape.y * .35;
  vec3 w = tip + side * position.x * L * .32 + axis * (position.y * L - L * .25);
  vec4 mvPosition = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vUv = position.xy + vec2(.5, 0.0);
  vShade = shape.y;
  #include <fog_vertex>
}`;
const plumeFS = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uTip;
varying vec2 vUv;
varying float vShade;
${FOG_F}
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < .35) discard;
  vec3 col = mix(uTip, vec3(1.0), .45) * (.82 + .3 * vShade);
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

// leaf cards on the trees
const leafCardVS = /* glsl */`
attribute vec4 lOff;   // centre xyz, size
attribute vec3 lRot;   // yaw, pitch, phase
attribute vec3 lCol;
uniform float uTime, uGust;
uniform vec2 uWind;
uniform vec3 uSunDir;
varying vec2 vUv;
varying vec3 vCol;
varying float vLit;
${FOG_V}
void main() {
  vec3 p = position * lOff.w, n = vec3(0.0, 0.0, 1.0);
  float cp = cos(lRot.y), sp = sin(lRot.y), cy = cos(lRot.x), sy = sin(lRot.x);
  p = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);
  n = vec3(n.x, n.y * cp - n.z * sp, n.y * sp + n.z * cp);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  n = vec3(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy);
  float sway = sin(uTime * 1.4 + lRot.z) * .07 + uGust * .12 * sin(uTime * 2.9 + lRot.z * 3.0);
  vec3 w = lOff.xyz + p;
  w.xz += uWind * sway;
  w.y += sin(uTime * 2.1 + lRot.z * 5.0) * .03;
  vec4 mvPosition = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vUv = uv; vCol = lCol;
  vLit = .55 + .45 * abs(dot(n, uSunDir));
  #include <fog_vertex>
}`;
const leafCardFS = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uSun, uAmb;
varying vec2 vUv;
varying vec3 vCol;
varying float vLit;
${FOG_F}
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < .5) discard;
  vec3 col = vCol * t.rgb * (uAmb + uSun * vLit * .55);
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

const groundVS = /* glsl */`
varying vec3 vW, vN;
${FOG_V}
void main() {
  vW = (modelMatrix * vec4(position, 1.0)).xyz; vN = normal;
  vec4 mvPosition = viewMatrix * vec4(vW, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const groundFS = /* glsl */`
uniform vec3 uGround, uSand, uSunDir, uSun, uAmb, uGrass;
uniform sampler2D uNoise;
varying vec3 vW, vN;
${FOG_F}
void main() {
  vec2 nz = texture2D(uNoise, vW.xz * .012).rg;
  float fine = texture2D(uNoise, vW.xz * .09).r;
  vec3 n = normalize(vN);
  vec3 land = mix(uGround, uGrass, .45 + .25 * nz.x);                                   // ground shares the grass colour
  land = mix(land, vec3(.28, .26, .23), smoothstep(.82, .62, n.y) * .7);                 // rocky on steep slopes
  vec3 base = mix(land, uSand, smoothstep(9.0, 16.0, vW.z + (nz.x - .5) * 6.0));
  base *= .74 + .44 * nz.y + .16 * (fine - .5);
  float plaza = smoothstep(12.0, 10.5, distance(vW.xz, vec2(${SHRINE.x.toFixed(1)}, ${SHRINE.z.toFixed(1)})));
  base = mix(base, vec3(.42, .4, .37) * (.85 + .3 * fine), plaza);
  float d = max(dot(n, uSunDir), 0.0);
  gl_FragColor = vec4(base * (uAmb * .95 + uSun * d * .95), 1.0);
  #include <fog_fragment>
  // distant slopes keep some relief through the haze: sun-facing flanks, forest patches (reuses the noise above)
  float far = smoothstep(55.0, 170.0, length(vW - cameraPosition)) * (1.0 - plaza);
  gl_FragColor.rgb *= mix(1.0, (.74 + .36 * d) * (1.0 - .26 * smoothstep(.46, .7, nz.y)) * (.86 + .28 * fine), far * .75);
  #include <colorspace_fragment>
}`;

const skyVS = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
}`;
const skyFS = /* glsl */`
uniform vec3 uTop, uHorizon, uSunDir, uSun;
uniform float uSunSize, uStars, uTime, uCloud;
uniform sampler2D uNoise;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  vec3 col = mix(uHorizon, uTop, pow(smoothstep(-.03, .55, d.y), .65));
  float sd = max(dot(d, uSunDir), 0.0);
  // painted cloud bands: noise projected on a dome, two layers drifting
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + .12);
    float c = texture2D(uNoise, uv * .09 + vec2(uTime * .004, 0.0)).r * .65 + texture2D(uNoise, uv * .23 - vec2(uTime * .007, uTime * .002)).g * .35;
    c = smoothstep(.48, .78, c) * smoothstep(.0, .18, d.y) * smoothstep(.95, .35, d.y) * uCloud;
    vec3 cc = mix(uHorizon * 1.08, uTop * 1.4 + .05, .35) + uSun * pow(sd, 6.0) * .7;
    col = mix(col, cc, c);
  }
  col += uSun * (smoothstep(1.0 - uSunSize, 1.0 - uSunSize * .55, sd) * 1.4 + pow(sd, 90.0) * .35 + pow(sd, 9.0) * .16);
  vec3 cell = floor(d * 420.0);
  col += step(.9975, hash(cell)) * smoothstep(.02, .3, d.y) * uStars * (.5 + .5 * hash(cell + 3.1));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const waterFS = /* glsl */`
uniform vec3 uTop, uHorizon, uSunDir, uSun;
uniform float uTime;
varying vec3 vW, vN;
${FOG_F}
void main() {
  vec2 p = vW.xz;
  vec3 n = normalize(vec3(
    sin(p.x * .21 + uTime * .9) * .05 + sin(p.x * .9 + p.y * .4 + uTime * 1.7) * .025,
    1.0,
    sin(p.y * .17 - uTime * .7) * .05 + sin(p.y * 1.1 - p.x * .3 + uTime * 2.1) * .025));
  vec3 v = normalize(cameraPosition - vW);
  float fr = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 col = mix(uTop * .55, uHorizon * .95, .35 + fr * .65);
  col += uSun * pow(max(dot(reflect(-v, n), uSunDir), 0.0), 180.0) * 2.2;
  float shore = smoothstep(26.0, 19.0, vW.z) * (.5 + .5 * sin(vW.z * 1.4 - uTime * 1.6));
  col = mix(col, vec3(1.0), shore * .35);
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

const driftVS = /* glsl */`
attribute vec4 seed;
uniform float uTime, uSize, uPR;
uniform vec3 uCam, uBox;
uniform vec2 uWind;
varying float vRot, vA;
${FOG_V}
void main() {
  float r = seed.w;
  vec3 p = seed.xyz * uBox;
  p.y -= uTime * (.5 + r * .7);
  p.xz += uWind * uTime * (1.4 + r * 1.6);
  p.x += sin(uTime * (.6 + r) + r * 40.0) * 1.3;
  p.y += sin(uTime * (1.1 + r) + r * 17.0) * .6;
  vec3 w = mod(p - uCam + uBox * .5, uBox) - uBox * .5 + uCam;
  vec4 mvPosition = modelViewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = uSize * uPR * (.55 + r * .9) / -mvPosition.z;
  vRot = uTime * (.8 + r * 2.4) + r * 6.28;
  vA = smoothstep(uBox.x * .5, uBox.x * .3, length(w.xz - uCam.xz));
  #include <fog_vertex>
}`;
const driftFS = /* glsl */`
uniform vec3 uColor;
uniform float uGlow;
varying float vRot, vA;
${FOG_F}
void main() {
  vec2 c = gl_PointCoord - .5;
  float cs = cos(vRot), sn = sin(vRot);
  c = mat2(cs, -sn, sn, cs) * c;
  float leaf = smoothstep(.5, .4, length(vec2(c.x, c.y * 2.3)));
  float orb = smoothstep(.5, .0, length(c));
  float a = mix(leaf, orb * orb, uGlow) * vA;
  if (a < .02) discard;
  gl_FragColor = vec4(uColor * (1.0 + uGlow * 1.5), a);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

// smoke columns rising over the burning village
const smokeVS = /* glsl */`
attribute vec4 sBase;   // base xyz, phase
uniform float uTime;
varying vec2 vUv;
varying float vT;
${FOG_V}
void main() {
  float t = fract(uTime * .045 + sBase.w);
  vec3 c = sBase.xyz + vec3(0.0, t * 34.0, 0.0);
  c.xz += vec2(.8, -.3) * t * t * 26.0;
  float size = 2.5 + t * 13.0;
  vec4 mvPosition = viewMatrix * vec4(c, 1.0);
  mvPosition.xy += position.xy * size;
  gl_Position = projectionMatrix * mvPosition;
  vUv = position.xy + .5; vT = t;
  #include <fog_vertex>
}`;
const smokeFS = /* glsl */`
uniform sampler2D uNoise;
uniform vec3 uTint;
varying vec2 vUv;
varying float vT;
${FOG_F}
void main() {
  float r = length(vUv - .5) * 2.0;
  float n = texture2D(uNoise, vUv * .7 + vT * .6).r;
  float a = smoothstep(1.0, .2, r + (n - .5) * .8) * sin(vT * 3.14159) * .5;
  if (a < .01) discard;
  vec3 col = mix(vec3(.09, .08, .075), uTint * .8, vT * .8);
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

// flames: noise-eaten teardrops, billboarded, flickering
const fireVS = /* glsl */`
attribute vec4 fBase;
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
void main() {
  float fl = 1.0 + .16 * sin(uTime * 11.0 + fBase.w * 7.0) + .09 * sin(uTime * 23.0 + fBase.w * 3.0);
  vec4 mv = viewMatrix * vec4(fBase.xyz, 1.0);
  mv.xy += vec2(position.x * 2.3, (position.y + .5) * 3.1 * fl);
  gl_Position = projectionMatrix * mv;
  vUv = position.xy + .5; vSeed = fBase.w;
}`;
const fireFS = /* glsl */`
uniform sampler2D uNoise;
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
void main() {
  float n = texture2D(uNoise, vec2(vUv.x * .5 + vSeed, vUv.y * .45 - uTime * .8)).r;
  float shape = 1.0 - abs(vUv.x - .5) * 2.0 * (.75 + vUv.y * 1.3) - vUv.y * .62 + (n - .5) * .7;
  float a = smoothstep(.0, .4, shape);
  if (a < .01) discard;
  vec3 col = mix(vec3(.9, .22, .03), vec3(1.0, .82, .42), smoothstep(.25, .9, shape));
  gl_FragColor = vec4(col * a * 1.3, a);
}`;

// cloth that ripples (banners)
const clothVS = /* glsl */`
uniform float uTime, uGust;
varying vec2 vUv;
varying float vShade;
${FOG_V}
void main() {
  vec3 p = position;
  float k = uv.x;
  float ph = modelMatrix[3].x * .7 + modelMatrix[3].z * .3;
  float w = sin(p.y * 1.6 - uTime * 3.2 + ph) * .18 + sin(p.y * 3.1 - uTime * 4.7 + ph) * .06;
  p.z += w * k * (1.0 + uGust);
  vShade = .8 + w * 1.1;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vUv = uv;
  #include <fog_vertex>
}`;
const clothFS = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uSun, uAmb;
varying vec2 vUv;
varying float vShade;
${FOG_F}
void main() {
  vec3 col = texture2D(uMap, vUv).rgb * (uAmb + uSun * .45) * vShade;
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

const mountVS = /* glsl */`
attribute float hn;
varying float vH, vY;
varying vec2 vXZ;
void main() { vH = hn; vY = position.y; vXZ = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// distant ranges: static ridge-and-gully shading, forest speckle thinning toward the summits, soft cloud shadows
const mountFS = /* glsl */`
uniform vec3 uCol, uFogC;
uniform sampler2D uNoise;
uniform float uDetail;
varying float vH, vY;
varying vec2 vXZ;
void main() {
  float a = atan(vXZ.x, vXZ.y + 120.0) * 9.0;                         // around the ring
  vec2 r = vec2(a * .5, vY * .006);
  float r0 = texture2D(uNoise, r).r;
  float light = clamp(.5 + dFdx(r0) * 60.0, 0.0, 1.0);                 // gullies: one flank lit, one in shade (free derivative)
  float trees = smoothstep(.5, .72, texture2D(uNoise, vec2(a * 9.0, vY * .09)).r) * smoothstep(.95, .45, vH);
  float n = r0;
  float shade = (.72 + .5 * light) * (.86 + .28 * r0) * (1.0 - .32 * trees);
  vec3 col = mix(uFogC, uCol * (.85 + .3 * n) * mix(1.0, shade, uDetail), .3 + vH * .7);
  col *= mix(1.0, shade, uDetail * .75);                               // keep some relief through the haze
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// birds circling over the island: three triangles each, flight and wingbeat in the vertex shader
const birdVS = /* glsl */`
attribute vec4 path;   // centre x, centre z, radius, height
attribute vec2 seed;   // angular speed (sign = direction), phase
uniform float uTime;
${FOG_V}
void main() {
  float a = uTime * seed.x + seed.y;
  vec3 c = vec3(path.x + cos(a) * path.z, path.w + sin(a * 1.7 + seed.y) * 1.5, path.y + sin(a) * path.z);
  vec3 fwd = vec3(-sin(a), 0.0, cos(a)) * sign(seed.x), side = vec3(fwd.z, 0.0, -fwd.x);
  float flap = sin(uTime * (7.0 + fract(seed.y) * 3.0) + seed.y * 7.0);
  vec3 p = c + side * position.x + fwd * position.z + vec3(0.0, position.y + abs(position.x) * flap * .55, 0.0);
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const birdFS = /* glsl */`
uniform vec3 uCol;
${FOG_F}
void main() {
  gl_FragColor = vec4(uCol, 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

/* =====================================================================
   Geometry helpers
   ===================================================================== */
const UP = new THREE.Vector3(0, 1, 0);
const V2 = pts => pts.map(([x, y]) => new THREE.Vector2(x, y));

// a tapered cylinder from point a to point b (posed limbs, poles, swords)
function limb(a, b, r1, r2, seg = 12) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r2, r1, len, seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}
// hipped roof: rectangle w × d at y = 0 rising to a ridge along x
function hipRoof(w, d, h, ridge) {
  const A = [-w / 2, 0, -d / 2], B = [w / 2, 0, -d / 2], C = [w / 2, 0, d / 2], D = [-w / 2, 0, d / 2], R1 = [-ridge / 2, h, 0], R2 = [ridge / 2, h, 0];
  const tris = [D, C, R2, D, R2, R1, B, A, R1, B, R1, R2, A, D, R1, C, B, R2];
  const pos = new Float32Array(tris.flat()), uv = [];
  for (let i = 0; i < tris.length; i++) { const [x, y, z] = tris[i], side = Math.floor(i / 3) >= 4; uv.push((side ? z : x) * .45, y / h * 2.2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// collects transformed parts and merges them per material: one draw call per material
function kit() {
  const byMat = new Map(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  return {
    add(geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
      m.compose(new THREE.Vector3(...p), q.setFromEuler(e.set(...r)), new THREE.Vector3(...(typeof s === "number" ? [s, s, s] : s)));
      const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!byMat.has(mat)) byMat.set(mat, []);
      byMat.get(mat).push(g);
      return this;
    },
    build() {
      const grp = new THREE.Group();
      for (const [mat, gs] of byMat) grp.add(new THREE.Mesh(mergeGeometries(gs), mat));
      return grp;
    },
  };
}
// bake several placed groups into a single mesh per material
function bake(groups) {
  const byMat = new Map();
  for (const g of groups) {
    g.updateMatrixWorld(true);
    for (const m of g.children) {
      if (!m.isMesh) continue;
      const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
      if (!byMat.has(m.material)) byMat.set(m.material, []);
      byMat.get(m.material).push(geo);
    }
  }
  const out = new THREE.Group();
  for (const [mat, gs] of byMat) out.add(new THREE.Mesh(mergeGeometries(gs), mat));
  return out;
}
// one merged kit, stamped many times with InstancedMesh
function stamp(scene, grp, transforms) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const mesh of grp.children) {
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, transforms.length);
    transforms.forEach(([x, y, z, ry = 0, s = 1], i) => im.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(0, ry, 0)), new THREE.Vector3(s, s, s))));
    im.computeBoundingSphere();
    scene.add(im);
  }
}

// a branching trunk; returns merged bark geometry and the twig ends where leaves go
function treeVariant(seed, { depth = 4, len = 2.3, rad = .3, spread = 1.15, lift = .35, kids = [2, 2, 3, 3] }) {
  const R = rng(seed), geos = [], tips = [];
  (function branch(start, dir, l, r, d) {
    const end = start.clone().addScaledVector(dir, l);
    const g = new THREE.CylinderGeometry(r * .68, r, l * 1.04, 6, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir));
    g.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
    geos.push(g);
    if (d <= 2) tips.push(end.clone());
    if (d === 1) return;
    const n = kids[depth - d] || 2;
    for (let i = 0; i < n; i++) {
      const nd = dir.clone(), a = (i / n) * Math.PI * 2 + R() * 1.2;
      nd.x += Math.cos(a) * spread * (.6 + R() * .5);
      nd.z += Math.sin(a) * spread * (.6 + R() * .5);
      nd.y += lift;
      branch(end, nd.normalize(), l * (.66 + R() * .16), r * .62, d - 1);
    }
  })(new THREE.Vector3(0, -.3, 0), new THREE.Vector3((R() - .5) * .25, 1, (R() - .5) * .25).normalize(), len, rad, depth);
  return { geo: mergeGeometries(geos), tips };
}

/* =====================================================================
   World
   ===================================================================== */
export function createWorld(canvas, { coarse }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: "high-performance", stencil: false });
  let dpr = Math.min(devicePixelRatio || 1, coarse ? 1.25 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xffffff, .006);
  const camera = new THREE.PerspectiveCamera(52, 1, .1, 1600);

  const P = {};
  for (const [k, v] of Object.entries(PALETTES[0][1])) P[k] = v.clone ? v.clone() : v;
  const ambC = new THREE.Color(), sunC = new THREE.Color();

  // uniforms several materials share
  const S = {
    uTime: { value: 0 }, uGust: { value: .5 }, uWind: { value: new THREE.Vector2(0, -1) },
    uSunDir: { value: P.sunDir }, uSun: { value: sunC }, uAmb: { value: ambC }, uNoise: { value: noiseTexture() },
  };
  // UniformsUtils.merge clones values; re-link the shared ones afterwards
  const link = (mat, keys) => { for (const k of keys) mat.uniforms[k] = S[k]; return mat; };

  /* ---- path ---- */
  const camPts = KF.map(k => new THREE.Vector3(k[1], H(k[1], k[2]) + EYE, k[2]));
  const lookPts = KF.map((k, i) => new THREE.Vector3(k[3], camPts[i].y + k[4], k[5]));
  const camCurve = new THREE.CatmullRomCurve3(camPts, false, "centripetal");
  const lookCurve = new THREE.CatmullRomCurve3(lookPts, false, "centripetal");
  const pathSamples = camCurve.getSpacedPoints(500);
  const pathDist = (x, z) => { let m = Infinity; for (const p of pathSamples) m = Math.min(m, (p.x - x) ** 2 + (p.z - z) ** 2); return Math.sqrt(m); };
  const progToU = p => {
    let i = 0; while (i < KF.length - 2 && p > KF[i + 1][0]) i++;
    const t = Math.min(1, Math.max(0, (p - KF[i][0]) / (KF[i + 1][0] - KF[i][0])));
    return (i + t) / (KF.length - 1);
  };

  // the red bridge sits where the road meets the river
  const BR = (() => {
    let best = 0, bd = Infinity;
    for (let i = 0; i <= 600; i++) { const p = camCurve.getPoint(i / 600); const d = Math.abs(p.z - RIVER_Z(p.x)); if (d < bd) { bd = d; best = i / 600; } }
    const c = camCurve.getPoint(best), t = camCurve.getTangent(best);
    const dir = new THREE.Vector2(t.x, t.z).normalize();
    const yb = (Hland(c.x + dir.x * 7, c.z + dir.y * 7) + Hland(c.x - dir.x * 7, c.z - dir.y * 7)) / 2;
    return { x: c.x, z: c.z, dir, yb, half: 7.5 };
  })();
  const bridgeDeck = (x, z) => {
    const dx = x - BR.x, dz = z - BR.z, s = dx * BR.dir.x + dz * BR.dir.y, l = -dx * BR.dir.y + dz * BR.dir.x;
    if (Math.abs(s) > BR.half || Math.abs(l) > 1.6) return -Infinity;
    return BR.yb + .35 + 1.5 * Math.cos(s / BR.half * Math.PI / 2);
  };
  // [x, z, yaw, size, burning]
  const VILLAGE = [[30, 5, -.25, 1, true], [38, 9, .1, .9, true], [46, 4, -.4, 1.1, true], [54, 10, .25, .85, false], [36, -2, -.1, .95, true], [49, -4, .35, 1, true], [58, 3, -.2, .9, false]];
  const SPOTS = { pagoda: [-47, -64], hokora: [-11, -41], minka: [26, -83], wheel: [21.5, 0], jizo: [[6.2, -14], [7.1, -14.8], [8, -15.7], [-7.4, -104], [-8.2, -103.2]] };
  SPOTS.wheel[1] = RIVER_Z(SPOTS.wheel[0]) + 4.1;
  // the bamboo grove: one soft-edged stand on the left of the road; maples keep a clearing around it
  const GROVE = { x: -24, z: -172, rx: 17, rz: 22 };
  const inGrove = (x, z, m = 0) => ((x - GROVE.x) / (GROVE.rx + m)) ** 2 + ((z - GROVE.z) / (GROVE.rz + m)) ** 2 < 1;
  const blocked = (x, z) =>
    Math.abs(z - RIVER_Z(x)) < 4.6 ||
    (x > 13 && x < 42 && z < -32 && z > -69) ||
    Math.hypot(x - SPOTS.pagoda[0], z - SPOTS.pagoda[1]) < 7 ||
    Math.hypot(x - SPOTS.hokora[0], z - SPOTS.hokora[1]) < 4 ||
    Math.hypot(x - SPOTS.minka[0], z - SPOTS.minka[1]) < 9 ||
    VILLAGE.some(([vx, vz]) => Math.hypot(x - vx, z - vz) < 6.5);

  /* ---- sky ---- */
  const skyM = new THREE.ShaderMaterial({ vertexShader: skyVS, fragmentShader: skyFS, side: THREE.BackSide, depthWrite: false,
    uniforms: { uTop: { value: P.top }, uHorizon: { value: P.horizon }, uSunDir: S.uSunDir, uSun: { value: P.sun }, uSunSize: { value: P.sunSize }, uStars: { value: 0 }, uTime: S.uTime, uCloud: { value: .5 }, uNoise: S.uNoise } });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyM);
  sky.frustumCulled = false; sky.renderOrder = 2;   // after the opaque scene, so early-z skips hidden sky pixels
  scene.add(sky);

  /* ---- mountains ---- */
  function ring(radius, base, amp, seed, detail) {
    const n = 260, pos = [], hn = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2, cx = Math.sin(a), cz = Math.cos(a);
      let h = base + amp * (.55 + .45 * Math.sin(a * 7 + seed) * Math.sin(a * 3.1 + seed * 2)) + amp * .25 * Math.abs(Math.sin(a * 23 + seed)) + amp * .08 * Math.sin(a * 61 + seed);
      h *= 1 - sstep(.2, .85, cz) * .82;                               // low toward the sea
      pos.push(cx * radius, -20, cz * radius - 120, cx * radius, h, cz * radius - 120);
      hn.push(0, 1);
      if (i < n) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("hn", new THREE.Float32BufferAttribute(hn, 1));
    g.setIndex(idx);
    const u = { uCol: { value: new THREE.Color() }, uFogC: { value: P.fog }, uNoise: S.uNoise, uDetail: { value: detail } };
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: mountVS, fragmentShader: mountFS, uniforms: u, side: THREE.DoubleSide, depthWrite: false }));
    m.frustumCulled = false; m.renderOrder = 1;                       // after the opaque scene (their origin sorts them first otherwise)
    scene.add(m);
    return u;
  }
  const farRing = ring(720, 70, 120, 1.7, .6), nearRing = ring(470, 25, 60, 4.2, 1);

  /* ---- ground ---- */
  {
    const g = new THREE.PlaneGeometry(520, 640, coarse ? 130 : 210, coarse ? 160 : 260);
    g.rotateX(-Math.PI / 2); g.translate(0, 0, -130);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) a.setY(i, H(a.getX(i), a.getZ(i)));
    g.computeVertexNormals();
    const m = link(fogMat({ vertexShader: groundVS, fragmentShader: groundFS, uniforms: { uGround: { value: P.ground }, uSand: { value: P.sand }, uGrass: { value: P.grassBase }, uSunDir: {}, uSun: {}, uAmb: {}, uNoise: {} } }), ["uSunDir", "uSun", "uAmb", "uNoise"]);
    m.uniforms.uGround.value = P.ground; m.uniforms.uSand.value = P.sand; m.uniforms.uGrass.value = P.grassBase;
    const ground = new THREE.Mesh(g, m); ground.renderOrder = .5;       // after grass and trees: only the ground left showing gets shaded
    scene.add(ground);
  }

  /* ---- sea ---- */
  const waterM = link(fogMat({ vertexShader: groundVS, fragmentShader: waterFS, uniforms: { uTop: {}, uHorizon: {}, uSun: {}, uSunDir: {}, uTime: {} } }), ["uSunDir", "uTime"]);
  waterM.uniforms.uTop.value = P.top; waterM.uniforms.uHorizon.value = P.horizon; waterM.uniforms.uSun.value = P.sun;
  {
    const g = new THREE.PlaneGeometry(2400, 1300, 1, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0, 660);
    scene.add(new THREE.Mesh(g, waterM));
  }

  /* ---- lights + materials for the solid props ---- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
  const sunL = new THREE.DirectionalLight(0xffffff, 1);
  scene.add(hemi, sunL, sunL.target);
  const lam = (color, extra) => new THREE.MeshLambertMaterial({ color, ...extra });
  const M = {
    bark: lam(0x2b1c14), pineBark: lam(0x3a2a20), pine: lam(0x2a3b22, { flatShading: true }),
    stone: lam(0x8c877c, { flatShading: true }), rock: lam(0xffffff, { flatShading: true }), steps: lam(0xffffff, { flatShading: true }),
    vermilion: lam(0xc23a22), lacquer: lam(0x161311), wood: lam(0x5a3d29), darkWood: lam(0x2c2019),
    thatch: lam(0x8a6d45, { flatShading: true }), roof: lam(0x3b3633, { flatShading: true }),
    straw: lam(0xc9b27a), paper: lam(0xf3efe6, { side: THREE.DoubleSide }),
    lantern: lam(0x8a857a, { emissive: 0xffb050, emissiveIntensity: 0, flatShading: true }),
    ink: lam(0x0d0c0b), indigo: lam(0x1a2030), hakama: lam(0x25221f),
    hull: lam(0x1a1410, { flatShading: true }), steel: new THREE.MeshBasicMaterial({ color: 0xe9e4da }),
    fire: new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  };
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), e3 = new THREE.Euler();

  // lacquer/metal look via Phong: ~3x cheaper per pixel than PBR on the close-up samurai
  const std = (color, rough, metal = 0, extra) => {
    const c = new THREE.Color(color), spec = new THREE.Color(.6, .6, .6).lerp(c, metal).multiplyScalar(1.2 - rough);
    return new THREE.MeshPhongMaterial({ color: c, emissive: c.clone().multiplyScalar(.28 + metal * .3), specular: spec, shininess: 6 + (1 - rough) ** 2 * 90, emissiveMap: extra?.map ?? null, ...extra });
  };
  const TX = {
    thatch: canvasTexture(128, 128, (g, w, h) => {
      const R = rng(61); g.fillStyle = "#8a6c44"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { const x = R() * w, y = R() * h; g.strokeStyle = `hsla(${32 + R() * 10},${30 + R() * 20}%,${22 + R() * 32}%,.8)`; g.lineWidth = .6 + R() * 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - .5) * 3, y + 6 + R() * 14); g.stroke(); }
      for (let y = 0; y < h; y += 32) { g.fillStyle = "rgba(30,20,10,.35)"; g.fillRect(0, y, w, 3); }
    }),
    shoji: canvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = "#efe8d8"; g.fillRect(0, 0, w, h); g.fillStyle = "#3b2a1e";
      for (let x = 0; x <= w; x += 16) g.fillRect(x - 1, 0, 2, h);
      for (let y = 0; y <= h; y += 21) g.fillRect(0, y - 1, w, 2);
    }),
    plaster: canvasTexture(64, 64, (g, w, h) => {
      const R = rng(4); g.fillStyle = "#ddd2bc"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(90,70,50,${R() * .08})`; g.fillRect(R() * w, R() * h, 2 + R() * 4, 2 + R() * 4); }
    }),
    boards: canvasTexture(64, 64, (g, w, h) => {
      const R = rng(8);
      for (let x = 0; x < w; x += 8) { g.fillStyle = `hsl(25,${25 + R() * 10}%,${14 + R() * 8}%)`; g.fillRect(x, 0, 8, h); g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(x, 0, 1, h); }
    }),
    needles: canvasTexture(128, 128, g => {
      const R = rng(23); g.strokeStyle = "#fff"; g.lineCap = "round";
      for (let i = 0; i < 70; i++) {
        const cx = 64 + (R() - .5) * 60, cy = 64 + (R() - .5) * 26;
        for (let k = 0; k < 9; k++) { const a = R() * 6.28, l = 8 + R() * 10; g.lineWidth = 1.6 + R(); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l * .55); g.stroke(); }
      }
    }),
  };
  for (const k of ["thatch", "plaster", "boards"]) { TX[k].wrapS = TX[k].wrapT = THREE.RepeatWrapping; }
  const thatchM = lam(0xffffff, { map: TX.thatch, side: THREE.DoubleSide }), charM = lam(0x2a2018, { map: TX.thatch, side: THREE.DoubleSide });
  const plasterM = lam(0xffffff, { map: TX.plaster }), boardM = lam(0xffffff, { map: TX.boards }), shojiM = lam(0xffffff, { map: TX.shoji });

  // timber-framed house: stone footing, posts, board-and-plaster walls, shoji front, veranda, thick hipped thatch
  function house({ w = 7, d = 4.6, wall = 2.3, roofH = 3.2, burnt = false, veranda = true }) {
    const k = kit(), post = M.darkWood;
    k.add(new THREE.BoxGeometry(w + .4, .35, d + .4), M.stone, [0, .1, 0]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(new THREE.BoxGeometry(.2, wall, .2), post, [sx * w / 2, wall / 2 + .25, sz * d / 2]);
    for (let x = -w / 2 + 1.75; x < w / 2 - .5; x += 1.75) for (const sz of [-1, 1]) k.add(new THREE.BoxGeometry(.16, wall, .16), post, [x, wall / 2 + .25, sz * d / 2]);
    k.add(new THREE.BoxGeometry(w + .1, .18, d + .1), post, [0, wall + .22, 0]);                      // top beam
    k.add(new THREE.BoxGeometry(w - .1, wall * .45, d - .1), boardM, [0, .25 + wall * .225, 0]);    // board skirt
    k.add(new THREE.BoxGeometry(w - .14, wall * .55, d - .14), plasterM, [0, .25 + wall * .72, 0]);  // plaster above
    k.add(new THREE.BoxGeometry(w * .62, wall * .8, .04), shojiM, [0, .25 + wall * .42, d / 2 + .02]);
    if (veranda) {
      k.add(new THREE.BoxGeometry(w + .2, .1, 1.1), M.wood, [0, .62, d / 2 + .6]);
      for (let x = -w / 2; x <= w / 2 + .01; x += w / 3) k.add(new THREE.BoxGeometry(.1, .6, .1), post, [x, .3, d / 2 + 1.1]);
    }
    const roof = burnt ? charM : thatchM, y0 = wall + .3;
    k.add(hipRoof(w + 2.2, d + 2.2, roofH * (burnt ? .75 : 1), w * .45), roof, [0, y0, 0]);
    k.add(hipRoof(w + 2.3, d + 2.3, .42, w + .1), roof, [0, y0 - .38, 0]);                         // thick eave edge
    if (!burnt) {
      k.add(new THREE.BoxGeometry(w * .45 + .6, .32, .5), M.darkWood, [0, y0 + roofH + .08, 0]);      // ridge cap
      for (let x = -w * .2; x <= w * .2 + .01; x += w * .1) k.add(new THREE.BoxGeometry(.12, .3, .9), M.darkWood, [x, y0 + roofH + .12, 0]);
    }
    return k.build();
  }
  const place = (mesh, i, x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) => {
    m4.compose(v3.set(x, y, z), q4.setFromEuler(e3.set(rx, ry, rz)), s3.set(sx, sy, sz)); mesh.setMatrixAt(i, m4);
  };

  /* ---- grass + pampas plumes, in spatial chunks so off-screen ones are skipped ---- */
  const clothMat = tex => {
    const m = link(fogMat({ vertexShader: clothVS, fragmentShader: clothFS, uniforms: { uTime: {}, uGust: {}, uSun: {}, uAmb: {}, uMap: { value: null } }, side: THREE.DoubleSide }), ["uTime", "uGust", "uSun", "uAmb"]);
    m.uniforms.uMap.value = tex;
    return m;
  };
  const plumeTex = canvasTexture(64, 128, (g, w, h) => {
    g.translate(w / 2, h);
    const R = rng(13);
    for (let i = 0; i < 260; i++) {                                  // feathery strands off a central spine
      const t = R(), y = -t * h * .95, side = R() < .5 ? -1 : 1;
      const len = Math.max(0, 1 - Math.abs(t - .45) * 1.6) * w * .45 * R();
      g.strokeStyle = `rgba(255,255,255,${.4 + R() * .6})`; g.lineWidth = 1 + R();
      g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(side * len * .5, y - 6, side * len, y - 14 - R() * 10); g.stroke();
    }
    g.fillStyle = "#fff"; g.fillRect(-1, -h * .95, 2, h * .95);
  });
  const grassU = () => ({ uTime: {}, uGust: {}, uWind: {}, uBase: { value: P.grassBase }, uTip: { value: P.grassTip } });
  const grassMat = link(fogMat({ vertexShader: grassVS, fragmentShader: grassFS, uniforms: grassU(), side: THREE.DoubleSide }), ["uTime", "uGust", "uWind"]);
  const plumeMat = link(fogMat({ vertexShader: plumeVS, fragmentShader: plumeFS, uniforms: { ...grassU(), uMap: { value: plumeTex } }, side: THREE.DoubleSide }), ["uTime", "uGust", "uWind"]);
  for (const m of [grassMat, plumeMat]) { m.uniforms.uBase.value = P.grassBase; m.uniforms.uTip.value = P.grassTip; }
  plumeMat.uniforms.uMap.value = plumeTex;
  const chunks = [];
  {
    const GRASS = coarse ? 22000 : 70000, CELL = 32;
    const blade = new THREE.BufferGeometry();
    { const seg = 4, w = .055, pos = [], idx = [];
      for (let i = 0; i <= seg; i++) { const y = i / seg; pos.push(-w, y, 0, w, y, 0); }
      for (let i = 0; i < seg; i++) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
      blade.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); blade.setIndex(idx); }
    const card = new THREE.PlaneGeometry(1, 1); card.translate(0, .5, 0);
    const cells = new Map(), dir = new THREE.Vector3();
    let n = 0, guard = 0;
    while (n < GRASS && guard++ < GRASS * 5) {
      const u = .1 + Math.random() * .9;
      const c = camCurve.getPoint(u); camCurve.getTangent(u, dir);
      const side = (Math.random() < .5 ? -1 : 1) * Math.pow(Math.random(), 1.5) * 58;
      const x = c.x - dir.z * side + (Math.random() - .5) * 14, z = c.z + dir.x * side + (Math.random() - .5) * 14;
      if (z > 9) continue;
      if (Math.hypot(x - SHRINE.x, z - SHRINE.z) < 13) continue;
      if (z < -196 && z > -232 && Math.abs(x) < 2.8) continue;        // keep the stone stairs clear
      if (blocked(x, z)) continue;
      const forest = z < -100 && z > -195;
      if (forest && Math.random() < .55) continue;
      const pampas = z < -195;
      let h = pampas ? 1.3 + Math.random() * 1.1 : forest ? .5 + Math.random() * .6 : .8 + Math.random() * 1.0;
      if (Math.abs(side) < (pampas ? 4 : 2.2)) h *= pampas ? .4 : .55;
      const key = Math.floor(x / CELL) + "," + Math.floor(z / CELL);
      let cell = cells.get(key);
      if (!cell) cells.set(key, cell = { g: [], p: [], cx: (Math.floor(x / CELL) + .5) * CELL, cz: (Math.floor(z / CELL) + .5) * CELL });
      const y = H(x, z) - .05, yaw = Math.random() * 6.28, shade = Math.random();
      cell.g.push(x, y, z, yaw, h, shade);
      if (h > .9 && Math.random() < (pampas ? .3 : forest ? 0 : .07)) cell.p.push(x, y, z, yaw, h, Math.random());
      n++;
    }
    const makeInst = (base, data) => {
      const g = new THREE.InstancedBufferGeometry();
      g.index = base.index; g.attributes.position = base.attributes.position;
      const k = data.length / 6, off = new Float32Array(k * 4), shp = new Float32Array(k * 2);
      for (let i = 0; i < k; i++) {
        off[i * 4] = data[i * 6]; off[i * 4 + 1] = data[i * 6 + 1]; off[i * 4 + 2] = data[i * 6 + 2]; off[i * 4 + 3] = data[i * 6 + 3];
        shp[i * 2] = data[i * 6 + 4]; shp[i * 2 + 1] = data[i * 6 + 5];
      }
      g.setAttribute("offset", new THREE.InstancedBufferAttribute(off, 4));
      g.setAttribute("shape", new THREE.InstancedBufferAttribute(shp, 2));
      g.instanceCount = k; g.userData.full = k;
      return g;
    };
    for (const cell of cells.values()) {
      let ymin = Infinity, ymax = -Infinity;
      for (let i = 1; i < cell.g.length; i += 6) { ymin = Math.min(ymin, cell.g[i]); ymax = Math.max(ymax, cell.g[i]); }
      const sphere = new THREE.Sphere(new THREE.Vector3(cell.cx, (ymin + ymax) / 2 + 1, cell.cz), CELL * .75 + (ymax - ymin) / 2 + 3);
      const gm = new THREE.Mesh(makeInst(blade, cell.g), grassMat);
      gm.geometry.boundingSphere = sphere;
      scene.add(gm);
      const ch = { grass: gm, sphere };
      if (cell.p.length) {
        const pm = new THREE.Mesh(makeInst(card, cell.p), plumeMat);
        pm.geometry.boundingSphere = sphere;
        scene.add(pm); ch.plume = pm;
      }
      chunks.push(ch);
    }
  }

  /* ---- maple trees: branching bark + tinted leaf-cluster cards ---- */
  const leafTex = canvasTexture(256, 256, g => {
    const R = rng(3);
    for (let i = 0; i < 11; i++) {
      const a = R() * 6.28, r = R() * 70;
      g.fillStyle = `hsl(0,0%,${78 + R() * 22}%)`;
      mapleLeaf(g, 128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 26 + R() * 20, R() * 6.28);
    }
  });
  const cardMesh = (lOff, lRot, lCol, tex) => {
    const g = new THREE.InstancedBufferGeometry(), base = new THREE.PlaneGeometry(1, 1);
    g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
    g.setAttribute("lOff", new THREE.InstancedBufferAttribute(new Float32Array(lOff), 4));
    g.setAttribute("lRot", new THREE.InstancedBufferAttribute(new Float32Array(lRot), 3));
    g.setAttribute("lCol", new THREE.InstancedBufferAttribute(new Float32Array(lCol), 3));
    g.instanceCount = lOff.length / 4;
    const mat = link(fogMat({ vertexShader: leafCardVS, fragmentShader: leafCardFS, uniforms: { uTime: {}, uGust: {}, uWind: {}, uSunDir: {}, uSun: {}, uAmb: {}, uMap: { value: null } }, side: THREE.DoubleSide }), ["uTime", "uGust", "uWind", "uSunDir", "uSun", "uAmb"]);
    mat.uniforms.uMap.value = tex;
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    return mesh;
  };
  let leafMesh;
  {
    const R = rng(11);
    const variants = [
      treeVariant(21, { depth: 4, len: 2.4, rad: .32 }),
      treeVariant(37, { depth: 4, len: 2.1, rad: .3, spread: 1.4, lift: .2 }),
      treeVariant(53, { depth: 4, len: 2.7, rad: .34, spread: 1, lift: .45 }),
    ];
    const spots = [];
    // maples grow in clumps with glades between them, never inside the bamboo's clearing
    const want = coarse ? 70 : 150, ok = (x, z) => pathDist(x, z) >= 6 && !blocked(x, z) && !inGrove(x, z, 6) && spots.every(s => (s.x - x) ** 2 + (s.z - z) ** 2 > 2.8 * 2.8);
    for (let c = 0; spots.length < want && c < 400; c++) {
      const cx = (R() - .5) * 92, cz = -100 - R() * 100, n = 3 + (R() * 7 | 0), rad = 3 + R() * 5, gold = R() < .15;
      if (!ok(cx, cz)) continue;
      for (let i = 0, t = 0; i < n && t < 40 && spots.length < want; t++) {
        const a = R() * 6.28, r = Math.sqrt(R()) * rad, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (!ok(x, z)) continue;
        spots.push({ x, z, k: .8 + R() * .6, gold: gold ? R() < .7 : R() < .05 }); i++;
      }
    }
    for (const [x, z] of [[-14, -20], [18, -48], [-22, -78], [16, -92], [-14, -205], [15, -216], [-17, -246], [16, -250]]) spots.push({ x, z, k: 1.3, gold: z > -100 && R() < .5 });
    const byVar = variants.map(() => []);
    spots.forEach(s => byVar[(R() * variants.length) | 0].push(s));

    const reds = ["#b8321f", "#d4492a", "#e0683a", "#9e2a1a", "#c43e22", "#e88a3c", "#a8301c"].map(c => new THREE.Color(c));
    const golds = ["#e8b33c", "#d99a2b", "#f0c75a", "#c98a24"].map(c => new THREE.Color(c));
    const lOff = [], lRot = [], lCol = [];
    const tip = new THREE.Vector3();
    byVar.forEach((list, vi) => {
      if (!list.length) return;
      const trunks = new THREE.InstancedMesh(variants[vi].geo, M.bark, list.length);
      list.forEach((s, i) => {
        m4.compose(v3.set(s.x, H(s.x, s.z), s.z), q4.setFromAxisAngle(UP, R() * 6.28), s3.set(s.k, s.k, s.k));
        trunks.setMatrixAt(i, m4);
        const pal = s.gold ? golds : reds;
        for (const t of variants[vi].tips) {
          tip.copy(t).applyMatrix4(m4);
          for (let j = 0; j < 3; j++) {
            lOff.push(tip.x + (R() - .5) * 1.6 * s.k, tip.y + (R() - .3) * 1.1 * s.k, tip.z + (R() - .5) * 1.6 * s.k, (1.3 + R() * .9) * s.k);
            lRot.push(R() * 6.28, (R() - .5) * 1.6, R() * 6.28);
            const c = pal[(R() * pal.length) | 0], b = .8 + R() * .35;
            lCol.push(c.r * b, c.g * b, c.b * b);
          }
        }
      });
      trunks.computeBoundingSphere();
      scene.add(trunks);
    });
    leafMesh = cardMesh(lOff, lRot, lCol, leafTex);
    scene.add(leafMesh);
  }

  /* ---- black pines: crooked trunks, branches out to flat needle pads ---- */
  {
    const R = rng(29), spots = [];
    for (let tries = 0; spots.length < (coarse ? 16 : 30) && tries < 3000; tries++) {
      const coast = R() < .6;
      const x = coast ? (R() - .5) * 120 : (R() - .5) * 70, z = coast ? -10 + R() * 18 : -195 - R() * 70;
      if (pathDist(x, z) < 12 || H(x, z) < .3 || Math.hypot(x - SHRINE.x, z - SHRINE.z) < 14 || blocked(x, z)) continue;
      spots.push([x, z, .8 + R() * .45]);
    }
    const bark = kit(), lOff = [], lRot = [], lCol = [], pads = [];
    const greens = ["#2f4426", "#3a5230", "#28391f", "#45603a"].map(c => new THREE.Color(c));
    // a cloud pad: a main lobe the branch runs into, two smaller side lobes, a fringe of needle cards
    const addPad = (c, pr, a) => {
      pads.push([c[0], c[1] + pr * .1, c[2], a, pr, pr * .9]);
      for (const s of [-1, 1]) {
        if (c[2] > -20 && s > 0) continue;                                          // coastal pines: one side lobe is plenty
        const la = a + s * (1.2 + R() * .5), lr = pr * (.55 + R() * .15);
        pads.push([c[0] + Math.cos(la) * pr * .62, c[1] - pr * .04, c[2] + Math.sin(la) * pr * .62, R() * 6.28, lr, lr * .9]);
      }
      for (let q = 0; q < 3; q++) {
        const qa = q / 3 * 6.28 + R(), qr = pr * .9;
        lOff.push(c[0] + Math.cos(qa) * qr, c[1] + (R() - .3) * .15 * pr, c[2] + Math.sin(qa) * qr, pr * (.7 + R() * .3));
        lRot.push(R() * 6.28, Math.PI / 2 + (R() - .5) * .6, R() * 6.28);
        const g = greens[(R() * greens.length) | 0]; lCol.push(g.r, g.g, g.b);
      }
    };
    for (const [x, z, k] of spots) {
      let p = [x, H(x, z) - .3, z], lean = [(R() - .5) * .5, (R() - .5) * .5], r = .32 * k;
      const trunk = [p];
      for (let s = 0; s < 4; s++) {                                    // crooked, leaning trunk
        lean = [lean[0] + (R() - .5) * .5, lean[1] + (R() - .5) * .5];
        const l = (2.1 - s * .25) * k, n = [p[0] + lean[0] * l * .45, p[1] + l, p[2] + lean[1] * l * .45];
        bark.add(limb(p, n, r, r * .78, 8), M.pineBark);
        p = n; r *= .78; trunk.push(p);
      }
      const along = f => { const t = f * 4, i = Math.min(3, t | 0), u = t - i, A = trunk[i], B = trunk[i + 1]; return [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u]; };
      // tiers of branches spiral up the trunk, shorter and smaller toward the top
      const tiers = 3 + (R() < .6 ? 1 : 0), a0 = R() * 6.28;
      for (let j = 0; j < tiers; j++) {
        const from = along(.38 + j / tiers * .5), a = a0 + j * 2.4 + (R() - .5) * .5;
        const reach = (2.1 - j * .35 + R() * .5) * k;
        const mid = [from[0] + Math.cos(a) * reach * .5, from[1] - .1 * k, from[2] + Math.sin(a) * reach * .5];
        const end = [from[0] + Math.cos(a) * reach, from[1] + (.3 + R() * .3) * k, from[2] + Math.sin(a) * reach];
        bark.add(limb(from, mid, .12 * k, .085 * k, 6), M.pineBark).add(limb(mid, end, .085 * k, .05 * k, 6), M.pineBark);
        addPad(end, (1.15 - j * .15 + R() * .2) * k, a);
      }
      addPad(trunk[4], (.95 + R() * .25) * k, R() * 6.28);                // crown sits on the trunk tip
    }
    const pb = bark.build(), pc = cardMesh(lOff, lRot, lCol, TX.needles); pb.name = "pinebark"; pc.name = "pinecards";
    const padG = new THREE.IcosahedronGeometry(1, 1);
    { const a = padG.attributes.position;
      for (let i = 0; i < a.count; i++) { v3.fromBufferAttribute(a, i); const f = 1 + .14 * Math.sin(v3.x * 6 + v3.z * 4) * Math.cos(v3.y * 5 + v3.x * 2); a.setXYZ(i, v3.x * f, v3.y * f * .34, v3.z * f); }
      padG.computeVertexNormals();
      const col = [];                                                  // sunlit tops, shadowed undersides
      for (let i = 0; i < a.count; i++) { const k = .5 + .5 * sstep(-.25, .3, a.getY(i)); col.push(k, k, k); }
      padG.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); }
    const needleTex = canvasTexture(64, 64, g => { const r = rng(31); g.fillStyle = "#fff"; g.fillRect(0, 0, 64, 64); for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(0,0,0,${.15 + r() * .3})`; g.lineWidth = 1; const x = r() * 64, y = r() * 64, a = r() * 6.28; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); g.stroke(); } });
    needleTex.wrapS = needleTex.wrapT = THREE.RepeatWrapping;
    const padM = new THREE.InstancedMesh(padG, lam(0xffffff, { map: needleTex, vertexColors: true }), pads.length), tint = new THREE.Color();
    pads.forEach(([x, y, z, r, s, sy], i) => { place(padM, i, x, y, z, r, s, sy, s); padM.setColorAt(i, tint.copy(greens[i % greens.length]).multiplyScalar(1.2)); });
    padM.name = "pinepads";
    scene.add(pb, pc, padM);
  }

  /* ---- shoreline rocks: craggy, weathered, half-buried ---- */
  {
    const R = rng(41), n = 34;
    const rockG = new THREE.DodecahedronGeometry(1, 1);
    { const a = rockG.attributes.position;
      for (let i = 0; i < a.count; i++) { v3.fromBufferAttribute(a, i); const f = 1 + .22 * Math.sin(v3.x * 4.1 + v3.y * 2.3) * Math.cos(v3.z * 3.7 - v3.y) + .1 * Math.sin(v3.x * 9 + v3.z * 7); a.setXYZ(i, v3.x * f, v3.y * f * .8, v3.z * f); }
      rockG.computeVertexNormals(); }
    const rocks = new THREE.InstancedMesh(rockG, M.rock, n), tint = new THREE.Color();
    for (let i = 0, tries = 0; i < n && tries < 3000; tries++) {
      const x = (R() - .5) * 140, z = 9 + R() * 18;
      if (pathDist(x, z) < 9 || Math.hypot(x, z - 10) < 14 || blocked(x, z)) continue;
      const k = .3 + R() * R() * 1.6;
      place(rocks, i, x, Math.max(H(x, z), -.4) - k * .2, z, R() * 6, k * (1 + R() * .4), k * (.75 + R() * .35), k * (.9 + R() * .3), R() * .3, R() * .3);
      rocks.setColorAt(i, tint.setHSL(.07 + R() * .03, .08, .26 + R() * .16));
      i++;
    }
    scene.add(rocks);
  }

  /* ---- 1274: a fishing village burning on the shore ---- */
  {
    const R = rng(1274), smokes = [], flames = [], houses = [];
    for (const [x, z, ry, size, burnt] of VILLAGE) {
      const y = H(x, z) - .15;
      const g = house({ w: 5.6 * size, d: 4 * size, wall: 2.1, roofH: 2.6 * size, burnt, veranda: !burnt });
      g.position.set(x, y, z); g.rotation.y = ry; houses.push(g);
      if (burnt) {
        smokes.push([x, y + 4, z]);
        for (let f = 0; f < 3; f++) flames.push(x + (f - 1) * 1.6 * size, y + 2.6 + R() * .8, z + (R() - .5) * 1.6 * size, R() * 10);
      }
    }
    const village = bake(houses); village.name = "village"; scene.add(village);
    // beached boats and drying nets
    const boat = kit()
      .add(new THREE.ExtrudeGeometry(new THREE.Shape(V2([[-2.6, .5], [-2, 0], [2, 0], [2.8, .7], [2.9, .9], [-2.7, .8]])), { depth: 1.3, bevelEnabled: false }), M.wood, [0, 0, -.65])
      .add(new THREE.BoxGeometry(5, .08, 1.1), M.darkWood, [0, .7, 0]).build();
    stamp(scene, boat, [[33, H(33, 17), 17, .3], [44, H(44, 18), 18, -.2], [52, H(52, 16.5), 16.5, .5]].map(([x, y, z, r]) => [x, y + .1, z, r]));
    // the invaders' landing craft, run up at the waterline; some have caught fire
    const LANDING = [[-17, 23, 1.2, true], [-5, 25, -1.4, false], [9, 24, 1.1, false], [21, 22, -1.3, true], [64, 20, 1.5, false]];
    stamp(scene, boat, LANDING.map(([x, z, r]) => [x, Math.max(H(x, z), -.25) + .1, z, r, 1.45]));
    for (const [x, z, , burning] of LANDING) if (burning) {
      const y = Math.max(H(x, z), -.25) + .9;
      smokes.push([x, y + 2, z]);
      for (let f = 0; f < 2; f++) flames.push(x + (f - .5) * 2, y + R() * .4, z + (R() - .5), R() * 10);
    }
    for (const [x, z] of [[14, 15.5], [-9, 17.5], [27, 13.5]]) {                      // debris fires on the sand
      flames.push(x, H(x, z) + .9, z, R() * 10);
    }
    const net = kit();
    for (const [x, z] of [[38, 11], [48, 12]]) {
      const y = H(x, z);
      net.add(limb([x - 2, y, z], [x - 2, y + 2, z], .05, .05, 5), M.darkWood).add(limb([x + 2, y, z], [x + 2, y + 2, z], .05, .05, 5), M.darkWood)
         .add(limb([x - 2, y + 2, z], [x + 2, y + 2, z], .03, .03, 4), M.darkWood)
         .add(new THREE.PlaneGeometry(4, 1.6, 1, 1), lam(0x3c3326, { side: THREE.DoubleSide, transparent: true, opacity: .55 }), [x, y + 1.2, z]);
    }
    scene.add(net.build());

    // fire: billboard flames shaped by noise, additive
    const base = new THREE.PlaneGeometry(1, 1), fg = new THREE.InstancedBufferGeometry();
    fg.index = base.index; fg.attributes.position = base.attributes.position;
    fg.setAttribute("fBase", new THREE.InstancedBufferAttribute(new Float32Array(flames), 4));
    fg.instanceCount = flames.length / 4;
    const fire = new THREE.Mesh(fg, new THREE.ShaderMaterial({ vertexShader: fireVS, fragmentShader: fireFS, uniforms: { uTime: S.uTime, uNoise: S.uNoise }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    fire.frustumCulled = false; fire.renderOrder = 3; fire.name = "fire";
    scene.add(fire);

    const per = 7, sg = new THREE.InstancedBufferGeometry();
    sg.index = base.index; sg.attributes.position = base.attributes.position;
    const arr = [];
    smokes.forEach(([x, y, z]) => { for (let k = 0; k < per; k++) arr.push(x, y, z, k / per + R() * .03); });
    sg.setAttribute("sBase", new THREE.InstancedBufferAttribute(new Float32Array(arr), 4));
    sg.instanceCount = arr.length / 4;
    const mat = link(fogMat({ vertexShader: smokeVS, fragmentShader: smokeFS, uniforms: { uTime: {}, uNoise: {}, uTint: { value: null } }, transparent: true, depthWrite: false }), ["uTime", "uNoise"]);
    mat.uniforms.uTint.value = P.fog;
    const smoke = new THREE.Mesh(sg, mat);
    smoke.frustumCulled = false; smoke.renderOrder = 2; smoke.name = "smoke";
    scene.add(smoke);
  }

  /* ---- the battle on Komoda beach: samurai against the landing force ---- */
  const battle = new THREE.Group(); battle.name = "battle";
  {
    const R = rng(1281), vc = lam(0xffffff, { vertexColors: true });
    const paint = (geo, hex) => { const g = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.toArray(a, i * 3); g.setAttribute("color", new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute("uv"); return g; };
    const at = (g, p, r = [0, 0, 0], s = [1, 1, 1]) => g.applyMatrix4(m4.compose(v3.set(...p), q4.setFromEuler(e3.set(...r)), s3.set(...s)));
    const body = parts => mergeGeometries(parts.map(([geo, hex, p, r, s]) => paint(at(geo, p, r, s), hex)));
    // samurai: hakama legs, laced skirt, cuirass, shoulder boards, kabuto with flared neck guard and crest
    const samurai = lace => body([
      [new THREE.CylinderGeometry(.09, .12, .62, 6), "#1f1a17", [.13, .31, .05], [0, 0, -.12]], [new THREE.CylinderGeometry(.09, .12, .62, 6), "#1f1a17", [-.13, .31, -.08], [0, 0, .12]],
      [new THREE.BoxGeometry(.12, .06, .24), "#8a7752", [.15, .03, .1]], [new THREE.BoxGeometry(.12, .06, .24), "#8a7752", [-.16, .03, -.04]],
      [new THREE.CylinderGeometry(.24, .36, .36, 8, 1, true), lace, [0, .8, 0]],
      [new THREE.CylinderGeometry(.24, .23, .5, 8), lace, [0, 1.2, 0], [0, 0, 0], [1, 1, .8]],
      [new THREE.BoxGeometry(.26, .05, .2), "#c9a24c", [0, 1.42, .12]],
      [new THREE.BoxGeometry(.13, .26, .26), lace, [.3, 1.3, 0], [0, 0, -.25]], [new THREE.BoxGeometry(.13, .26, .26), lace, [-.3, 1.3, 0], [0, 0, .25]],
      [new THREE.SphereGeometry(.1, 8, 6), "#6b4a38", [0, 1.58, .02]],
      [new THREE.SphereGeometry(.13, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), "#151312", [0, 1.62, 0]],
      [new THREE.CylinderGeometry(.14, .25, .14, 10, 1, true), "#151312", [0, 1.55, -.02]],
      [new THREE.BoxGeometry(.03, .16, .02), "#c9a24c", [.05, 1.78, .12], [-.2, 0, -.4]], [new THREE.BoxGeometry(.03, .16, .02), "#c9a24c", [-.05, 1.78, .12], [-.2, 0, .4]],
    ]);
    // Yuan–Goryeo soldier: boots, long padded coat, lamellar vest, round shield, conical helmet with a red tassel
    const invader = coat => body([
      [new THREE.CylinderGeometry(.08, .1, .55, 6), "#2a2018", [.12, .28, .04], [0, 0, -.1]], [new THREE.CylinderGeometry(.08, .1, .55, 6), "#2a2018", [-.12, .28, -.06], [0, 0, .1]],
      [new THREE.CylinderGeometry(.22, .38, .62, 8, 1, true), coat, [0, .78, 0]],
      [new THREE.CylinderGeometry(.22, .23, .5, 8), "#4a4038", [0, 1.22, 0], [0, 0, 0], [1, 1, .8]],
      [new THREE.CylinderGeometry(.26, .26, .05, 8), "#2a2018", [0, 1.0, 0]],
      [new THREE.CylinderGeometry(.3, .3, .05, 12), "#5a3a22", [.32, 1.12, .12], [0, 0, Math.PI / 2 - .2]],          // round shield on the left arm
      [new THREE.SphereGeometry(.035, 6, 4), "#8a8070", [.35, 1.12, .12]],
      [new THREE.SphereGeometry(.1, 8, 6), "#7a5a44", [0, 1.57, .02]],
      [new THREE.ConeGeometry(.14, .26, 8), "#595550", [0, 1.75, 0]], [new THREE.CylinderGeometry(.17, .17, .03, 10), "#595550", [0, 1.63, 0]],
      [new THREE.ConeGeometry(.04, .14, 5), "#a8261b", [0, 1.95, 0], [Math.PI, 0, 0]],
    ]);
    // weapon arms: both arms and the blade/spear, pivoting at the shoulders (local origin)
    const katanaArms = body([
      [new THREE.CylinderGeometry(.05, .045, .55, 5), "#3a3532", [.1, -.22, .14], [.9, 0, .3]], [new THREE.CylinderGeometry(.05, .045, .55, 5), "#3a3532", [-.1, -.22, .14], [.9, 0, -.3]],
      [new THREE.BoxGeometry(.035, .32, .03), "#1b1714", [0, -.36, .52], [1.6, 0, 0]],
      [new THREE.BoxGeometry(.03, .95, .008), "#d8d6d0", [0, -.36, 1.15], [1.6, 0, 0]],
    ]);
    const spearArms = body([
      [new THREE.CylinderGeometry(.05, .045, .55, 5), "#4a4038", [-.1, -.22, .14], [.9, 0, -.3]],
      [new THREE.CylinderGeometry(.018, .018, 2.4, 5), "#4a3422", [-.08, -.36, .6], [1.6, 0, 0]],
      [new THREE.ConeGeometry(.035, .22, 5), "#c8c6c0", [-.08, -.39, 1.9], [Math.PI / 2 + .03, 0, 0]],
    ]);
    const daoArms = body([
      [new THREE.CylinderGeometry(.05, .045, .55, 5), "#4a4038", [-.1, -.22, .14], [.9, 0, -.3]],
      [new THREE.BoxGeometry(.04, .78, .01), "#cfcdc6", [-.1, -.36, .9], [1.5, 0, 0]],
    ]);
    // pick spots on the sand, in pairs facing each other
    const BOATS = [[-17, 23], [-5, 25], [9, 24], [21, 22], [64, 20], [33, 17], [44, 18], [52, 16.5]];
    const spots = [], ok = (x, z) => { const h = H(x, z); return h > .45 && h < 3 && pathDist(x, z) > 9 && !blocked(x, z) && BOATS.every(([a, b]) => (a - x) ** 2 + (b - z) ** 2 > 4.5 * 4.5) && spots.every(([a, b]) => (a - x) ** 2 + (b - z) ** 2 > 3.2 * 3.2); };   // dry sand, clear of the boats
    for (let t = 0; spots.length < (coarse ? 12 : 22) && t < 4000; t++) {
      const x = -30 + R() * 100, z = 9 + R() * 14;
      if (ok(x, z)) spots.push([x, z, R() * 6.28]);
    }
    // a fighter = body + arms in one geometry; aArm marks the arm vertices the shader swings at the shoulder
    const fighter = (bodyG, armsG) => {
      const flag = (g, v) => { g.setAttribute("aArm", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1)); return g; };
      return mergeGeometries([flag(bodyG.clone(), 0), flag(armsG.clone(), 1)]);
    };
    const KINDS = [fighter(samurai("#a8261b"), katanaArms), fighter(samurai("#2e4a86"), katanaArms), fighter(invader("#6b4a2a"), spearArms), fighter(invader("#4a3a2a"), daoArms)];
    const lists = KINDS.map(() => []);
    spots.forEach(([x, z, a], i) => {
      const dx = Math.cos(a) * .8, dz = Math.sin(a) * .8, phase = R() * 6.28, rate = 1.1 + R() * .5;
      lists[i % 2].push([x - dx, z - dz, Math.atan2(dx, dz), phase, rate, 0]);                    // samurai
      lists[2 + (i % 3 ? 0 : 1)].push([x + dx, z + dz, Math.atan2(-dx, -dz), phase, rate, 1, i % 3 ? 1 : 0]);   // his opponent shares the rhythm; kind 2 carries a spear
    });
    // the exchange runs in the vertex shader: the attacker winds up and cuts, the defender braces; turns alternate
    const fightM = lam(0xffffff, { vertexColors: true });
    fightM.onBeforeCompile = sh => {
      sh.uniforms.uTime = S.uTime;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>
          attribute float aArm; attribute vec4 aFight; uniform float uTime;
          mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }`)
        .replace("#include <beginnormal_vertex>", `
          float ph = uTime * aFight.y + aFight.x, s = mod(ph, PI) / PI;
          bool attacking = (mod(floor(ph / PI), 2.) < .5) == (aFight.z < .5);
          float cut = s < .62 ? 0. : pow((s - .62) / .38, .6), sw = sin(cut * PI);
          bool spear = aFight.w > .5;
          float lunge = attacking ? (spear ? .42 : .28) * sw : -.14 * sw, lean = attacking ? .1 * cut : -.06 * cut;
          // blades: raise overhead, cut down through guard; spears: level, drive forward; defenders hold a forward guard
          float arm = spear ? (attacking ? mix(-.3 * smoothstep(0., .62, s), .08, cut) : -.22 + .06 * sin(ph * 2.))
                            : (attacking ? mix(-1.65 * smoothstep(0., .62, s), .45, cut) : -.35 + .12 * sin(ph * 2.));
          mat3 rArm = rotX(aArm > .5 ? arm : 0.), rLean = rotX(lean);
          vec3 objectNormal = rLean * rArm * normal;
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3(tangent.xyz);
          #endif`)
        .replace("#include <begin_vertex>", `
          vec3 transformed = rLean * (rArm * position + vec3(0., aArm * 1.42, 0.));
          transformed.z += lunge;`);
    };
    KINDS.forEach((geo, k) => {
      const list = lists[k]; if (!list.length) return;
      const g = geo.clone(), im = new THREE.InstancedMesh(g, fightM, list.length);
      g.setAttribute("aFight", new THREE.InstancedBufferAttribute(new Float32Array(list.flatMap(f => [f[3], f[4], f[5], f[6] || 0])), 4));
      list.forEach(([x, z, face], i) => place(im, i, x, H(x, z) - .02, z, face));
      im.computeBoundingSphere(); im.boundingSphere.radius += 2;               // room for lunges and raised blades
      battle.add(im);
    });
    // everything that does not move is baked into one mesh: the fallen, arrows in the sand, banners
    const still = [], put = (geo, x, y, z, ry, rx = 0, rz = 0) => still.push(geo.clone().applyMatrix4(m4.compose(v3.set(x, y, z), q4.setFromEuler(e3.set(rx, ry, rz)), s3.set(1, 1, 1))));
    for (let t = 0, n = 0; n < (coarse ? 6 : 12) && t < 2000; t++) {
      const x = -30 + R() * 100, z = 8 + R() * 15;
      if (!ok(x, z)) continue;
      spots.push([x, z]); put(n % 2 ? samurai("#a8261b") : invader("#6b4a2a"), x, H(x, z) + .14, z, R() * 6.28, Math.PI / 2, (R() - .5) * .4); n++;
    }
    const arrowG = body([[new THREE.CylinderGeometry(.008, .008, .8, 4), "#3a2c1e", [0, .4, 0]], [new THREE.BoxGeometry(.05, .1, .005), "#d8d0c0", [0, .76, 0]]]);
    for (let i = 0; i < (coarse ? 60 : 140); i++) { let x, z; do { x = -32 + R() * 104; z = 7 + R() * 17; } while (H(x, z) < .1 || blocked(x, z)); put(arrowG, x, H(x, z) - .15, z, R() * 6.28, (R() - .5) * .9, (R() - .5) * .9); }
    const flagG = (hex, dot) => body([[new THREE.CylinderGeometry(.025, .025, 4.2, 5), "#2a2018", [0, 2.1, 0]], [new THREE.BoxGeometry(.7, 1.9, .02), hex, [.37, 3, 0]], [new THREE.CylinderGeometry(.18, .18, .025, 12), dot, [.37, 3.4, .02], [Math.PI / 2, 0, 0]]]);
    for (const [geo, n, side] of [[flagG("#ece6d8", "#a8261b"), 5, -1], [flagG("#2a1612", "#c9a24c"), 6, 1]]) {
      for (let i = 0; i < n; i++) { let x, z; do { x = -28 + R() * 96; z = side < 0 ? 8 + R() * 5 : 17 + R() * 6; } while (H(x, z) < .1 || blocked(x, z) || pathDist(x, z) < 9); put(geo, x, H(x, z) - .1, z, R() * 6.28); }
    }
    battle.add(new THREE.Mesh(mergeGeometries(still), vc));
    scene.add(battle);
  }

  /* ---- the 1274 fleet: junks with battened sails ---- */
  {
    const n = 34;
    const hull = new THREE.ExtrudeGeometry(new THREE.Shape(V2([[-4.6, 1.4], [-3.4, 0], [3.2, 0], [4.8, 1.8], [4.9, 2.2], [-4.8, 1.9]])), { depth: 2.2, bevelEnabled: false }); hull.translate(0, -.6, -1.1);
    const mast = new THREE.CylinderGeometry(.08, .11, 9, 5); mast.translate(0, 5.6, 0);
    const sail = new THREE.ShapeGeometry(new THREE.Shape(V2([[-2.4, 2.6], [2.3, 2.6], [1.8, 9.6], [-1.9, 9.1]])));
    { const uv = sail.attributes.uv, p = sail.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + 2.4) / 4.7, (p.getY(i) - 2.6) / 7); }
    const sailTex = canvasTexture(64, 128, (g, w, h) => {
      g.fillStyle = "#3a2c22"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#16100c"; for (let y = 6; y < h; y += 14) g.fillRect(0, y, w, 3);   // battens
    });
    const sailM = new THREE.MeshBasicMaterial({ map: sailTex, side: THREE.DoubleSide });
    const parts = [new THREE.InstancedMesh(hull, M.hull, n), new THREE.InstancedMesh(mast, M.hull, n), new THREE.InstancedMesh(sail, sailM, n)];
    const R = rng(9);
    for (let i = 0; i < n; i++) {
      const z = 210 + R() * 300, x = (R() - .5) * z * 1.5, k = 1.1 + R() * .6;
      m4.compose(v3.set(x, .1, z), q4.setFromAxisAngle(UP, Math.PI / 2 + (R() - .5) * .9), s3.set(k, k, k));
      parts.forEach(p => p.setMatrixAt(i, m4));
    }
    scene.add(...parts);
  }

  // stone lantern (tōrō) turned on a lathe; the fire box glows at night
  const lanternKit = kit()
    .add(new THREE.LatheGeometry(V2([[0, 0], [.42, 0], [.42, .18], [.26, .26], [.16, .3], [.13, .95], [.22, 1.05], [.36, 1.12], [.36, 1.2], [0, 1.2]]), 6), M.stone)
    .add(new THREE.LatheGeometry(V2([[0, 0], [.62, 0], [.5, .1], [.18, .34], [.08, .42], [.12, .5], [.06, .62], [0, .66]]), 6), M.stone, [0, 1.69, 0])
    .add(new THREE.BoxGeometry(.5, .48, .5), M.lantern, [0, 1.45, 0])
    .build();
  let shrineGate;

  /* ---- shrine: stairs, banners, torii, lanterns, hall ---- */
  {
    const R = rng(5);
    const steps = [];
    for (let z = -197; z > -227; z -= .85) steps.push(z);
    const stepM = new THREE.InstancedMesh(new THREE.BoxGeometry(4.2, .5, 1.05), M.steps, steps.length);
    const tint = new THREE.Color();
    steps.forEach((z, i) => {
      place(stepM, i, (R() - .5) * .1, H(0, z) - .12, z, (R() - .5) * .04, 1 - R() * .06, 1, 1);
      stepM.setColorAt(i, tint.setHSL(.09, .05, .33 + R() * .14));       // weathered stone, step by step
    });
    scene.add(stepM);

    // nobori banners up the stairs
    const bannerTex = canvasTexture(64, 256, (g, w, h) => {
      g.fillStyle = "#f1ece0"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#1c2440"; g.fillRect(0, 0, w, h * .14);
      g.fillStyle = "#b8321f"; g.beginPath(); g.arc(w / 2, h * .28, w * .26, 0, 7); g.fill();
      g.fillStyle = "#1c1a18"; g.font = `700 ${w * .62}px "Shippori Mincho B1", serif`; g.textAlign = "center";
      ["風", "神", "社"].forEach((c, i) => g.fillText(c, w / 2, h * (.55 + i * .17)));
    });
    const bannerMat = clothMat(bannerTex);
    const bannerG = new THREE.PlaneGeometry(.95, 3.4, 4, 12); bannerG.translate(.5, 0, 0);
    const poleG = new THREE.CylinderGeometry(.05, .06, 5.4, 6);
    for (const [x, z] of [[-3.4, -200], [3.4, -205], [-3.4, -211], [3.4, -217], [-3.4, -223]]) {
      const y = H(x, z);
      const pole = new THREE.Mesh(poleG, M.darkWood); pole.position.set(x, y + 2.7, z);
      const b = new THREE.Mesh(bannerG, bannerMat); b.position.set(x, y + 3.6, z); b.rotation.y = x < 0 ? -.4 : Math.PI + .4;
      scene.add(pole, b);
    }

    // torii with an upswept kasagi
    const gate = new THREE.Group();
    const pillar = new THREE.CylinderGeometry(.3, .38, 7, 14), footG = new THREE.CylinderGeometry(.5, .52, .55, 14);
    for (const x of [-3.3, 3.3]) {
      const p = new THREE.Mesh(pillar, M.vermilion); p.position.set(x, 3.5, 0); gate.add(p);
      const f = new THREE.Mesh(footG, M.lacquer); f.position.set(x, .27, 0); gate.add(f);
    }
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(8.6, .42, .34), M.vermilion); nuki.position.y = 5.3; gate.add(nuki);
    const beam = (w, top, under, curve, depth) => {
      const s = new THREE.Shape(), N = 24;
      for (let i = 0; i <= N; i++) { const x = -w / 2 + w * i / N, u = Math.pow(Math.abs(x) / (w / 2), 4); s[i ? "lineTo" : "moveTo"](x, under + u * curve); }
      for (let i = N; i >= 0; i--) { const x = -w / 2 + w * i / N, u = Math.pow(Math.abs(x) / (w / 2), 4); s.lineTo(x, top + u * curve * 1.25); }
      const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }); g.translate(0, 0, -depth / 2);
      return g;
    };
    gate.add(new THREE.Mesh(beam(9.6, 6.95, 6.55, .35, .74), M.vermilion));
    gate.add(new THREE.Mesh(beam(10.6, 7.5, 6.95, .55, .92), M.lacquer));
    const strut = new THREE.Mesh(new THREE.BoxGeometry(.3, 1.2, .3), M.vermilion); strut.position.y = 5.95; gate.add(strut);
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(.85, 1.05, .14), M.lacquer); plaque.position.set(0, 6.0, .2); gate.add(plaque);
    // shimenawa: straw rope sagging between the pillars, with zigzag paper streamers
    const rope = new THREE.CatmullRomCurve3([[-3.1, 4.75], [-1.5, 4.35], [0, 4.2], [1.5, 4.35], [3.1, 4.75]].map(([x, y]) => new THREE.Vector3(x, y, .1)));
    gate.add(new THREE.Mesh(new THREE.TubeGeometry(rope, 40, .14, 8), M.straw));
    const zigG = new THREE.ShapeGeometry(new THREE.Shape(V2([[0, 0], [.22, 0], [.22, -.28], [.08, -.28], [.08, -.56], [.24, -.56], [.24, -.86], [.1, -.86], [.1, -1.1], [-.04, -1.1], [-.04, -.82], [.1, -.82], [.1, -.6], [-.06, -.6], [-.06, -.3], [0, -.3]])));
    for (const x of [-1.9, -.6, .6, 1.9]) { const z = new THREE.Mesh(zigG, M.paper); z.position.set(x - .1, rope.getPoint((x + 3.1) / 6.2).y - .1, .2); gate.add(z); }
    gate.position.set(SHRINE.x, SHRINE.y, SHRINE.z - 5);
    shrineGate = gate;
    scene.add(gate);

    // stone lanterns (tōrō) turned on a lathe
    const sp = [[-5.4, -214], [5.4, -214], [-5.4, -222], [5.4, -222], [-5.4, -230], [5.4, -230], [-6, -248], [6, -248]];
    const bt = BR.dir, bn = [-bt.y, bt.x];
    for (const s of [-1, 1]) for (const l of [-1, 1]) sp.push([BR.x + bt.x * s * (BR.half + 2.2) + bn[0] * l * 3.6, BR.z + bt.y * s * (BR.half + 2.2) + bn[1] * l * 3.6]);
    stamp(scene, lanternKit, sp.map(([x, z]) => [x, H(x, z), z, Math.PI / 6, 1.25]));

    // the hall behind the gate: raised floor, posts, a deep curved roof
    const hall = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 1.6, 7.5), M.stone); floor.position.y = .1; hall.add(floor);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(9.4, .2, 7), M.wood); deck.position.y = 1; hall.add(deck);
    const postG = new THREE.CylinderGeometry(.16, .16, 3.4, 8);
    for (const x of [-4.2, -1.4, 1.4, 4.2]) for (const z of [-3, 3]) { const p = new THREE.Mesh(postG, M.vermilion); p.position.set(x, 2.8, z); hall.add(p); }
    const wall = new THREE.Mesh(new THREE.BoxGeometry(8.2, 3.2, 5.6), M.darkWood); wall.position.y = 2.7; hall.add(wall);
    const doors = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.4), M.paper); doors.position.set(0, 2.5, 2.81); hall.add(doors);
    const roofS = new THREE.Shape(), N = 20, RW = 6.6, RH = 3.6;
    const ry = (x, off) => { const a = Math.abs(x) / RW; return RH * (1 - Math.pow(a, .6)) + .25 * Math.pow(a, 6) + off; };
    for (let i = 0; i <= N; i++) { const x = -RW + 2 * RW * i / N; roofS[i ? "lineTo" : "moveTo"](x, ry(x, 0)); }
    for (let i = N; i >= 0; i--) { const x = -RW + 2 * RW * i / N; roofS.lineTo(x * .97, ry(x, -.45)); }
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofS, { depth: 11.5, bevelEnabled: false }), M.roof);
    roof.rotation.y = Math.PI / 2; roof.position.set(5.75, 4.3, 0);
    hall.add(roof);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(12, .35, .5), M.lacquer); ridge.position.y = 4.3 + RH + .05; hall.add(ridge);
    hall.rotation.y = Math.PI / 2;
    hall.position.set(SHRINE.x, H(SHRINE.x, SHRINE.z - 15), SHRINE.z - 15);
    scene.add(hall);
  }


  /* ---- the valley: paddies, pagoda, roadside shrine, river, bridge, farmhouse, bamboo ---- */
  let wheel;
  {
    const R = rng(77);
    const earth = lam(0x4a3524), plaster = lam(0xe8e0cf), sprout = lam(0x6f8f3a), redCloth = lam(0xb02a1c);

    // rice paddies: still water at each terrace level, earthen bunds, rows of seedlings
    const pg = [], bunds = [], sprouts = [];
    for (const p of PADDIES) {
      const g = new THREE.PlaneGeometry(p.x1 - p.x0, p.z0 - p.z1); g.rotateX(-Math.PI / 2);
      g.translate((p.x0 + p.x1) / 2, p.y + .06, (p.z0 + p.z1) / 2); pg.push(g);
      bunds.push([(p.x0 + p.x1) / 2, p.y, p.z0 + .2, 0, 6.6], [(p.x0 + p.x1) / 2, p.y, p.z1 - .2, 0, 6.6], [p.x0 - .2, p.y, (p.z0 + p.z1) / 2, Math.PI / 2, 7.4], [p.x1 + .2, p.y, (p.z0 + p.z1) / 2, Math.PI / 2, 7.4]);
      for (let a = 0; a < 6; a++) for (let b = 0; b < 7; b++) sprouts.push([p.x0 + .6 + a * .95 + (R() - .5) * .15, p.y + .02, p.z0 - .5 - b * .93 + (R() - .5) * .15, R() * 6]);
    }
    scene.add(new THREE.Mesh(mergeGeometries(pg), waterM));
    const bundM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .5, .55), earth, bunds.length);
    bunds.forEach(([x, y, z, ry, len], i) => place(bundM, i, x, y, z, ry, len, 1, 1));
    const sproutG = new THREE.ConeGeometry(.09, .42, 3); sproutG.translate(0, .21, 0);
    const sproutM = new THREE.InstancedMesh(sproutG, sprout, sprouts.length);
    sprouts.forEach(([x, y, z, r], i) => place(sproutM, i, x, y, z, r));
    scene.add(bundM, sproutM);

    // five-storey pagoda on the valley wall
    {
      const k = kit(), [px, pz] = SPOTS.pagoda;
      k.add(new THREE.BoxGeometry(6.6, 1.2, 6.6), M.stone, [0, .2, 0]);
      let y = .8;
      for (let i = 0; i < 5; i++) {
        const w = 5 - i * .55, bh = 1.7 - i * .08;
        k.add(new THREE.BoxGeometry(w * .62, bh, w * .62), M.vermilion, [0, y + bh / 2, 0]);
        k.add(new THREE.BoxGeometry(w * .5, bh * .7, w * .63), plaster, [0, y + bh * .45, 0]);
        const roof = new THREE.LatheGeometry(V2([[0, .9], [w * .3, .72], [w * .58, .3], [w * .76, .06], [w * .8, .1], [w * .82, 0], [0, -.05]]), 4, Math.PI / 4);
        k.add(roof, M.roof, [0, y + bh, 0]);
        y += bh + .62;
      }
      k.add(new THREE.CylinderGeometry(.07, .1, 4.6, 6), M.straw, [0, y + 2, 0]);
      for (let i = 0; i < 7; i++) k.add(new THREE.TorusGeometry(.32 - i * .02, .05, 4, 10), M.straw, [0, y + .9 + i * .42, 0], [Math.PI / 2, 0, 0]);
      const g = k.build(); g.position.set(px, H(px, pz) - .3, pz); g.rotation.y = .3; g.scale.setScalar(1.25);
      scene.add(g);
    }

    // roadside shrine (hokora) with a small torii facing the road
    {
      const [hx, hz] = SPOTS.hokora, y = H(hx, hz);
      const k = kit()
        .add(new THREE.BoxGeometry(.9, .9, .9), M.stone, [0, .45, 0])
        .add(new THREE.BoxGeometry(1.1, .9, .9), M.wood, [0, 1.35, 0])
        .add(new THREE.BoxGeometry(.6, .5, .05), M.paper, [0, 1.38, .46])
        .add(new THREE.ConeGeometry(1.05, .7, 4, 1), M.roof, [0, 2.15, 0], [0, Math.PI / 4, 0], [1.2, 1, 1]);
      const g = k.build(); g.position.set(hx, y, hz); g.rotation.y = 1.2; scene.add(g);
      const t = shrineGate.clone(); t.scale.setScalar(.34); t.position.set(hx + 2.4, H(hx + 2.4, hz + .6), hz + .6); t.rotation.y = 1.2 + Math.PI / 2; scene.add(t);
    }

    // stone Jizō: robed monk figures on plinths, red bibs and caps
    {
      const stone = lam(0x8f897d), red = lam(0xa8261b, { side: THREE.DoubleSide });
      const k = kit()
        .add(new THREE.CylinderGeometry(.3, .34, .16, 10), M.stone, [0, .08, 0])
        .add(new THREE.LatheGeometry(V2([[0, .16], [.17, .16], [.2, .2], [.215, .38], [.2, .56], [.15, .66], [.09, .7], [0, .71]]), 16), stone)
        .add(new THREE.SphereGeometry(.105, 14, 10), stone, [0, .8, .005], [0, 0, 0], [1, 1.12, 1])
        .add(new THREE.SphereGeometry(.04, 8, 6), stone, [0, .52, .19])
        .add(new THREE.CylinderGeometry(.11, .23, .22, 14, 1, true, -Math.PI * .8, Math.PI * 1.6), red, [0, .57, .01])
        .add(new THREE.SphereGeometry(.112, 14, 8, 0, Math.PI * 2, 0, Math.PI * .5), red, [0, .82, 0]);
      stamp(scene, k.build(), SPOTS.jizo.map(([x, z]) => [x, H(x, z), z, Math.atan2(BR.x - x, BR.z - z) * 0 + (x > 0 ? -1.3 : 1.3), 1.25]));
    }

    // the river: a ribbon of water following its channel
    {
      const pos = [], idx = [];
      for (let i = 0, x = -150; x <= 150; x += 2.5, i++) {
        const zc = RIVER_Z(x), y = Hland(x, zc) - 1.25;
        pos.push(x, y, zc - 4.3, x, y, zc + 4.3);
        if (x < 150) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      scene.add(new THREE.Mesh(g, waterM));
    }

    // vermilion arched bridge (taikobashi); the camera rides over its deck
    {
      const k = kit(), H2 = BR.half, N = 26;
      const arc = s => .35 + 1.5 * Math.cos(s / H2 * Math.PI / 2);
      for (let i = 0; i < N; i++) {
        const s = -H2 + (i + .5) * (2 * H2 / N), slope = Math.atan(-1.5 * Math.PI / 2 / H2 * Math.sin(s / H2 * Math.PI / 2));
        k.add(new THREE.BoxGeometry(3.1, .14, 2 * H2 / N * 1.04), M.wood, [0, arc(s) - .07, s], [-slope, 0, 0]);
      }
      for (const side of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 16; i++) { const s = -H2 + i * H2 / 8; pts.push(new THREE.Vector3(side * 1.5, arc(s) + .85, s)); }
        k.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, .06, 6), M.vermilion);
        const low = pts.map(p => new THREE.Vector3(p.x, p.y - .45, p.z));
        k.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(low), 40, .04, 5), M.vermilion);
        for (let i = 0; i <= 8; i++) {
          const s = -H2 + i * H2 / 4;
          k.add(new THREE.CylinderGeometry(.08, .08, 1, 6), M.vermilion, [side * 1.5, arc(s) + .45, s]);
          if (i === 0 || i === 8) k.add(new THREE.LatheGeometry(V2([[0, 0], [.13, .02], [.16, .12], [.1, .26], [.02, .4], [0, .42]]), 8), M.straw, [side * 1.5, arc(s) + .95, s]);
        }
        for (const s of [-H2 * .55, 0, H2 * .55]) k.add(new THREE.CylinderGeometry(.16, .18, 3.2, 8), M.darkWood, [side * 1.2, arc(s) - 1.7, s]);
      }
      const g = k.build(); g.position.set(BR.x, BR.yb, BR.z); g.rotation.y = Math.atan2(BR.dir.x, BR.dir.y);
      scene.add(g);
    }

    // thatched farmhouse (minka) with a waterwheel turning in the river
    {
      const [mx, mz] = SPOTS.minka, y = H(mx, mz);
      const g = house({ w: 9, d: 6, wall: 2.6, roofH: 4.6 }); g.position.set(mx, y, mz); g.rotation.y = -.25; scene.add(g);

      const wk = kit();
      for (const z of [-.45, .45]) wk.add(new THREE.TorusGeometry(2.3, .08, 5, 28), M.wood, [0, 0, z]);
      for (let i = 0; i < 8; i++) wk.add(new THREE.BoxGeometry(.1, 4.6, .1), M.wood, [0, 0, 0], [0, 0, i / 8 * Math.PI]);
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; wk.add(new THREE.BoxGeometry(.7, .08, 1.1), M.darkWood, [Math.cos(a) * 2.35, Math.sin(a) * 2.35, 0], [0, 0, a]); }
      wk.add(new THREE.CylinderGeometry(.14, .14, 1.4, 8), M.darkWood, [0, 0, 0], [Math.PI / 2, 0, 0]);
      wheel = wk.build();
      const [wx, wz] = SPOTS.wheel;
      wheel.position.set(wx, Hland(wx, RIVER_Z(wx)) - .6, wz); wheel.rotation.y = Math.PI / 2;
      const spin = new THREE.Group(); spin.add(...wheel.children); wheel.add(spin); wheel.userData.spin = spin;
      scene.add(wheel);
      // stilts carrying the axle
      const st = kit().add(new THREE.BoxGeometry(.2, 3.4, .2), M.darkWood, [-.85, -.4, 0]).add(new THREE.BoxGeometry(.2, 3.4, .2), M.darkWood, [.85, -.4, 0]).build();
      st.position.copy(wheel.position); st.rotation.y = wheel.rotation.y; scene.add(st);
    }

    // bamboo grove on the left before the maples
    {
      const stalkTex = canvasTexture(8, 128, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, 0);
        gr.addColorStop(0, "#5d7a30"); gr.addColorStop(.5, "#9bb25a"); gr.addColorStop(1, "#4d6626");
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = "#3a4d1c"; for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 3);   // nodes
      });
      stalkTex.wrapT = THREE.RepeatWrapping; stalkTex.repeat.set(1, 4);
      const spots = [];
      for (let t = 0; spots.length < (coarse ? 90 : 190) && t < 6000; t++) {
        const a = R() * 6.28, r = Math.sqrt(R()), x = GROVE.x + Math.cos(a) * r * GROVE.rx, z = GROVE.z + Math.sin(a) * r * GROVE.rz;
        if (pathDist(x, z) < 4.5 || R() > 1.15 - r * r) continue;                     // thins out toward the edge
        spots.push([x, z, (8 + R() * 6) * (1 - .35 * r * r), (R() - .5) * .12, (R() - .5) * .12]);   // shorter culms at the rim
      }
      const stalkG = new THREE.CylinderGeometry(.065, .08, 1, 6, 1, true); stalkG.translate(0, .5, 0);
      const stalks = new THREE.InstancedMesh(stalkG, lam(0xffffff, { map: stalkTex }), spots.length);
      spots.forEach(([x, z, h, rx, rz], i) => place(stalks, i, x, H(x, z) - .3, z, R() * 6, 1, h, 1, rx, rz));
      scene.add(stalks);
      const tex = canvasTexture(128, 128, g => {
        const r = rng(19);
        g.fillStyle = "#fff";
        for (let i = 0; i < 16; i++) {
          g.save(); g.translate(64 + (r() - .5) * 40, 64 + (r() - .5) * 40); g.rotate(r() * 6.28);
          g.beginPath(); g.ellipse(0, -22, 4.5, 24, 0, 0, 7); g.fill(); g.restore();
        }
      });
      const greens = ["#5f7a32", "#6d8a3a", "#4e6a2a", "#7f9a48", "#8aa452"].map(c => new THREE.Color(c));
      const lOff = [], lRot = [], lCol = [];
      spots.forEach(([x, z, h, rx, rz]) => {
        const y = H(x, z);
        for (let j = 0; j < 7; j++) {
          const t = .45 + j / 7 * .55;
          lOff.push(x + rz * -h * t + (R() - .5) * 1.4, y + h * t, z + rx * h * t + (R() - .5) * 1.4, 1.1 + R() * .7);
          lRot.push(R() * 6.28, (R() - .5) * 1.2, R() * 6.28);
          const c = greens[(R() * greens.length) | 0]; lCol.push(c.r, c.g, c.b);
        }
      });
      scene.add(cardMesh(lOff, lRot, lCol, tex));
    }
  }

  /* ---- two samurai in Sengoku-period tōsei gusoku (original models of historical armour) ---- */
  // horizontal lacquered plates with gilt rivets, for the cuirass and shin guards
  const plateTex = (base, line) => canvasTexture(64, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      g.fillStyle = line; g.fillRect(0, y, w, 2);
      g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(0, y + 2, w, 1);
      g.fillStyle = "#c9a24c"; for (let x = 6; x < w; x += 20) { g.beginPath(); g.arc(x, y + 8, 1.6, 0, 7); g.fill(); }
    }
  });
  // sugake lacing: pairs of silk cords running down over dark lames
  const laceTex = (cord, lame) => {
    const t = canvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = lame; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) { g.fillStyle = "rgba(255,255,255,.1)"; g.fillRect(0, y, w, 1.5); g.fillStyle = "rgba(0,0,0,.45)"; g.fillRect(0, y + 13, w, 3); }
      g.fillStyle = cord; for (let x = 6; x < w; x += 16) { g.fillRect(x, 0, 2.5, h); g.fillRect(x + 4, 0, 2.5, h); }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const chainTex = canvasTexture(32, 32, (g, w, h) => {
    g.fillStyle = "#1b1a19"; g.fillRect(0, 0, w, h); g.strokeStyle = "#5b5650"; g.lineWidth = 1.2;
    for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < w + 4; x += 8) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.stroke(); }
  });
  chainTex.wrapS = chainTex.wrapT = THREE.RepeatWrapping; chainTex.repeat.set(3, 3);
  const wrapTex = canvasTexture(32, 64, (g, w, h) => {
    g.fillStyle = "#e9e3d4"; g.fillRect(0, 0, w, h); g.fillStyle = "#14110f";
    for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w / 2, y + 8); g.lineTo(w, y); g.lineTo(w, y + 6); g.lineTo(w / 2, y + 14); g.lineTo(0, y + 6); g.fill(); }
  });
  const crestTex = (bg, fg, cross) => canvasTexture(64, 192, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.beginPath(); g.arc(w / 2, h * .2, w * .3, 0, 7); g.stroke();
    if (cross) { g.fillStyle = fg; g.fillRect(w / 2 - 3, h * .2 - w * .3, 6, w * .6); g.fillRect(w / 2 - w * .3, h * .2 - 3, w * .6, 6); }
    else { g.fillStyle = fg; g.beginPath(); g.arc(w / 2, h * .2, w * .14, 0, 7); g.fill(); }
    g.fillStyle = fg; g.fillRect(0, h * .9, w, 4);
  });

  // a sculpted face: brow ridge, eye sockets, nose bridge, cheekbones; shading baked into vertex colours
  const FACE = (() => {
    const g = new THREE.SphereGeometry(.1, 40, 28), p = g.attributes.position, col = [];
    const G = (x, y, cx, cy, sx, sy) => Math.exp(-((x - cx) ** 2) / (sx * sx) - ((y - cy) ** 2) / (sy * sy));
    const base = new THREE.Color("#8a5f48"), warm = new THREE.Color("#a0604a"), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      v3.fromBufferAttribute(p, i);
      const { x, y, z } = v3, front = sstep(0, .06, z);
      let d = 0, shade = 0, cheek = 0;
      d += .0085 * G(Math.abs(x), y, .03, .036, .03, .011) * front;                            // brow ridge
      for (const s of [-1, 1]) {
        const sock = G(x, y, s * .034, .017, .017, .013);
        d -= .011 * sock * front; shade += sock;                                                // eye sockets
        d += .005 * G(x, y, s * .05, -.006, .016, .012) * front;                              // cheekbones
        cheek += G(x, y, s * .05, -.012, .02, .016);
        shade += .5 * G(x, y, s * .03, .027, .025, .006);                                      // shadow under the brow
      }
      d += .011 * G(x, y, 0, .002, .009, .03) * front * sstep(-.03, .0, y);                    // nose bridge
      const k = 1 + d / .1;
      p.setXYZ(i, x * k * (1 - .06 * sstep(.02, .08, Math.abs(x)) * (1 - front)), y * k, z * k);   // narrower temples
      c.copy(base).lerp(warm, Math.min(1, cheek * .7 * front)).multiplyScalar(1 - .5 * Math.min(1, shade) * front);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  })();

  function makeSamurai({ dō, cord, lame, robe, maedate, banner, cross }) {
    const k = kit();
    const lacquer = std(dō, .26, .05, { map: plateTex("#ffffff", "rgba(0,0,0,.55)") });
    const laced = std(0xffffff, .62, .05, { map: laceTex(cord, lame), side: THREE.DoubleSide });
    const gilt = std(0xd4ad55, .32, .95, { side: THREE.DoubleSide }), iron = std(0x2b2927, .45, .7);
    const cloth = std(robe, .95), chain = std(0xffffff, .55, .6, { map: chainTex }), glove = std(0x3a2a1f, .8);
    const black = std(0x121010, .3, .05), hair = std(0xe9e3d6, .9), skin = std(0x6b4a38, .7), wrap = std(0xffffff, .7, 0, { map: wrapTex });
    const cordM = std(cord, .75);                                                    // silk cords: bindings, bow, edging
    const band = (a, b, t, r, mat, h = .012) => {                                    // a thin ring around a limb, t of the way from a to b
      const p = a.map((v, i) => v + (b[i] - v) * t), d = a.map((v, i) => (b[i] - v));
      const L = Math.hypot(...d), u = d.map(v => v / L * h);
      k.add(limb(p.map((v, i) => v - u[i]), p.map((v, i) => v + u[i]), r, r, 14), mat);
    };

    // legs in a ready stance: left foot forward, knees bent, wide hakama gathered just under the knee into shin guards
    // a lathe profile [radius, 0–1 along the segment] stood between two points
    const sleeve = (a, b, prof, mat, seg = 16) => {
      const A = v3a.set(...a), B = v3b.set(...b), d = B.clone().sub(A), len = d.length();
      const g = new THREE.LatheGeometry(prof.map(([r, t]) => new THREE.Vector2(r, t * len)), seg);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize())); g.translate(A.x, A.y, A.z);
      k.add(g, mat);
    };
    const v3a = new THREE.Vector3(), v3b = new THREE.Vector3();
    const straw = std(0x9a8456, .9), tabi = std(0x1d1a18, .8);
    const L = { ank: [.19, .1, .2], knee: [.2, .5, .25], hip: [.12, .93, .04] }, Rt = { ank: [-.21, .1, -.17], knee: [-.21, .5, -.05], hip: [-.12, .93, -.03] };
    for (const g of [L, Rt]) {
      // waraji sandal under a tabi sock
      k.add(new THREE.BoxGeometry(.11, .022, .27), straw, [g.ank[0], .011, g.ank[2] + .045]);
      k.add(new THREE.SphereGeometry(.06, 12, 8), tabi, [g.ank[0], .05, g.ank[2] + .05], [0, 0, 0], [.85, .62, 1.75]);
      k.add(limb([g.ank[0] - .05, .022, g.ank[2] + .1], [g.ank[0] + .05, .06, g.ank[2] - .02], .006, .006, 4), straw);   // straw ties
      // suneate: curved iron splints over the shin, a cloth gaiter behind
      const sh = [g.ank[0] + (g.knee[0] - g.ank[0]) * .72, .1 + (g.knee[1] - .1) * .72, g.ank[2] + (g.knee[2] - g.ank[2]) * .72];
      sleeve([g.ank[0], .07, g.ank[2]], sh, [[.055, 0], [.065, .5], [.07, 1]], cloth, 12);
      const d = new THREE.Vector3(...sh).sub(new THREE.Vector3(g.ank[0], .07, g.ank[2])), len = d.length();
      const guard = new THREE.CylinderGeometry(.078, .07, len, 14, 1, true, -1.25, 2.5);
      guard.translate(0, len / 2, 0); guard.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
      k.add(guard, iron, [g.ank[0], .08, g.ank[2]]);
      // hakama: wide from the hip, ballooning past the knee, gathered at the shin
      sleeve(sh, g.hip, [[.07, 0], [.15, .08], [.2, .3], [.205, .55], [.19, .85], [.17, 1]], cloth, 18);
      const mid = [(g.knee[0] + g.hip[0]) / 2, (g.knee[1] + g.hip[1]) / 2 + .05, (g.knee[2] + g.hip[2]) / 2 + .12];
      k.add(new THREE.CylinderGeometry(.21, .23, .34, 12, 1, true, -1.05, 2.1), laced, mid, [-.14, 0, 0]);          // haidate
    }
    // kusazuri: seven laced tassets hanging from the waist
    for (let i = 0; i < 7; i++) {
      const a0 = i * Math.PI * 2 / 7 + .03, al = Math.PI * 2 / 7 - .06;
      k.add(new THREE.CylinderGeometry(.29, .41, .38, 6, 1, true, a0, al), laced, [0, .82, 0]);
      k.add(new THREE.CylinderGeometry(.408, .414, .024, 6, 1, true, a0, al), cordM, [0, .642, 0]);          // hishinui hem binding
    }
    k.add(new THREE.CylinderGeometry(.27, .28, .07, 20), cloth, [0, 1.0, 0]);                                           // obi
    // okegawa-dō: plate cuirass, tapered waist, flattened front to back
    k.add(new THREE.LatheGeometry(V2([[.26, .99], [.265, 1.06], [.28, 1.16], [.305, 1.28], [.315, 1.38], [.305, 1.46], [.27, 1.52], [.19, 1.555], [.1, 1.57]]), 28), lacquer, [0, 0, 0], [0, 0, 0], [1, 1, .78]);
    k.add(new THREE.TorusGeometry(.262, .012, 6, 28), gilt, [0, .995, 0], [Math.PI / 2, 0, 0], [1, .78, 1]);
    for (const s of [-1, 1]) k.add(limb([s * .12, 1.55, .13], [s * .15, 1.55, -.15], .026, .026, 6), black);
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(.035, .02, .03), gilt, [s * .12, 1.555, .15]);              // watagami fittings
    k.add(new THREE.CylinderGeometry(.292, .305, .075, 24, 1, true, -1.05, 2.1), black, [0, 1.495, 0], [0, 0, 0], [1, 1, .8]);   // munaita chest plate
    k.add(new THREE.CylinderGeometry(.309, .309, .009, 24, 1, true, -1.05, 2.1), gilt, [0, 1.457, 0], [0, 0, 0], [1, 1, .8]);
    k.add(new THREE.CircleGeometry(.042, 24), gilt, [0, 1.31, .246]);                                                // crest on the breastplate
    k.add(new THREE.TorusGeometry(.054, .006, 6, 28), gilt, [0, 1.31, .244]);
    // agemaki: the decorative cord bow on the back
    for (const s of [-1, 1]) {
      k.add(new THREE.TorusGeometry(.036, .009, 6, 14), cordM, [s * .036, 1.26, -.243], [0, 0, s * .5], [1, .7, 1]);
      k.add(limb([s * .008, 1.25, -.246], [s * .05, 1.1, -.25], .008, .006, 5), cordM);
    }
    k.add(new THREE.SphereGeometry(.016, 8, 6), cordM, [0, 1.255, -.246]);
    // sode: curved laced shoulder guards
    for (const s of [-1, 1]) {
      const th = [s * Math.PI / 2 - .62, 1.24];
      for (let i = 0; i < 5; i++) { const r = .272 + i * .0075; k.add(new THREE.CylinderGeometry(r, r + .007, .064, 14, 1, true, ...th), laced, [s * .03, 1.42 - i * .062, 0], [0, 0, s * .12]); }
      k.add(new THREE.CylinderGeometry(.268, .27, .034, 14, 1, true, ...th), black, [s * .036, 1.468, 0], [0, 0, s * .12]);     // kanmuri-ita
      k.add(new THREE.CylinderGeometry(.272, .272, .008, 14, 1, true, ...th), gilt, [s * .037, 1.487, 0], [0, 0, s * .12]);
      k.add(new THREE.CylinderGeometry(.31, .31, .014, 14, 1, true, ...th), cordM, [s * .006, 1.14, 0], [0, 0, s * .12]);     // hem binding
    }
    // arms: mail sleeves, iron forearm splints; right hand on the grip, left on the scabbard mouth
    const T = [.19, 1.02, .21], Hd = [-.02, 1.13, .46], grip = [.085, 1.075, .335], mouth = [.215, 1.0, .16];
    for (const [sh, el, hd] of [[[.24, 1.45, 0], [.33, 1.19, .05], mouth]]) {        // left arm; the right arm is the live rig below
      k.add(new THREE.SphereGeometry(.09, 12, 10), chain, sh);
      k.add(limb(sh, el, .082, .07, 12), chain);
      k.add(new THREE.SphereGeometry(.068, 10, 8), iron, el);
      k.add(limb(el, hd, .066, .05, 12), iron);
      band(el, hd, .12, .07, gilt); band(el, hd, .82, .057, gilt);                 // kote: gilt bands over the splints
      k.add(new THREE.SphereGeometry(.055, 10, 8), glove, hd, [0, 0, 0], [1, .85, 1.25]);
    }
    // lacquered scabbard thrust through the obi, edge up (the sword itself is part of the rig)
    k.add(limb(T, [.35, .83, -.52], .022, .019, 8), black);
    k.add(new THREE.SphereGeometry(.023, 8, 6), gilt, [.35, .83, -.52]);
    // wakizashi: the short companion sword, worn just inside the katana
    { const t = [.13, 1.0, .235], back = [.29, .89, -.2], end = [.045, 1.045, .375];
      k.add(limb(t, back, .018, .016, 8), black); k.add(new THREE.SphereGeometry(.018, 8, 6), gilt, back);
      k.add(limb(t, end, .016, .015, 8), wrap); k.add(new THREE.SphereGeometry(.018, 8, 6), gilt, end);
      const d = new THREE.Vector3(...end).sub(new THREE.Vector3(...t)).normalize();
      const ts = new THREE.CylinderGeometry(.034, .034, .009, 14); ts.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d)); ts.translate(...t);
      k.add(ts, iron); }
    // neck and yodarekake throat guard
    k.add(limb([0, 1.54, 0], [0, 1.66, .01], .06, .055, 10), skin);
    k.add(new THREE.CylinderGeometry(.11, .15, .11, 14, 1, true, -1.3, 2.6), laced, [0, 1.6, .015]);
    // head: face, menpō half mask with nose and white moustache
    const HY = 1.73;
    // face: sculpted head; eyeballs set in the sockets under heavy lids, a steady stare
    const faceM = std(0xffffff, .62, 0, { vertexColors: true });
    faceM.emissive.set(0x7a5440).multiplyScalar(.12);                                       // fill light in skin tone, not white
    const tint = (geo, hex) => { const c = new THREE.Color(hex), n = geo.attributes.position.count; geo.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => c.toArray()[i % 3]), 3)); return geo; };   // eyes share the face's draw
    const F = (x, y, z) => [x, HY + y * 1.1, .01 + z * 1.04];                                  // face-local → body (same scale as the head)
    k.add(FACE, faceM, [0, HY, .01], [0, 0, 0], [1, 1.1, 1.04]);
    for (const s of [-1, 1]) {
      k.add(tint(new THREE.SphereGeometry(.0118, 12, 8), "#b9ad9c"), faceM, F(s * .034, .0165, .0795));                 // eyeball
      k.add(tint(new THREE.SphereGeometry(.0056, 8, 6), "#000000"), faceM, F(s * .033, .0155, .0902), [0, 0, 0], [1, 1, .4]);   // dark iris
      k.add(new THREE.SphereGeometry(.0129, 12, 6, 0, Math.PI * 2, 0, Math.PI * .5), skin, F(s * .034, .0168, .0795), [.62, 0, 0]);           // heavy upper lid
      k.add(new THREE.SphereGeometry(.0125, 12, 4, 0, Math.PI * 2, Math.PI * .72, Math.PI * .28), skin, F(s * .034, .0165, .0795), [-.25, 0, 0]);  // lower lid
      const brow = new THREE.CatmullRomCurve3([[.013, .03, .097], [.032, .034, .096], [.052, .029, .085]].map(([x, y, z]) => new THREE.Vector3(...F(s * x, y, z))));
      k.add(new THREE.TubeGeometry(brow, 10, .003, 6), black);                                                         // brow
    }
    k.add(new THREE.CylinderGeometry(.104, .106, .042, 22, 1, true), hair, [0, HY + .064, .008], [-.08, 0, 0], [1, 1, 1.06]);   // hachimaki under the helmet
    k.add(new THREE.SphereGeometry(.11, 18, 10, Math.PI / 2 - 1.15, 2.3, Math.PI * .52, Math.PI * .34), black, [0, HY + .005, .015], [0, 0, 0], [1, 1.05, 1.12]);
    k.add(new THREE.ConeGeometry(.02, .055, 5), black, [0, HY - .005, .125], [Math.PI / 2 + .35, 0, 0]);
    k.add(tint(new THREE.BoxGeometry(.04, .006, .01), "#8a7f70"), faceM, [0, HY - .048, .117]);                                     // the mask's bared teeth
    k.add(new THREE.ConeGeometry(.012, .05, 5), black, [0, HY - .095, .1], [Math.PI, 0, 0]);                        // chin tuft
    for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(.03, .022, .025, 8, 1, true), black, [s * .085, HY - .055, .07], [0, 0, s * 1.1]);   // ase-nagashi sweat drains
    for (const s of [-1, 1]) k.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(s * .013, HY - .027, .12), new THREE.Vector3(s * .054, HY - .038, .106), new THREE.Vector3(s * .078, HY - .07, .088)]), 8, .006, 5), black);
    // kabuto (1.3× scale around its own base): fluted riveted bowl, visor, four-tier flared neck guard, turnbacks, crest
    const KS = 1.3, KY = HY + .012;                                              // sits low on the brow
    const hel = (geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => k.add(geo, mat, [p[0] * KS, KY + p[1] * KS, p[2] * KS], r, s.map(v => v * KS));
    { const bowl = new THREE.LatheGeometry(V2([[0, .155], [.05, .152], [.1, .138], [.137, .102], [.156, .052], [.162, 0]]), 64);
      const a = bowl.attributes.position;
      for (let i = 0; i < a.count; i++) { const x = a.getX(i), z = a.getZ(i), ang = Math.atan2(x, z), f = 1 + .022 * Math.pow(Math.abs(Math.cos(ang * 16)), 6); a.setX(i, x * f); a.setZ(i, z * f); }
      bowl.computeVertexNormals();
      hel(bowl, black); }
    hel(new THREE.TorusGeometry(.024, .008, 6, 14), gilt, [0, .155, 0], [Math.PI / 2, 0, 0]);
    hel(new THREE.LatheGeometry(V2([[.162, 0], [.21, -.028], [.215, -.034]]), 20, -1.05, 2.1), black);
    for (let t = 0; t < 4; t++) hel(new THREE.LatheGeometry(V2([[.165 + t * .022, -.01 - t * .045], [.19 + t * .026, -.062 - t * .045]]), 28, .95, Math.PI * 2 - 1.9), laced);
    for (const s of [-1, 1]) hel(new THREE.CylinderGeometry(.07, .08, .1, 6, 1, true, 0, 2.2), laced, [s * .2, -.06, .1], [0, s > 0 ? .4 : Math.PI - .4 + 2.2, 0]);
    hel(new THREE.BoxGeometry(.07, .05, .02), gilt, [0, .07, .155]);
    for (const x of [-.032, 0, .032]) hel(new THREE.BoxGeometry(.007, .075, .004), gilt, [x, .1, Math.sqrt(.128 * .128 - x * x)], [-.62, 0, 0]);   // shinodare
    if (maedate === "moon") {
      const pts = [];
      for (let a = 200; a <= 340; a += 5) { const r = a * Math.PI / 180; pts.push([Math.cos(r) * .3, Math.sin(r) * .3 + .3]); }
      for (let a = 335; a >= 205; a -= 5) { const r = a * Math.PI / 180; pts.push([Math.cos(r) * .26 * 1.02, Math.sin(r) * .25 + .355]); }
      hel(new THREE.ShapeGeometry(new THREE.Shape(V2(pts))), gilt, [0, .035, .165], [-.15, 0, 0], [1.25, 1, 1]);
    } else {
      const horn = new THREE.ShapeGeometry(new THREE.Shape(V2([[0, 0], [.035, 0], [.08, .12], [.14, .3], [.16, .38], [.13, .33], [.05, .14], [-.005, .03]])));
      for (const s of [-1, 1]) hel(horn, gilt, [s * .015, .08, .165], [-.12, 0, 0], [s, 1, 1]);
      hel(new THREE.CircleGeometry(.05, 20), std(0xb3241a, .4, .1, { side: THREE.DoubleSide }), [0, .13, .17], [-.12, 0, 0]);
    }
    // sashimono: banner pole on the back
    k.add(new THREE.BoxGeometry(.06, .12, .05), black, [0, 1.2, -.25]);
    k.add(limb([0, 1.12, -.25], [0, 2.55, -.27], .012, .01, 6), black);
    k.add(limb([0, 2.52, -.27], [.36, 2.52, -.27], .008, .008, 5), black);
    const body = k.build();
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(.36, 1.15, 3, 10).translate(.18, 0, 0), clothMat(crestTex(...banner, cross)));
    flag.position.set(0, 1.94, -.27); flag.rotation.y = -1.1;
    body.add(flag);

    // right arm + katana: two-bone IK from the shoulder to the hand, sword held in the hand
    const unit = (r1, r2, mat) => new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, 1, 12, 1).translate(0, .5, 0), mat);
    const ball = (r, mat, s = [1, 1, 1]) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat); m.scale.set(...s); return m; };
    const SH = new THREE.Vector3(-.24, 1.45, 0), A = .3, B = .44, POLE = new THREE.Vector3(-1, -1.2, -.2).normalize();
    const upper = unit(.082, .07, chain), fore = unit(.066, .05, iron), elbow = ball(.068, iron), hand = ball(.055, glove, [1, .85, 1.25]);
    for (const [y, r] of [[.12, .07], [.82, .057]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .055, 14), gilt); b.position.y = y; fore.add(b); }   // kote bands
    body.add(ball(.09, chain).translateX(SH.x).translateY(SH.y), upper, fore, elbow, hand);
    const sword = new THREE.Group();
    sword.add(new THREE.Mesh(limb([0, -.17, 0], [0, .165, 0], .02, .018, 8), wrap));
    sword.add(ball(.023, gilt).translateY(-.17));
    sword.add(new THREE.Mesh(new THREE.CylinderGeometry(.047, .047, .012, 16).translate(0, .17, 0), iron));
    const bladeG = new THREE.ExtrudeGeometry(new THREE.Shape(V2([[-.014, 0], [.014, 0], [.012, .7], [-.002, .76], [-.013, .69]])), { depth: .005, bevelEnabled: false });
    bladeG.translate(0, 0, -.0025);
    const blade = new THREE.Mesh(bladeG, std(0xe9e6df, .12, .9));
    blade.position.y = .176; blade.scale.y = .001; blade.visible = false;
    sword.add(blade); body.add(sword);

    // keyframes: [time, hand position, blade direction, blade drawn 0–1]
    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    const D0 = v(...T).sub(v(...Hd)).normalize(), G0 = v(...grip);
    const KEYS = [
      [0, G0, D0, 0],                                                    // hand on the grip, blade in the scabbard
      [.45, G0.clone().addScaledVector(D0, -.5), D0, 1],                 // draw along the scabbard line
      [.56, v(-.05, 1.24, .66), v(.92, .02, .38).normalize(), 1],        // tip clears the mouth and swings out wide…
      [.7, v(-.2, 1.22, .62), v(-.75, .05, .66).normalize(), 1],         // …into a horizontal cut across the front
      [1, v(-.5, 1.12, .25), v(-.85, -.35, -.4).normalize(), 1],         // follow-through, blade low to the side
    ].map(([t, h, d, e]) => ({ t, h, q: new THREE.Quaternion().setFromUnitVectors(UP, d), e }));
    // the same draw, ending in chūdan guard: hands in front of the belly, tip toward the opponent's throat
    const GUARD = [
      KEYS[0], KEYS[1], KEYS[2],
      { t: 1, h: v(-.03, 1.13, .44), q: new THREE.Quaternion().setFromUnitVectors(UP, v(.05, .42, 1).normalize()), e: 1 },
    ];
    const H = new THREE.Vector3(), E = new THREE.Vector3(), d = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Quaternion();
    const aim = (m, from, to) => { d.subVectors(to, from); m.position.copy(from); m.scale.set(1, d.length(), 1); m.quaternion.setFromUnitVectors(UP, d.normalize()); };
    function pose(t, guard = false) {
      const K = guard ? GUARD : KEYS;
      let i = 0; while (i < K.length - 2 && t > K[i + 1].t) i++;
      const k0 = K[i], k1 = K[i + 1], u = sstep(0, 1, Math.min(1, Math.max(0, (t - k0.t) / (k1.t - k0.t))));
      H.lerpVectors(k0.h, k1.h, u); q.slerpQuaternions(k0.q, k1.q, u);
      const e = k0.e + (k1.e - k0.e) * u;
      // two-bone IK: elbow on the circle where both bones meet, pushed toward the pole
      d.subVectors(H, SH); const L = Math.min(Math.max(d.length(), .05), A + B - .001); d.normalize(); H.copy(SH).addScaledVector(d, L);
      const x = (A * A - B * B + L * L) / (2 * L), h = Math.sqrt(Math.max(0, A * A - x * x));
      p.copy(POLE).addScaledVector(d, -POLE.dot(d)).normalize();
      E.copy(SH).addScaledVector(d, x).addScaledVector(p, h);
      aim(upper, SH, E); aim(fore, E, H); elbow.position.copy(E); hand.position.copy(H);
      sword.position.copy(H); sword.quaternion.copy(q);
      blade.visible = e > .01; blade.scale.y = Math.max(.001, e);
    }
    pose(0);

    const g = new THREE.Group(); g.add(body);
    g.userData.pose = pose;
    g.userData.ready = r => { body.rotation.x = .06 * r; };                                // lean in over the front foot (feet stay planted)
    return g;
  }
  const you = makeSamurai({ dō: 0x7a1d16, cord: "#c8321f", lame: "#1a1311", robe: 0x2a1a17, maedate: "moon", banner: ["#a8261b", "#f1ebdf"], cross: false });
  const foe = makeSamurai({ dō: 0x151313, cord: "#2e4a86", lame: "#121212", robe: 0x1a1d26, maedate: "horns", banner: ["#141212", "#efe8da"], cross: true });
  const RONIN_X = 2.6;
  you.position.set(SHRINE.x - RONIN_X, SHRINE.y, SHRINE.z); you.rotation.y = Math.PI / 2;
  foe.position.set(SHRINE.x + RONIN_X, SHRINE.y, SHRINE.z); foe.rotation.y = -Math.PI / 2;
  you.name = "you"; foe.name = "foe";
  scene.add(you, foe);

  /* ---- birds over the beach, the fields and the hill ---- */
  {
    const R = rng(91), path = [], seed = [];
    for (const [cx, cz, h, n] of [[25, -15, 26, 7], [-20, -105, 34, 9], [15, -190, 42, 6], [-40, -60, 55, 5]]) {
      const dir = R() < .5 ? -1 : 1;
      for (let i = 0; i < n; i++) { path.push(cx + (R() - .5) * 8, cz + (R() - .5) * 8, 14 + R() * 10, h + (R() - .5) * 6); seed.push(dir * (.14 + R() * .06), i * .35 + R() * .3); }
    }
    const tri = [0, 0, .32, .06, 0, -.2, -.06, 0, -.2, -.05, 0, .1, -.05, 0, -.08, -.68, .06, -.04, .05, 0, .1, .68, .06, -.04, .05, 0, -.08];
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(tri, 3));
    g.setAttribute("path", new THREE.InstancedBufferAttribute(new Float32Array(path), 4));
    g.setAttribute("seed", new THREE.InstancedBufferAttribute(new Float32Array(seed), 2));
    g.instanceCount = seed.length / 2;
    const birds = new THREE.Mesh(g, link(fogMat({ vertexShader: birdVS, fragmentShader: birdFS, side: THREE.DoubleSide, uniforms: { uTime: {}, uCol: { value: new THREE.Color(0x2a2420) } } }), ["uTime"]));
    birds.frustumCulled = false;
    scene.add(birds);
  }

  /* ---- drifting leaves / petals / fireflies ---- */
  const LEAVES = coarse ? 650 : 1800;
  const driftM = link(fogMat({ vertexShader: driftVS, fragmentShader: driftFS, transparent: true, depthWrite: false,
    uniforms: { uTime: {}, uWind: {}, uSize: { value: 110 }, uPR: { value: dpr }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(70, 26, 70) }, uColor: { value: null }, uGlow: { value: 0 } } }), ["uTime", "uWind"]);
  driftM.uniforms.uColor.value = P.leaf;
  {
    const g = new THREE.BufferGeometry(), s = new Float32Array(LEAVES * 4);
    for (let i = 0; i < s.length; i++) s[i] = Math.random();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(LEAVES * 3), 3));
    g.setAttribute("seed", new THREE.BufferAttribute(s, 4));
    const pts = new THREE.Points(g, driftM);
    pts.frustumCulled = false;
    scene.add(pts);
  }

  /* ---- palette blend ---- */
  function applyPalette(p) {
    let i = 0; while (i < PALETTES.length - 2 && p > PALETTES[i + 1][0]) i++;
    const [pa, A] = PALETTES[i], [pb, B] = PALETTES[i + 1];
    const t = sstep(pa, pb, p);
    for (const k in P) {
      if (typeof P[k] === "number") P[k] = A[k] + (B[k] - A[k]) * t;
      else if (P[k].isColor) P[k].copy(A[k]).lerp(B[k], t);
      else P[k].copy(A[k]).lerp(B[k], t).normalize();
    }
    scene.fog.color.copy(P.fog); scene.fog.density = P.density;
    renderer.setClearColor(P.fog);
    skyM.uniforms.uSunSize.value = P.sunSize; skyM.uniforms.uStars.value = P.stars; skyM.uniforms.uCloud.value = P.cloud;
    ambC.copy(P.horizon).lerp(P.top, .45).multiplyScalar(P.amb * .75);
    sunC.copy(P.sun).multiplyScalar(P.light * .5);
    hemi.color.copy(P.top).lerp(P.horizon, .5); hemi.groundColor.copy(P.ground); hemi.intensity = P.amb * 1.6;
    sunL.color.copy(P.sun); sunL.intensity = P.light;
    nearRing.uCol.value.copy(P.fog).lerp(P.top, .55).multiplyScalar(.62);
    farRing.uCol.value.copy(P.fog).lerp(P.horizon, .35).lerp(P.top, .25);
    driftM.uniforms.uGlow.value = P.glow;
    M.lantern.emissiveIntensity = P.stars * 1.4;
  }

  /* ---- loop ---- */
  const look = new THREE.Vector3(), camPos = new THREE.Vector3(), tan = new THREE.Vector3();
  const pointer = new THREE.Vector2(), ptr = new THREE.Vector2();
  let time = 0, level = 0, frames = 0, acc = 0;
  const CULL2 = 165 * 165;
  let gk = 1;

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // tall phones: widen the view until about 48° fits across, so the standoff and the village stay in frame
    camera.fov = w / h < .8 ? Math.min(90, Math.max(68, 2 * Math.atan(Math.tan(24 * Math.PI / 180) / (w / h)) * 180 / Math.PI)) : 52;
    camera.updateProjectionMatrix();
  }
  resize();

  function update(dt, progress, draw = true) {
    time += dt;
    applyPalette(progress);
    const u = progToU(progress);
    camCurve.getPoint(u, camPos); lookCurve.getPoint(u, look);
    ptr.lerp(pointer, 1 - Math.exp(-dt * 3));
    const ground = Math.max(H(camPos.x, camPos.z), bridgeDeck(camPos.x, camPos.z)) + EYE;
    look.y += ground - camPos.y;
    camera.position.set(camPos.x, ground + Math.sin(time * 1.3) * .04, camPos.z);   // breathing, like sitting on a horse
    camCurve.getTangent(u, tan);
    look.x += -tan.z * ptr.x * 2.2; look.z += tan.x * ptr.x * 2.2; look.y += ptr.y * 1.2;
    camera.lookAt(look);
    sky.position.copy(camera.position);

    const wa = Math.atan2(tan.z, tan.x) + ptr.x * 1.1;
    S.uWind.value.set(Math.cos(wa), Math.sin(wa));
    S.uGust.value = .45 + .35 * Math.sin(time * .45) * Math.sin(time * .27 + 1) + Math.abs(ptr.x) * .35;
    S.uTime.value = time;
    driftM.uniforms.uCam.value.copy(camera.position);
    sunL.position.copy(camera.position).addScaledVector(P.sunDir, 100); sunL.target.position.copy(camera.position);

    // far grass chunks are lost in the fog anyway — skip them
    // and distant chunks draw a thinner share of blades (each is sub-pixel by then)
    for (const c of chunks) {
      const d2 = c.sphere.center.distanceToSquared(camera.position);
      c.grass.visible = d2 < CULL2;
      if (c.plume) c.plume.visible = d2 < CULL2 * .45;
      if (!c.grass.visible) continue;
      const lod = (d2 < 62 * 62 ? 1 : d2 < 100 * 100 ? .5 : .28) * gk;
      c.grass.geometry.instanceCount = Math.ceil(c.grass.geometry.userData.full * lod);
    }
    wheel.userData.spin.rotation.z -= dt * .55;
    battle.visible = camera.position.z > -30;                                   // the fighting is on the beach only
    you.visible = foe.visible = camera.position.distanceToSquared(you.position) < 90 * 90;   // ~20 draws each, sub-pixel from afar
    if (!draw) return { windAngle: wa - Math.atan2(tan.z, tan.x), gust: S.uGust.value, alt: camera.position.y };          // hidden behind the intro
    renderer.render(scene, camera);

    // adaptive quality: step down if frames run long, never step back up (no flicker)
    acc += dt; frames++;
    if (frames === 90) {
      if (acc / frames > 1 / 48 && level < 3) {
        level++;
        dpr = Math.max(.75, dpr * .8); renderer.setPixelRatio(dpr); driftM.uniforms.uPR.value = dpr; resize();
        gk = [1, .75, .55, .4][level];
        for (const c of chunks) if (c.plume) c.plume.geometry.instanceCount = Math.floor(c.plume.geometry.userData.full * gk);
      }
      frames = 0; acc = 0;
    }
    return { windAngle: wa - Math.atan2(tan.z, tan.x), gust: S.uGust.value, alt: camera.position.y };
  }

  function warm() { applyPalette(0); update(0, 0); renderer.compile(scene, camera); }

  // GPU timing for development: renders n frames, then forces a sync with readPixels
  function bench(n = 60) {
    const gl = renderer.getContext(), px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t = performance.now();
    for (let i = 0; i < n; i++) renderer.render(scene, camera);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { ms: (performance.now() - t) / n, calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  }

  const STATS = {
    blades: chunks.reduce((s, c) => s + c.grass.geometry.userData.full, 0),
    plumes: chunks.reduce((s, c) => s + (c.plume ? c.plume.geometry.userData.full : 0), 0),
    leafCards: leafMesh.geometry.instanceCount,
  };

  return {
    update, resize, warm, bench, renderer, scene, camera, THREE,
    stats: () => ({ ...STATS, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, quality: level }),
    setPointer(x, y) { pointer.set(x, y); },
    ronins: { you, foe, x: RONIN_X },
  };
}
