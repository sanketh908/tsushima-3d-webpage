import * as THREE from "three";

/* =====================================================================
   Terrain
   ===================================================================== */
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const SHRINE = { x: 0, z: -238, y: 10.5 };

export function H(x, z) {
  let h = Math.sin(x * .045 + 1.3) * 1.6 + Math.cos(z * .028 + x * .012) * 2.2 + Math.sin((x - z) * .09) * .45;
  if (Math.abs(x) > 38) h += (Math.abs(x) - 38) * .14;            // the valley walls rise away from the path
  const d = Math.hypot(x - SHRINE.x, z - SHRINE.z);
  h += 8 * sstep(48, 16, d);                                       // shrine hill
  h += (SHRINE.y - h) * sstep(17, 9, d);                           // flat top for the gate
  const b = sstep(8, 34, z);                                       // beach slides under the sea
  return h * (1 - b) + (1.2 - (z - 8) * .16) * b;
}

/* =====================================================================
   Camera path — [progress, x, z, look x, look dy, look z]
   ===================================================================== */
const KF = [
  [0,    0,   10,   0,  -.6,  90],
  [.08,  3,    8,  40,  -.4,  70],
  [.17,  5,    1,  -5,  -.5, -40],
  [.27,  1,  -25,  -6,  -.4, -70],
  [.37, -8,  -55,   2,  -.3, -100],
  [.47, -3,  -85,   8,  -.3, -130],
  [.56,  5, -112,   0,  -.2, -160],
  [.65,  0, -145,  -6,  -.2, -190],
  [.73, -4, -178,   0,   2,  -236],
  [.80,  0, -206,   0,  -.4, -240],
  [.88,  0, -228,   0, -1.5, -238],
  [.935, 0, -229,   0,  -.8, -238],
  [1,    0, -262,   0,   20, -390],
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
  [.04, pal({ top: "#34405e", horizon: "#f0b394", fog: "#d7a79a", density: .0042, sun: "#ffe2c0", sunDir: [0, .07, 1], sunSize: .0016, ground: "#5d5a40", sand: "#c9b08a", grassBase: "#3d3f24", grassTip: "#b5a46f", leaf: "#f6d9d2", glow: 0, light: 1.6, amb: .9, stars: 0 })],
  [.31, pal({ top: "#5c4630", horizon: "#f5b65c", fog: "#dca35d", density: .0062, sun: "#ffd58e", sunDir: [-.55, .1, -.83], sunSize: .0019, ground: "#5e4220", sand: "#c9b08a", grassBase: "#6b4818", grassTip: "#f5d58d", leaf: "#f7db96", glow: 0, light: 2.1, amb: 1, stars: 0 })],
  [.6,  pal({ top: "#3c1d18", horizon: "#e9804e", fog: "#c25c3c", density: .0115, sun: "#ffb072", sunDir: [.4, .14, -.9], sunSize: .0019, ground: "#3b1e13", sand: "#c9b08a", grassBase: "#4b2214", grassTip: "#cf6d3d", leaf: "#d63c22", glow: 0, light: 1.7, amb: .85, stars: 0 })],
  [.83, pal({ top: "#5a616d", horizon: "#d6d6d0", fog: "#babdbc", density: .0105, sun: "#fff6e6", sunDir: [0, .34, -1], sunSize: .0045, ground: "#46473f", sand: "#c9b08a", grassBase: "#4a4f45", grassTip: "#f1eee4", leaf: "#ffffff", glow: 0, light: 1.3, amb: 1.1, stars: 0 })],
  [.98, pal({ top: "#04060c", horizon: "#1f2d4a", fog: "#121a2c", density: .0085, sun: "#e8edf7", sunDir: [0, .3, -1], sunSize: .0034, ground: "#0b0f17", sand: "#2a2c33", grassBase: "#0e141c", grassTip: "#61728e", leaf: "#ffd877", glow: 1, light: .55, amb: .55, stars: 1 })],
];

/* =====================================================================
   Shaders
   ===================================================================== */
const FOG_V = "#include <fog_pars_vertex>";
const FOG_F = "#include <fog_pars_fragment>";
const fogMat = (o) => new THREE.ShaderMaterial({ fog: true, ...o, uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, o.uniforms]) });

const grassVS = /* glsl */`
attribute vec4 offset;  // world xyz + yaw
attribute vec2 shape;   // height, shade
uniform float uTime, uGust;
uniform vec2 uWind;
varying float vY, vShade;
${FOG_V}
void main() {
  float y = position.y, h = shape.x;
  vec3 p = vec3(position.x * (1.0 - y * .9), y * h, 0.0);
  float c = cos(offset.w), s = sin(offset.w);
  p.xz = mat2(c, -s, s, c) * p.xz;
  float ph = offset.x * .17 + offset.z * .13;
  float sway = sin(uTime * 1.7 + ph) * .16 + sin(uTime * .83 + ph * .4) * .1;
  // gusts travel across the field as visible waves
  float wave = sin(dot(offset.xz, uWind) * .09 - uTime * 2.2) * .5 + .5;
  float bend = (sway + uGust * (.25 + wave * .75)) * y * y * h;
  p.xz += uWind * bend;
  p.y -= bend * bend * .3 / h;
  vec4 mvPosition = modelViewMatrix * vec4(offset.xyz + p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vY = y; vShade = shape.y + wave * .25 * uGust;
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
varying vec3 vW, vN;
${FOG_F}
void main() {
  vec3 base = mix(uGround, uSand, smoothstep(9.0, 16.0, vW.z));
  base *= .88 + .12 * sin(vW.x * .31) * sin(vW.z * .27) + .06 * sin(vW.x * 1.7 + vW.z * 1.3);
  float d = max(dot(normalize(vN), uSunDir), 0.0);
  gl_FragColor = vec4(base * (uAmb + uSun * d * .7), 1.0);
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
uniform float uSunSize, uStars;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  vec3 col = mix(uHorizon, uTop, pow(smoothstep(-.03, .55, d.y), .65));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSun * (smoothstep(1.0 - uSunSize, 1.0 - uSunSize * .55, sd) * 1.4 + pow(sd, 90.0) * .35 + pow(sd, 9.0) * .16);
  vec3 cell = floor(d * 420.0);
  float st = step(.9975, hash(cell)) * smoothstep(.02, .3, d.y) * uStars;
  col += st * (.5 + .5 * hash(cell + 3.1));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const waterVS = groundVS;
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
  float g = pow(max(dot(reflect(-v, n), uSunDir), 0.0), 180.0);
  col += uSun * g * 2.2;
  float shore = smoothstep(26.0, 19.0, vW.z) * (.5 + .5 * sin(vW.z * 1.4 - uTime * 1.6));
  col = mix(col, vec3(1.0), shore * .35);
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

const leafVS = /* glsl */`
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
  vec3 w = mod(p - uCam + uBox * .5, uBox) - uBox * .5 + uCam;
  vec4 mvPosition = modelViewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = uSize * uPR * (.55 + r * .9) / -mvPosition.z;
  vRot = uTime * (.8 + r * 2.4) + r * 6.28;
  vA = smoothstep(uBox.x * .5, uBox.x * .3, length(w.xz - uCam.xz));
  #include <fog_vertex>
}`;
const leafFS = /* glsl */`
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

const mountVS = /* glsl */`
attribute float hn;
varying float vH;
void main() { vH = hn; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const mountFS = /* glsl */`
uniform vec3 uCol, uFogC;
varying float vH;
void main() {
  gl_FragColor = vec4(mix(uFogC, uCol, .35 + vH * .65), 1.0);
  #include <colorspace_fragment>
}`;

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
  const mountNear = new THREE.Color(), mountFar = new THREE.Color(), ambC = new THREE.Color(), tmp = new THREE.Color();

  /* ---- path ---- */
  const camPts = KF.map(k => new THREE.Vector3(k[1], H(k[1], k[2]) + EYE, k[2]));
  const lookPts = KF.map((k, i) => new THREE.Vector3(k[3], camPts[i].y + k[4], k[5]));
  const camCurve = new THREE.CatmullRomCurve3(camPts, false, "centripetal");
  const lookCurve = new THREE.CatmullRomCurve3(lookPts, false, "centripetal");
  const pathSamples = camCurve.getSpacedPoints(400);
  const nearPath = (x, z, r) => pathSamples.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < r * r);
  const progToU = p => {
    let i = 0; while (i < KF.length - 2 && p > KF[i + 1][0]) i++;
    const t = Math.min(1, Math.max(0, (p - KF[i][0]) / (KF[i + 1][0] - KF[i][0])));
    return (i + t) / (KF.length - 1);
  };

  /* ---- sky ---- */
  const skyU = { uTop: { value: P.top }, uHorizon: { value: P.horizon }, uSunDir: { value: P.sunDir }, uSun: { value: P.sun }, uSunSize: { value: P.sunSize }, uStars: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), new THREE.ShaderMaterial({ vertexShader: skyVS, fragmentShader: skyFS, uniforms: skyU, side: THREE.BackSide, depthWrite: false }));
  sky.frustumCulled = false; sky.renderOrder = -1;
  scene.add(sky);

  /* ---- mountains: two jagged rings, low toward the sea ---- */
  function ring(radius, base, amp, seed) {
    const n = 220, pos = [], hn = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2, cx = Math.sin(a), cz = Math.cos(a);
      const toSea = sstep(.2, .85, cz);                           // +z is the strait
      let h = base + amp * (.55 + .45 * Math.sin(a * 7 + seed) * Math.sin(a * 3.1 + seed * 2)) + amp * .25 * Math.abs(Math.sin(a * 23 + seed));
      h *= 1 - toSea * .82;
      pos.push(cx * radius, -20, cz * radius - 120, cx * radius, h, cz * radius - 120);
      hn.push(0, 1);
      if (i < n) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("hn", new THREE.Float32BufferAttribute(hn, 1));
    g.setIndex(idx);
    const u = { uCol: { value: new THREE.Color() }, uFogC: { value: P.fog } };
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: mountVS, fragmentShader: mountFS, uniforms: u, side: THREE.DoubleSide, depthWrite: false }));
    m.frustumCulled = false; m.renderOrder = 0;
    scene.add(m);
    return u;
  }
  const farRing = ring(720, 70, 120, 1.7), nearRing = ring(470, 25, 60, 4.2);

  /* ---- ground ---- */
  const groundU = { uGround: { value: P.ground }, uSand: { value: P.sand }, uSunDir: { value: P.sunDir }, uSun: { value: P.sun }, uAmb: { value: ambC } };
  {
    const g = new THREE.PlaneGeometry(520, 640, coarse ? 130 : 210, coarse ? 160 : 260);
    g.rotateX(-Math.PI / 2); g.translate(0, 0, -130);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) a.setY(i, H(a.getX(i), a.getZ(i)));
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, fogMat({ vertexShader: groundVS, fragmentShader: groundFS, uniforms: groundU })));
  }

  /* ---- sea ---- */
  const waterU = { uTop: { value: P.top }, uHorizon: { value: P.horizon }, uSunDir: { value: P.sunDir }, uSun: { value: P.sun }, uTime: { value: 0 } };
  {
    const g = new THREE.PlaneGeometry(2400, 1300, 1, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0, 660);
    scene.add(new THREE.Mesh(g, fogMat({ vertexShader: waterVS, fragmentShader: waterFS, uniforms: waterU })));
  }

  /* ---- the 1274 fleet on the horizon ---- */
  {
    const n = 34;
    const hull = new THREE.CylinderGeometry(1.2, .8, 9, 6, 1); hull.rotateZ(Math.PI / 2); hull.scale(1, .55, .9);
    const mast = new THREE.CylinderGeometry(.08, .1, 8, 5); mast.translate(0, 4.3, 0);
    const sail = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-2.2, 1.6), new THREE.Vector2(2.4, 1.6), new THREE.Vector2(1.9, 8), new THREE.Vector2(-1.7, 7.4)]));
    const ink = new THREE.MeshBasicMaterial({ color: 0x0b0908 }), cloth = new THREE.MeshBasicMaterial({ color: 0x241b15, side: THREE.DoubleSide });
    const parts = [new THREE.InstancedMesh(hull, ink, n), new THREE.InstancedMesh(mast, ink, n), new THREE.InstancedMesh(sail, cloth, n)];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const z = 210 + Math.random() * 300, x = (Math.random() - .5) * z * 1.5;
      q.setFromAxisAngle(up, Math.PI / 2 + (Math.random() - .5) * .9);
      const k = 1.1 + Math.random() * .6;
      m.compose(new THREE.Vector3(x, .2, z), q, s.set(k, k, k));
      parts.forEach(p => p.setMatrixAt(i, m));
    }
    scene.add(...parts);
  }

  /* ---- lights for the solid props ---- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
  const sunL = new THREE.DirectionalLight(0xffffff, 1);
  scene.add(hemi, sunL, sunL.target);

  /* ---- grass ---- */
  const grassU = { uTime: { value: 0 }, uGust: { value: .5 }, uWind: { value: new THREE.Vector2(0, -1) }, uBase: { value: P.grassBase }, uTip: { value: P.grassTip } };
  const GRASS = coarse ? 22000 : 70000;
  const grassGeo = new THREE.InstancedBufferGeometry();
  {
    const seg = 4, w = .055, pos = [], idx = [];
    for (let i = 0; i <= seg; i++) { const y = i / seg; pos.push(-w, y, 0, w, y, 0); }
    for (let i = 0; i < seg; i++) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    grassGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    grassGeo.setIndex(idx);
    const off = new Float32Array(GRASS * 4), shp = new Float32Array(GRASS * 2);
    const dir = new THREE.Vector3();
    let n = 0, guard = 0;
    while (n < GRASS && guard++ < GRASS * 4) {
      const u = .1 + Math.random() * .9;
      const c = camCurve.getPoint(u);
      camCurve.getTangent(u, dir);
      const side = (Math.random() < .5 ? -1 : 1) * Math.pow(Math.random(), 1.5) * 58;
      const x = c.x - dir.z * side + (Math.random() - .5) * 14, z = c.z + dir.x * side + (Math.random() - .5) * 14;
      if (z > 9) continue;
      const ds = Math.hypot(x - SHRINE.x, z - SHRINE.z);
      if (ds < 12.5) continue;
      const forest = z < -100 && z > -195;
      if (forest && Math.random() < .55) continue;
      let h = z < -195 ? 1.3 + Math.random() * 1.1 : forest ? .5 + Math.random() * .6 : .8 + Math.random() * 1.0;
      if (Math.abs(side) < (z < -195 ? 4 : 2.2)) h *= z < -195 ? .35 : .55;
      off.set([x, H(x, z) - .05, z, Math.random() * 6.28], n * 4);
      shp.set([h, Math.random()], n * 2);
      n++;
    }
    grassGeo.setAttribute("offset", new THREE.InstancedBufferAttribute(off, 4));
    grassGeo.setAttribute("shape", new THREE.InstancedBufferAttribute(shp, 2));
    grassGeo.instanceCount = n;
  }
  const grass = new THREE.Mesh(grassGeo, fogMat({ vertexShader: grassVS, fragmentShader: grassFS, uniforms: grassU, side: THREE.DoubleSide }));
  grass.frustumCulled = false;
  scene.add(grass);
  const grassFull = grassGeo.instanceCount;

  /* ---- maple trees ---- */
  {
    const spots = [];
    for (let tries = 0; spots.length < (coarse ? 70 : 150) && tries < 4000; tries++) {
      const z = -100 - Math.random() * 100, x = (Math.random() - .5) * 90;
      if (nearPath(x, z, 5.5)) continue;
      spots.push([x, z, .8 + Math.random() * .6]);
    }
    // a few lone maples in the open fields
    for (const [x, z] of [[-14, -20], [18, -48], [-22, -78], [16, -92], [-12, -200], [14, -214]]) spots.push([x, z, 1.25]);
    const trunkG = new THREE.CylinderGeometry(.16, .32, 1, 6); trunkG.translate(0, .5, 0);
    const leafG = new THREE.IcosahedronGeometry(1, 1);
    const trunkM = new THREE.MeshLambertMaterial({ color: 0x2a1a12 });
    const leafM = new THREE.MeshLambertMaterial({ flatShading: true });
    const PER = 6;
    const trunks = new THREE.InstancedMesh(trunkG, trunkM, spots.length);
    const crowns = new THREE.InstancedMesh(leafG, leafM, spots.length * PER);
    const reds = [0xb8321f, 0xd4492a, 0xe0683a, 0x9e2a1a, 0xc43e22, 0xe88a3c].map(c => new THREE.Color(c));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
    spots.forEach(([x, z, k], i) => {
      const y = H(x, z), th = (3.4 + Math.random() * 1.6) * k;
      e.set((Math.random() - .5) * .14, 0, (Math.random() - .5) * .14);
      m.compose(v.set(x, y - .2, z), q.setFromEuler(e), s.set(k, th, k)); trunks.setMatrixAt(i, m);
      for (let j = 0; j < PER; j++) {
        const a = j / PER * 6.28 + Math.random(), r = (j ? 1.3 : 0) * k;
        const sc = (1.4 + Math.random() * 1.1) * k;
        m.compose(v.set(x + Math.cos(a) * r, y + th + (Math.random() - .3) * 1.3 * k, z + Math.sin(a) * r), q.setFromEuler(e.set(Math.random(), Math.random(), 0)), s.set(sc, sc * .8, sc));
        crowns.setMatrixAt(i * PER + j, m);
        crowns.setColorAt(i * PER + j, reds[(Math.random() * reds.length) | 0]);
      }
    });
    scene.add(trunks, crowns);
  }

  /* ---- shrine: gate, lanterns, two figures ---- */
  const lanternM = new THREE.MeshLambertMaterial({ color: 0x8a857a, emissive: 0xffb050, emissiveIntensity: 0 });
  {
    const red = new THREE.MeshLambertMaterial({ color: 0xc23a22 }), black = new THREE.MeshLambertMaterial({ color: 0x141210 });
    const gate = new THREE.Group(), y0 = SHRINE.y;
    const pillar = new THREE.CylinderGeometry(.32, .38, 7, 12);
    for (const x of [-3.3, 3.3]) { const p = new THREE.Mesh(pillar, red); p.position.set(x, 3.5, 0); gate.add(p); }
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(8.4, .45, .4), red); nuki.position.y = 5.4; gate.add(nuki);
    const kasagi = new THREE.Mesh(new THREE.BoxGeometry(9.6, .5, .8), black); kasagi.position.y = 7.15; gate.add(kasagi);
    const shimaki = new THREE.Mesh(new THREE.BoxGeometry(9.2, .45, .7), red); shimaki.position.y = 6.75; gate.add(shimaki);
    for (const sx of [-1, 1]) {                                     // upswept ends of the top beam
      const tip = new THREE.Mesh(new THREE.BoxGeometry(1.4, .45, .8), black);
      tip.position.set(sx * 5.2, 7.3, 0); tip.rotation.z = sx * .22; gate.add(tip);
    }
    const tablet = new THREE.Mesh(new THREE.BoxGeometry(.7, 1, .12), black); tablet.position.y = 6.1; gate.add(tablet);
    gate.position.set(SHRINE.x, y0, SHRINE.z - 5);
    scene.add(gate);

    const lg = new THREE.Group();
    const lb = new THREE.BoxGeometry(.7, .3, .7), lp = new THREE.CylinderGeometry(.14, .18, 1.1, 8), lh = new THREE.BoxGeometry(.62, .55, .62), lr = new THREE.ConeGeometry(.6, .4, 4);
    const lantern = (x, z) => {
      const g = new THREE.Group(), y = H(x, z);
      const b = new THREE.Mesh(lb, lanternM); b.position.y = .15;
      const p = new THREE.Mesh(lp, lanternM); p.position.y = .85;
      const h = new THREE.Mesh(lh, lanternM); h.position.y = 1.65;
      const r = new THREE.Mesh(lr, lanternM); r.position.y = 2.1; r.rotation.y = Math.PI / 4;
      g.add(b, p, h, r); g.position.set(x, y, z); lg.add(g);
    };
    for (const z of [-214, -222, -230]) { lantern(-5.2, z); lantern(5.2, z); }
    scene.add(lg);
  }

  function makeRonin(hatWide) {
    const ink = new THREE.MeshLambertMaterial({ color: 0x0c0b0a });
    const g = new THREE.Group();
    const hakama = new THREE.Mesh(new THREE.CylinderGeometry(.28, .5, 1.05, 10), ink); hakama.position.y = .55;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(.34, .3, .75, 10), ink); torso.position.y = 1.42;
    const sh = new THREE.Mesh(new THREE.BoxGeometry(1.0, .16, .4), ink); sh.position.y = 1.78;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.17, 12, 10), ink); head.position.y = 2.0;
    const hat = new THREE.Mesh(new THREE.ConeGeometry(hatWide ? .62 : .42, hatWide ? .28 : .42, 18), ink); hat.position.y = hatWide ? 2.2 : 2.25;
    const sheath = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, 1.2), ink); sheath.position.set(.3, 1.1, .1); sheath.rotation.x = -.35;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.035, 1.15, .07), new THREE.MeshBasicMaterial({ color: 0xe9e4da }));
    blade.position.set(.48, 1.45, 0); blade.rotation.z = -1.05; blade.visible = false;
    g.add(hakama, torso, sh, head, hat, sheath, blade);
    g.userData.blade = blade;
    return g;
  }
  const you = makeRonin(true), foe = makeRonin(false);
  const RONIN_X = 2.6;
  you.position.set(SHRINE.x - RONIN_X, SHRINE.y, SHRINE.z); you.rotation.y = Math.PI / 2;
  foe.position.set(SHRINE.x + RONIN_X, SHRINE.y, SHRINE.z); foe.rotation.y = -Math.PI / 2;
  scene.add(you, foe);

  /* ---- leaves / petals / fireflies ---- */
  const LEAVES = coarse ? 650 : 1800;
  const leafU = { uTime: { value: 0 }, uSize: { value: 110 }, uPR: { value: dpr }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(70, 26, 70) }, uWind: { value: grassU.uWind.value }, uColor: { value: P.leaf }, uGlow: { value: 0 } };
  {
    const g = new THREE.BufferGeometry(), s = new Float32Array(LEAVES * 4);
    for (let i = 0; i < s.length; i++) s[i] = Math.random();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(LEAVES * 3), 3));
    g.setAttribute("seed", new THREE.BufferAttribute(s, 4));
    const pts = new THREE.Points(g, fogMat({ vertexShader: leafVS, fragmentShader: leafFS, uniforms: leafU, transparent: true, depthWrite: false }));
    pts.frustumCulled = false;
    scene.add(pts);
  }

  /* ---- your images, hung as scrolls along the fields ---- */
  const loader = new THREE.TextureLoader();
  function addMemories(urls) {
    const frameM = new THREE.MeshLambertMaterial({ color: 0x15110d });
    urls.slice(0, 12).forEach((url, i) => {
      loader.load(url, tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        const ar = tex.image.width / tex.image.height, hgt = 3.4, wid = hgt * ar;
        const u = .2 + (i / Math.max(1, urls.length - 1)) * .45 * (urls.length > 1 ? 1 : 0);
        const p = camCurve.getPoint(u), t = camCurve.getTangent(u);
        const side = i % 2 ? 1 : -1;
        const x = p.x - t.z * side * 7.5, z = p.z + t.x * side * 7.5, y = H(x, z);
        const g = new THREE.Group();
        const img = new THREE.Mesh(new THREE.PlaneGeometry(wid, hgt), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: true }));
        const fr = new THREE.Mesh(new THREE.BoxGeometry(wid + .3, hgt + .9, .08), frameM); fr.position.z = -.06;
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, wid + .8, 8), frameM); rod.rotation.z = Math.PI / 2; rod.position.y = hgt / 2 + .5;
        const rod2 = rod.clone(); rod2.position.y = -hgt / 2 - .5;
        g.add(fr, img, rod, rod2);
        g.position.set(x, y + hgt / 2 + 1.4, z);
        g.lookAt(p.x, y + hgt / 2 + 1.4, p.z);
        g.userData.bob = Math.random() * 6;
        memories.push(g); scene.add(g);
      });
    });
  }
  const memories = [];

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
    skyU.uSunSize.value = P.sunSize; skyU.uStars.value = P.stars;
    ambC.copy(P.horizon).lerp(P.top, .45).multiplyScalar(P.amb * .75);
    hemi.color.copy(P.top).lerp(P.horizon, .5); hemi.groundColor.copy(P.ground); hemi.intensity = P.amb * 1.6;
    sunL.color.copy(P.sun); sunL.intensity = P.light;
    mountNear.copy(P.fog).lerp(P.top, .55).multiplyScalar(.62);
    mountFar.copy(P.fog).lerp(P.horizon, .35).lerp(P.top, .25);
    nearRing.uCol.value.copy(mountNear); farRing.uCol.value.copy(mountFar);
    leafU.uGlow.value = P.glow;
    lanternM.emissiveIntensity = P.stars * 1.4;
    tmp.copy(P.fog);
  }

  /* ---- loop state ---- */
  const look = new THREE.Vector3(), camPos = new THREE.Vector3(), tan = new THREE.Vector3();
  const pointer = new THREE.Vector2(), ptr = new THREE.Vector2();
  let time = 0, level = 0, frames = 0, acc = 0;

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < .8 ? 68 : 52;                               // wider lens on tall phones
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
    camera.position.set(camPos.x, ground + Math.sin(time * 1.3) * .04, camPos.z);   // breathing, like sitting on a horse                // breathing, like sitting on a horse
    camCurve.getTangent(u, tan);
    look.x += -tan.z * ptr.x * 2.2; look.z += tan.x * ptr.x * 2.2; look.y += ptr.y * 1.2;
    camera.lookAt(look);
    sky.position.copy(camera.position);

    // wind = travel direction, swung by the cursor
    const wa = Math.atan2(tan.z, tan.x) + ptr.x * 1.1;
    grassU.uWind.value.set(Math.cos(wa), Math.sin(wa));
    grassU.uGust.value = .45 + .35 * Math.sin(time * .45) * Math.sin(time * .27 + 1) + Math.abs(ptr.x) * .35;
    grassU.uTime.value = leafU.uTime.value = waterU.uTime.value = time;
    leafU.uCam.value.copy(camera.position);
    sunL.position.copy(camera.position).addScaledVector(P.sunDir, 100); sunL.target.position.copy(camera.position);
    for (const m of memories) m.position.y += Math.sin(time + m.userData.bob) * .0015;

    renderer.render(scene, camera);

    // adaptive quality: step down if frames run long, never step back up (no flicker)
    acc += dt; frames++;
    if (frames === 90) {
      const avg = acc / frames;
      if (avg > 1 / 48 && level < 3) {
        level++;
        dpr = Math.max(.75, dpr * .8); renderer.setPixelRatio(dpr); leafU.uPR.value = dpr; resize();
        grassGeo.instanceCount = Math.floor(grassFull * [1, .75, .55, .4][level]);
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

  return {
    update, resize, warm, addMemories, bench, renderer,
    setPointer(x, y) { pointer.set(x, y); },
    ronins: { you, foe, x: RONIN_X },
    get quality() { return level; },
  };
}
