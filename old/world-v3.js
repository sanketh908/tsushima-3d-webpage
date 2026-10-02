import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* =====================================================================
   Terrain
   ===================================================================== */
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const SHRINE = { x: 0, z: -238, y: 10.5 };

export function H(x, z) {
  let h = Math.sin(x * .045 + 1.3) * 1.6 + Math.cos(z * .028 + x * .012) * 2.2 + Math.sin((x - z) * .09) * .45;
  if (Math.abs(x) > 38) h += (Math.abs(x) - 38) * .14;            // valley walls rise away from the path
  const d = Math.hypot(x - SHRINE.x, z - SHRINE.z);
  h += 8 * sstep(48, 16, d);                                       // shrine hill
  h += (SHRINE.y - h) * sstep(19, 10, d);                          // flat top for the gate and hall
  const b = sstep(8, 34, z);                                       // beach slides under the sea
  return h * (1 - b) + (1.2 - (z - 8) * .16) * b;
}

/* =====================================================================
   Camera path — [progress, x, z, look x, look dy, look z]
   ===================================================================== */
const KF = [
  [0,    0,   10,   0,  -.6,  90],
  [.08,  3,    8,  40,  -.4,  70],
  [.17,  5,    1, -12,  -.5, -40],
  [.27,  1,  -25,  -6,  -.4, -70],
  [.37, -8,  -55,   2,  -.3, -100],
  [.47, -3,  -85,   8,  -.3, -130],
  [.56,  5, -112,   0,  -.2, -160],
  [.65,  0, -145,  -6,  -.2, -190],
  [.73, -2, -180,   0,   2,  -236],
  [.80,  0, -206,   0,  -.2, -240],
  [.88,  0, -228,   0, -1.5, -238],
  [.935, 0, -229,   0,  -.8, -238],
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
uniform vec3 uGround, uSand, uSunDir, uSun, uAmb;
uniform sampler2D uNoise;
varying vec3 vW, vN;
${FOG_F}
void main() {
  vec2 nz = texture2D(uNoise, vW.xz * .012).rg;
  float fine = texture2D(uNoise, vW.xz * .09).r;
  vec3 base = mix(uGround, uSand, smoothstep(9.0, 16.0, vW.z + (nz.x - .5) * 6.0));
  base *= .72 + .5 * nz.y + .18 * (fine - .5);
  float plaza = smoothstep(12.0, 10.5, distance(vW.xz, vec2(${SHRINE.x.toFixed(1)}, ${SHRINE.z.toFixed(1)})));
  base = mix(base, vec3(.42, .4, .37) * (.85 + .3 * fine), plaza);
  float d = max(dot(normalize(vN), uSunDir), 0.0);
  gl_FragColor = vec4(base * (uAmb + uSun * d * 1.4), 1.0);
  #include <fog_fragment>
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
  p.x += w * k * (1.0 + uGust);
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
varying float vH;
varying vec2 vXZ;
void main() { vH = hn; vXZ = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const mountFS = /* glsl */`
uniform vec3 uCol, uFogC;
uniform sampler2D uNoise;
varying float vH;
varying vec2 vXZ;
void main() {
  float n = texture2D(uNoise, vXZ * .004 + vec2(vH * .15)).r;
  vec3 col = mix(uFogC, uCol * (.85 + .3 * n), .3 + vH * .7);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/* =====================================================================
   Geometry helpers
   ===================================================================== */
const UP = new THREE.Vector3(0, 1, 0);
const V2 = pts => pts.map(([x, y]) => new THREE.Vector2(x, y));

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

  /* ---- sky ---- */
  const skyM = new THREE.ShaderMaterial({ vertexShader: skyVS, fragmentShader: skyFS, side: THREE.BackSide, depthWrite: false,
    uniforms: { uTop: { value: P.top }, uHorizon: { value: P.horizon }, uSunDir: S.uSunDir, uSun: { value: P.sun }, uSunSize: { value: P.sunSize }, uStars: { value: 0 }, uTime: S.uTime, uCloud: { value: .5 }, uNoise: S.uNoise } });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyM);
  sky.frustumCulled = false; sky.renderOrder = -1;
  scene.add(sky);

  /* ---- mountains ---- */
  function ring(radius, base, amp, seed) {
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
    const u = { uCol: { value: new THREE.Color() }, uFogC: { value: P.fog }, uNoise: S.uNoise };
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: mountVS, fragmentShader: mountFS, uniforms: u, side: THREE.DoubleSide, depthWrite: false }));
    m.frustumCulled = false;
    scene.add(m);
    return u;
  }
  const farRing = ring(720, 70, 120, 1.7), nearRing = ring(470, 25, 60, 4.2);

  /* ---- ground ---- */
  {
    const g = new THREE.PlaneGeometry(520, 640, coarse ? 130 : 210, coarse ? 160 : 260);
    g.rotateX(-Math.PI / 2); g.translate(0, 0, -130);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) a.setY(i, H(a.getX(i), a.getZ(i)));
    g.computeVertexNormals();
    const m = link(fogMat({ vertexShader: groundVS, fragmentShader: groundFS, uniforms: { uGround: { value: P.ground }, uSand: { value: P.sand }, uSunDir: {}, uSun: {}, uAmb: {}, uNoise: {} } }), ["uSunDir", "uSun", "uAmb", "uNoise"]);
    m.uniforms.uGround.value = P.ground; m.uniforms.uSand.value = P.sand;
    scene.add(new THREE.Mesh(g, m));
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
  const place = (mesh, i, x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) => {
    m4.compose(v3.set(x, y, z), q4.setFromEuler(e3.set(rx, ry, rz)), s3.set(sx, sy, sz)); mesh.setMatrixAt(i, m4);
  };

  /* ---- grass + pampas plumes, in spatial chunks so off-screen ones are skipped ---- */
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
  let leafMesh;
  {
    const R = rng(11);
    const variants = [
      treeVariant(21, { depth: 4, len: 2.4, rad: .32 }),
      treeVariant(37, { depth: 4, len: 2.1, rad: .3, spread: 1.4, lift: .2 }),
      treeVariant(53, { depth: 4, len: 2.7, rad: .34, spread: 1, lift: .45 }),
    ];
    const spots = [];
    for (let tries = 0; spots.length < (coarse ? 70 : 150) && tries < 5000; tries++) {
      const z = -100 - R() * 100, x = (R() - .5) * 92;
      if (pathDist(x, z) < 6) continue;
      spots.push({ x, z, k: .85 + R() * .55, gold: R() < .12 });
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
    const g = new THREE.InstancedBufferGeometry(), base = new THREE.PlaneGeometry(1, 1);
    g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
    g.setAttribute("lOff", new THREE.InstancedBufferAttribute(new Float32Array(lOff), 4));
    g.setAttribute("lRot", new THREE.InstancedBufferAttribute(new Float32Array(lRot), 3));
    g.setAttribute("lCol", new THREE.InstancedBufferAttribute(new Float32Array(lCol), 3));
    g.instanceCount = lOff.length / 4;
    const mat = link(fogMat({ vertexShader: leafCardVS, fragmentShader: leafCardFS, uniforms: { uTime: {}, uGust: {}, uWind: {}, uSunDir: {}, uSun: {}, uAmb: {}, uMap: { value: null } }, side: THREE.DoubleSide }), ["uTime", "uGust", "uWind", "uSunDir", "uSun", "uAmb"]);
    mat.uniforms.uMap.value = leafTex;
    leafMesh = new THREE.Mesh(g, mat);
    leafMesh.frustumCulled = false;
    scene.add(leafMesh);
  }

  /* ---- cloud-pruned black pines along the coast and the hill ---- */
  {
    const R = rng(29), spots = [];
    for (let tries = 0; spots.length < (coarse ? 18 : 34) && tries < 3000; tries++) {
      const coast = R() < .6;
      const x = coast ? (R() - .5) * 110 : (R() - .5) * 70, z = coast ? -8 + R() * 16 : -195 - R() * 70;
      if (pathDist(x, z) < 7 || H(x, z) < .3 || Math.hypot(x - SHRINE.x, z - SHRINE.z) < 14 || (coast && x < -18 && x > -50)) continue;
      spots.push([x, z, .9 + R() * .5]);
    }
    const trunkG = new THREE.CylinderGeometry(.6, 1, 1, 6); trunkG.translate(0, .5, 0);
    const padG = new THREE.IcosahedronGeometry(1, 1);
    { const a = padG.attributes.position;                              // lumpy, flattened foliage pads
      for (let i = 0; i < a.count; i++) { v3.fromBufferAttribute(a, i); const n = 1 + .18 * Math.sin(v3.x * 5 + v3.z * 3) * Math.cos(v3.y * 4); a.setXYZ(i, v3.x * n, v3.y * n * .42, v3.z * n); }
      padG.computeVertexNormals(); }
    const PADS = 6;
    const trunks = new THREE.InstancedMesh(trunkG, M.pineBark, spots.length * 3), pads = new THREE.InstancedMesh(padG, M.pine, spots.length * PADS);
    spots.forEach(([x, z, k], i) => {
      let px = x, py = H(x, z) - .2, pz = z;
      const yaw = R() * 6.28;
      let lean = (R() - .5) * .5;
      for (let s = 0; s < 3; s++) {                                    // three crooked segments
        const l = (2.4 - s * .4) * k, r = .3 * k * (1 - s * .25);
        lean += (R() - .5) * .45;
        m4.compose(v3.set(px, py, pz), q4.setFromEuler(e3.set(0, yaw, lean, "YXZ")), s3.set(r, l, r)); trunks.setMatrixAt(i * 3 + s, m4);
        v3.set(0, l, 0).applyQuaternion(q4); px += v3.x; py += v3.y; pz += v3.z;
      }
      for (let j = 0; j < PADS; j++) {
        const a = j / PADS * 6.28 + R(), r = (j ? 1.5 + R() * 1.3 : 0) * k, sc = (1.1 + R() * .7) * k;
        place(pads, i * PADS + j, px + Math.cos(a) * r, py - (j ? R() * 2.2 : -.4) * k, pz + Math.sin(a) * r, R() * 6.28, sc * 1.4, sc, sc * 1.4);
      }
    });
    scene.add(trunks, pads);
  }

  /* ---- shoreline rocks ---- */
  {
    const R = rng(41), n = 30, rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), M.rock, n);
    const tint = new THREE.Color();
    for (let i = 0, tries = 0; i < n && tries < 2000; tries++) {
      const x = (R() - .5) * 130, z = 11 + R() * 16;
      if (pathDist(x, z) < 9 || Math.hypot(x, z - 10) < 14) continue;      // keep the opening view clear
      const k = .35 + R() * R() * 1.4;
      place(rocks, i, x, Math.max(H(x, z), -.3) - k * .2, z, R() * 6, k * 1.4, k * .6, k, R() * .4, R() * .4);
      rocks.setColorAt(i, tint.setHSL(.08, .06, .32 + R() * .18));
      i++;
    }
    scene.add(rocks);
  }

  /* ---- 1274: a fishing village burning on the shore ---- */
  let fireMesh, fires = [];
  {
    const R = rng(1274);
    const houses = [[-34, 2], [-27, -3], [-41, -5], [-22, 4], [-31, 8], [-46, 3], [-37, -11], [-25, -10]];
    const wallG = new THREE.BoxGeometry(1, 1, 1); wallG.translate(0, .5, 0);
    const roofG = new THREE.ConeGeometry(.78, 1, 4, 1); roofG.rotateY(Math.PI / 4); roofG.translate(0, .5, 0);
    const walls = new THREE.InstancedMesh(wallG, M.darkWood, houses.length), roofs = new THREE.InstancedMesh(roofG, M.thatch, houses.length);
    const smokes = [];
    houses.forEach(([x, z], i) => {
      const y = H(x, z) - .2, yaw = R() * .6 - .3, w = 4 + R() * 2, d = 3 + R() * 1.5;
      place(walls, i, x, y, z, yaw, w, 2.1, d);
      place(roofs, i, x, y + 2.05, z, yaw, w * 1.35, 2.6, d * 1.5);
      if (i % 2 === 0) { fires.push([x, y, z]); smokes.push([x, y + 3, z]); }
    });
    scene.add(walls, roofs);
    const fireG = new THREE.ConeGeometry(.9, 2.6, 7, 1, true); fireG.translate(0, 1.3, 0);
    fireMesh = new THREE.InstancedMesh(fireG, M.fire, fires.length);
    scene.add(fireMesh);
    const per = 16, base = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.attributes.position = base.attributes.position;
    const arr = [];
    smokes.forEach(([x, y, z]) => { for (let k = 0; k < per; k++) arr.push(x, y, z, k / per + R() * .03); });
    g.setAttribute("sBase", new THREE.InstancedBufferAttribute(new Float32Array(arr), 4));
    g.instanceCount = arr.length / 4;
    const mat = link(fogMat({ vertexShader: smokeVS, fragmentShader: smokeFS, uniforms: { uTime: {}, uNoise: {}, uTint: { value: null } }, transparent: true, depthWrite: false }), ["uTime", "uNoise"]);
    mat.uniforms.uTint.value = P.fog;
    const smoke = new THREE.Mesh(g, mat);
    smoke.frustumCulled = false; smoke.renderOrder = 2;
    scene.add(smoke);
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
    const bannerMat = link(fogMat({ vertexShader: clothVS, fragmentShader: clothFS, uniforms: { uTime: {}, uGust: {}, uSun: {}, uAmb: {}, uMap: { value: null } }, side: THREE.DoubleSide }), ["uTime", "uGust", "uSun", "uAmb"]);
    bannerMat.uniforms.uMap.value = bannerTex;
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
    scene.add(gate);

    // stone lanterns (tōrō) turned on a lathe
    const baseG = new THREE.LatheGeometry(V2([[0, 0], [.42, 0], [.42, .18], [.26, .26], [.16, .3], [.13, .95], [.22, 1.05], [.36, 1.12], [.36, 1.2], [0, 1.2]]), 6);
    const capG = new THREE.LatheGeometry(V2([[0, 0], [.62, 0], [.5, .1], [.18, .34], [.08, .42], [.12, .5], [.06, .62], [0, .66]]), 6); capG.translate(0, 1.69, 0);
    const boxG = new THREE.BoxGeometry(.5, .48, .5); boxG.translate(0, 1.45, 0);
    const lampG = mergeGeometries([baseG, capG]);
    const spots = [[-5.4, -214], [5.4, -214], [-5.4, -222], [5.4, -222], [-5.4, -230], [5.4, -230], [-6, -248], [6, -248]];
    const bodies = new THREE.InstancedMesh(lampG, M.stone, spots.length), lights = new THREE.InstancedMesh(boxG, M.lantern, spots.length);
    spots.forEach(([x, z], i) => { const y = H(x, z); place(bodies, i, x, y, z, Math.PI / 6, 1.25); place(lights, i, x, y, z, Math.PI / 6, 1.25); });
    scene.add(bodies, lights);

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

  /* ---- two ronin, original design ---- */
  function makeRonin(hatWide, cloth) {
    const g = new THREE.Group();
    const hakama = new THREE.Mesh(new THREE.LatheGeometry(V2([[0, 0], [.52, 0], [.5, .12], [.36, .7], [.27, 1.08], [0, 1.08]]), 12), M.hakama);
    const torso = new THREE.Mesh(new THREE.LatheGeometry(V2([[0, 1.0], [.3, 1.02], [.34, 1.35], [.4, 1.68], [.2, 1.8], [0, 1.82]]), 12), cloth);
    const obi = new THREE.Mesh(new THREE.CylinderGeometry(.31, .3, .14, 12), M.vermilion); obi.position.y = 1.1;
    const sleeveG = new THREE.CylinderGeometry(.13, .24, .7, 8);
    for (const s of [-1, 1]) { const sl = new THREE.Mesh(sleeveG, cloth); sl.position.set(s * .44, 1.42, .08); sl.rotation.set(-.5, 0, s * .32); g.add(sl); }
    const head = new THREE.Mesh(new THREE.SphereGeometry(.16, 14, 12), M.ink); head.position.y = 1.97;
    const hat = new THREE.Mesh(new THREE.LatheGeometry(V2(hatWide
      ? [[0, .32], [.12, .3], [.42, .1], [.66, 0], [.68, -.03], [0, .02]]
      : [[0, .46], [.2, .42], [.36, .12], [.44, 0], [.46, -.03], [0, .02]]), 20), M.straw);
    hat.position.y = 2.06;
    const saya = new THREE.Mesh(new THREE.CylinderGeometry(.035, .04, 1.05, 6), M.lacquer); saya.rotation.x = Math.PI / 2 + .35; saya.position.set(-.34, 1.02, -.18);
    const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .02, 12), M.straw); tsuba.rotation.x = Math.PI / 2 + .35; tsuba.position.set(-.34, 1.2, .32);
    const tsuka = new THREE.Mesh(new THREE.CylinderGeometry(.03, .032, .32, 6), M.ink); tsuka.rotation.x = Math.PI / 2 + .35; tsuka.position.set(-.34, 1.26, .48);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.03, 1.1, .06), M.steel);
    blade.position.set(.5, 1.5, .2); blade.rotation.z = -1.05; blade.visible = false;
    g.add(hakama, torso, obi, head, hat, saya, tsuba, tsuka, blade);
    g.userData.blade = blade;
    return g;
  }
  const you = makeRonin(true, M.indigo), foe = makeRonin(false, M.ink);
  const RONIN_X = 2.6;
  you.position.set(SHRINE.x - RONIN_X, SHRINE.y, SHRINE.z); you.rotation.y = Math.PI / 2;
  foe.position.set(SHRINE.x + RONIN_X, SHRINE.y, SHRINE.z); foe.rotation.y = -Math.PI / 2;
  scene.add(you, foe);

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
  const CULL2 = 175 * 175;

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < .8 ? 68 : 52;
    camera.updateProjectionMatrix();
  }
  resize();

  function update(dt, progress) {
    time += dt;
    applyPalette(progress);
    const u = progToU(progress);
    camCurve.getPoint(u, camPos); lookCurve.getPoint(u, look);
    ptr.lerp(pointer, 1 - Math.exp(-dt * 3));
    const ground = H(camPos.x, camPos.z) + EYE;
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
    for (const c of chunks) {
      const d2 = c.sphere.center.distanceToSquared(camera.position);
      c.grass.visible = d2 < CULL2;
      if (c.plume) c.plume.visible = d2 < CULL2 * .45;
    }
    // fire flicker, only while the village can be seen
    if (progress < .3) {
      fires.forEach(([x, y, z], i) => place(fireMesh, i, x, y + 2.2, z, time * .7 + i, 1.1 + .25 * Math.sin(time * 9 + i * 2), 1 + .35 * Math.sin(time * 13 + i)));
      fireMesh.instanceMatrix.needsUpdate = true;
    }

    renderer.render(scene, camera);

    // adaptive quality: step down if frames run long, never step back up (no flicker)
    acc += dt; frames++;
    if (frames === 90) {
      if (acc / frames > 1 / 48 && level < 3) {
        level++;
        dpr = Math.max(.75, dpr * .8); renderer.setPixelRatio(dpr); driftM.uniforms.uPR.value = dpr; resize();
        const k = [1, .75, .55, .4][level];
        for (const c of chunks) for (const m of [c.grass, c.plume]) if (m) m.geometry.instanceCount = Math.floor(m.geometry.userData.full * k);
      }
      frames = 0; acc = 0;
    }
    return { windAngle: wa - Math.atan2(tan.z, tan.x) };
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
    update, resize, warm, bench, renderer,
    stats: () => ({ ...STATS, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, quality: level }),
    setPointer(x, y) { pointer.set(x, y); },
    ronins: { you, foe, x: RONIN_X },
  };
}
