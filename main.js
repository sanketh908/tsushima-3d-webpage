import { createWorld } from "./world.js";
import { createIntro } from "./intro.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* =====================================================================
   STORY — chapters and subtitles, keyed to scroll progress (0–1)
   ===================================================================== */
const CHAPTERS = [
  { at: 0,   k: "浜辺", n: "Chapter one",   name: "Komoda Beach",       sub: "Tenth month, 1274" },
  { at: .18, k: "野原", n: "Chapter two",   name: "The Golden Fields",  sub: "Where the wind runs" },
  { at: .5,  k: "紅葉", n: "Chapter three", name: "Maple Forest",       sub: "Autumn burns" },
  { at: .72, k: "神社", n: "Chapter four",  name: "Shrine on the Hill", sub: "Someone is waiting" },
  { at: .945, k: "月",  n: "Chapter five",  name: "Moonrise",           sub: "The island rests", quiet: true },
];
const LINES = [
  [.025, .07, "Tsushima. The tenth month of 1274."],
  [.075, .12, "A Yuan–Goryeo fleet of some nine hundred ships appears off the coast."],
  [.125, .175, "Its first landfall is Komoda beach. The deputy governor, Sō Sukekuni, rides out with about eighty horsemen."],
  [.215, .275, "None of them come back. The fleet sails on to Iki, then to Hakata Bay."],
  [.29, .36, "Today the island is quiet. Most of it is still forest and mountain."],
  [.375, .46, coarse ? "Drag across the screen. The wind follows you." : "Move your cursor. The wind follows you."],
  [.535, .565, "The maples turn red every autumn. Stop here a while."],
  [.575, .615, "Red leaves on the wind"],
  [.615, .655, "a horse waits where no one rides"],
  [.655, .7, "the island stays still"],
  [.735, .775, "A gate on the hill. A samurai in laced armour is waiting."],
  [.8, .84, "Two samurai meet at the gate. Neither steps aside."],
  [.845, .87, "Hands on hilts. The wind drops."],
  [.885, .93, "Blades drawn. Neither moves first."],
];
const DUEL_WIN = [.8, .935];
const END_AT = .955;

/* =====================================================================
   SOUND — synthesised with Web Audio, no audio files
   ===================================================================== */
const sfx = (() => {
  let ctx, master, noise, windG, waveG, on = false, lastTick = 0, crickets = 0;
  const btn = $("#soundToggle");
  // miyako-bushi scale (D Eb G A Bb), the classic koto mode
  const SCALE = [293.66, 311.13, 392, 440, 466.16, 587.33, 622.25, 784];

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = .7; master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const bed = (freq, q) => {
      const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(f).connect(g).connect(master); s.start();
      return g;
    };
    windG = bed(520, .6);
    waveG = bed(380, .4);
  }
  function burst({ freq = 3000, q = 1, dur = .08, vol = .2, type = "bandpass", to }) {
    const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + dur + .05);
  }
  function tone(freq, dur, vol, type = "sine", at = 0) {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .004);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + .02);
  }
  function pluck(freq, at) {
    tone(freq, 2.2, .09, "triangle", at); tone(freq * 2, 1.1, .03, "sine", at); tone(freq * 3.01, .5, .012, "sine", at);
  }
  const api = {
    get on() { return on; },
    set(v) {
      if (v) init();
      on = v;
      if (ctx) v ? ctx.resume() : ctx.suspend();
      btn.setAttribute("aria-pressed", v);
      $(".sound__label", btn).textContent = v ? "Sound on" : "Sound off";
      store.set("tsu-sound", v ? "1" : "0");
    },
    tick() {
      if (!on) return;
      const n = performance.now(); if (n - lastTick < 50) return; lastTick = n;
      burst({ freq: 2600 + Math.random() * 800, q: 7, dur: .04, vol: .18 });
    },
    phrase() {
      if (!on) return;
      let i = 2 + (Math.random() * 3) | 0;
      for (let k = 0; k < 3; k++) { pluck(SCALE[i], k * .32); i = clamp(i + [-2, -1, 1, 2][(Math.random() * 4) | 0], 0, SCALE.length - 1); }
    },
    shing() { if (!on) return; burst({ freq: 1800, to: 7000, q: 3, dur: .45, vol: .3 }); tone(1720, 1.3, .04); tone(2610, 1, .02); },
    strike() { if (!on) return; burst({ type: "lowpass", freq: 900, q: .5, dur: .25, vol: .8 }); burst({ freq: 5000, to: 1200, q: 2, dur: .2, vol: .25 }); },
    drum() { if (!on) return; tone(70, .6, .5); tone(140, .25, .12); burst({ type: "lowpass", freq: 300, dur: .15, vol: .3 }); },
    ambience(p, gust) {
      if (!on || !ctx) return;
      const t = ctx.currentTime;
      const sea = clamp(1 - p / .16, 0, 1);
      windG.gain.setTargetAtTime((.03 + gust * .07) * (1 - sea * .6), t, .3);
      waveG.gain.setTargetAtTime(sea * (.06 + .05 * Math.sin(t * .5)), t, .3);
      if (p > .93 && t - crickets > .9 && Math.random() < .5) {         // night: crickets
        crickets = t;
        for (let k = 0; k < 3; k++) tone(4300 + Math.random() * 200, .05, .012, "sine", k * .07);
      }
    },
  };
  btn.addEventListener("click", () => api.set(!on));
  return api;
})();
document.addEventListener("pointerenter", e => {
  if (e.target.closest && e.target.matches("button, a, .hopt")) sfx.tick();
}, true);

/* =====================================================================
   FILM GRAIN — one small noise tile, moved by CSS (compositor only)
   ===================================================================== */
{
  const c = document.createElement("canvas"); c.width = c.height = 160;
  const g = c.getContext("2d"), img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  $(".fx-grain").style.backgroundImage = `url(${c.toDataURL()})`;
}

/* =====================================================================
   WORLD + SCROLL
   ===================================================================== */
const world = createWorld($("#world"), { coarse });
if (location.search.includes("bench")) window.__world = world;

const intro = createIntro($("#introCanvas"));
if (location.search.includes("bench")) window.__intro = intro;

const lenis = reduced ? null : new Lenis({ duration: 1.6, easing: t => 1 - Math.pow(1 - t, 4), touchMultiplier: 1.4 });
// the page scrolls through the intro (first 300vh), then the ride (the rest) mapped to 0–1
const maxScroll = () => document.documentElement.scrollHeight - innerHeight;
const introPx = () => $(".intro-track").offsetHeight, outroPx = () => $(".outro-track").offsetHeight;
const rideLen = () => Math.max(1, maxScroll() - introPx() - outroPx());
const goTo = p => { const y = introPx() + p * rideLen(); lenis ? lenis.scrollTo(y, { duration: 2.4 }) : window.scrollTo(0, y); };
let target = 0, progress = 0, introTarget = 0, introT = 0, outroTarget = 0, outroT = 0;
const readScroll = () => {
  const y = lenis ? lenis.scroll : scrollY;
  introTarget = clamp(y / introPx(), 0, 1);
  target = clamp((y - introPx()) / rideLen(), 0, 1);
  outroTarget = clamp((y - introPx() - rideLen()) / outroPx(), 0, 1);
};
if (lenis) lenis.on("scroll", readScroll); else addEventListener("scroll", readScroll, { passive: true });

let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { world.resize(); intro.resize(); readScroll(); }, 120); });
addEventListener("pointermove", e => {
  const x = (e.clientX / innerWidth - .5) * 2, y = -(e.clientY / innerHeight - .5) * 2;
  world.setPointer(x, y); intro.setPointer(x, y);
}, { passive: true });
// sound starts off (browsers need a gesture); a returning visitor who left it on gets it back on their first click or key
const resume = () => { if (store.get("tsu-sound") === "1" && !sfx.on) sfx.set(true); };
addEventListener("pointerdown", resume, { once: true });
addEventListener("keydown", resume, { once: true });

$$("[data-go]").forEach(b => b.addEventListener("click", () => goTo(+b.dataset.go)));
$("#bwToggle").addEventListener("click", e => {
  const on = document.body.classList.toggle("is-bw");
  e.currentTarget.setAttribute("aria-pressed", on);
});

/* =====================================================================
   HUD pieces
   ===================================================================== */
const rail = $(".rail");
CHAPTERS.forEach((c, i) => {
  const b = document.createElement("button");
  b.innerHTML = `<span class="rail__name">${c.name}</span><span class="rail__k">${"一二三四五"[i]}</span>`;
  b.setAttribute("aria-label", `${c.n}: ${c.name}`);
  b.addEventListener("click", () => goTo(i ? c.at + .012 : 0));
  rail.appendChild(b);
});
const railBtns = $$("button", rail);

// letterbox bars: shown while any reason (a title card) holds them
const cineBy = new Set();
const cine = (why, on) => { on ? cineBy.add(why) : cineBy.delete(why); document.body.classList.toggle("is-cine", cineBy.size > 0); };

const card = $(".card");
let cardTl;
function showCard(c) {
  cardTl && cardTl.kill();
  $(".card__num").textContent = c.n;
  $(".card__k").innerHTML = [...c.k].map(ch => `<span>${ch}</span>`).join("");
  $(".card__name").textContent = c.name;
  $(".card__sub").textContent = c.sub;
  cine("card", true);
  sfx.phrase();
  cardTl = gsap.timeline({ onComplete: () => cine("card", false), onInterrupt: () => cine("card", false) })
    .set(card, { visibility: "visible", opacity: 1 })
    .fromTo(".card__num", { opacity: 0, letterSpacing: ".6em" }, { opacity: 1, letterSpacing: ".3em", duration: 1.4, ease: "expo.out" }, 0)
    .fromTo(".card__k span", { opacity: 0, yPercent: 30, scale: 1.15 }, { opacity: 1, yPercent: 0, scale: 1, duration: 1.4, stagger: .14, ease: "expo.out" }, .1)
    .fromTo(".card__stroke", { scaleX: 0 }, { scaleX: 1, duration: 1, ease: "expo.inOut" }, .35)
    .fromTo(".card__name, .card__sub", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 1.1, stagger: .1, ease: "expo.out" }, .55)
    .to(card, { opacity: 0, duration: .9, ease: "power2.in" }, 3.1)
    .set(card, { visibility: "hidden" });
}

const sub = $(".subtitle");
let subIdx = -1;
function setSubtitle(i) {
  if (i === subIdx) return;
  subIdx = i;
  gsap.killTweensOf(sub);
  gsap.to(sub, { opacity: 0, duration: .25, onComplete: () => {
    if (i < 0) { sub.textContent = ""; return; }
    sub.innerHTML = LINES[i][2].split(" ").map(w => `<span class="w">${w}</span>`).join(" ");
    gsap.set(sub, { opacity: 1 });
    gsap.from($$(".w", sub), { opacity: 0, y: 8, duration: .7, stagger: .035, ease: "expo.out" });
  } });
}

const arrow = $(".wind__arrow");
// journey bar along the bottom, with a tick per chapter
const journey = $(".journey__fill");
CHAPTERS.slice(1).forEach(c => { const t = document.createElement("i"); t.style.left = c.at * 100 + "%"; $(".journey").appendChild(t); });
const endEl = $(".end");

/* =====================================================================
   STANDOFF — scroll plays it: approach, stance, the draw, one cut
   ===================================================================== */
const standoff = (() => {
  const { you, foe, x: RX } = world.ronins;
  const Z = you.position.z, Y = you.position.y;
  let opened = false;
  return function (p) {
    const s = clamp((p - DUEL_WIN[0]) / (DUEL_WIN[1] - DUEL_WIN[0]), 0, 1);
    const walk = sstep(0, .35, s), open = sstep(.6, .78, s);
    const step = Math.abs(Math.sin(walk * Math.PI * 5)) * .035 * (1 - walk);   // footfalls while they close in
    you.position.set(-(RX + 3.6 * (1 - walk)), Y + step, Z);
    foe.position.set(RX + 3.6 * (1 - walk), Y + step, Z);
    you.rotation.z = Math.sin(walk * Math.PI * 5) * .02 * (1 - walk); foe.rotation.z = -you.rotation.z;
    you.userData.ready(sstep(.32, .48, s)); foe.userData.ready(sstep(.36, .52, s));
    // the end: both draw fully and come round into guard, blades levelled at each other, and hold
    you.userData.pose(sstep(.55, .85, s), true); foe.userData.pose(sstep(.6, .9, s), true);
    if (s > .62 !== opened) { opened = !opened; if (opened) sfx.shing(); }
  };
})();

/* =====================================================================
   FRAME LOOP — one ticker drives scroll, world and HUD
   ===================================================================== */
let chapter = -1, riding = false, fps = 60, statsAt = 0;
const statsEl = $("#stats");
const fmt = n => n >= 1000 ? (n / 1000).toFixed(n >= 1e5 ? 0 : 1) + "k" : String(n);
function paintStats() {
  const s = world.stats();
  statsEl.innerHTML = [["Grass blades", fmt(s.blades)], ["Pampas plumes", fmt(s.plumes)], ["Leaf cards", fmt(s.leafCards)], ["Triangles / frame", fmt(s.tris)], ["Draw calls", s.calls], ["Frame rate", Math.round(fps) + " fps"]]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
}
function frame(time, dtMs) {
  if (lenis) lenis.raf(time * 1000);
  const dt = Math.min(dtMs, 60) / 1000;
  progress += (target - progress) * (1 - Math.exp(-dt * 5));
  if (Math.abs(target - progress) < 1e-5) progress = target;
  introT += (introTarget - introT) * (1 - Math.exp(-dt * 6));
  if (Math.abs(introTarget - introT) < 1e-4) introT = introTarget;
  outroT += (outroTarget - outroT) * (1 - Math.exp(-dt * 6));
  if (Math.abs(outroTarget - outroT) < 1e-4) outroT = outroTarget;
  slashCheck(); closeCheck();
  const p = progress, inIntro = cutS.c < 1, inOutro = closeS.c > .001 || outroT > .001;
  if (inIntro) playIntro(introT, time, dt);
  else if (inOutro) playOutro(outroT, time, dt);
  else if (!introEl.classList.contains("is-done")) introEl.classList.add("is-done");
  if (!inOutro && credits.classList.contains("is-on")) { credits.classList.remove("is-on"); credits.style.opacity = 0; }
  const info = world.update(dt, p, cutS.c > .25 && closeS.c < .5);  // the world is hidden behind the intro and once sealed
  if (dt > 0) fps += (1 / dt - fps) * .05;
  const ride = !inIntro && closeS.c < .1;
  if (riding !== ride) { riding = ride; document.body.classList.toggle("is-riding", riding); }
  if (!riding) return;

  arrow.style.transform = `rotate(${(info.windAngle * 180 / Math.PI).toFixed(1)}deg)`;
  journey.style.transform = `scaleX(${p.toFixed(4)})`;
  sfx.ambience(p, Math.abs(info.windAngle));
  document.body.classList.toggle("at-start", p < .012);

  let c = 0; while (c < CHAPTERS.length - 1 && p >= CHAPTERS[c + 1].at) c++;
  if (c !== chapter) {
    chapter = c;
    railBtns.forEach((b, i) => b.setAttribute("aria-current", i === c));
    if (!CHAPTERS[c].quiet) showCard(CHAPTERS[c]); else { cardTl && cardTl.progress(1); sfx.phrase(); }
  }
  setSubtitle(LINES.findIndex(([a, b]) => p >= a && p < b));
  standoff(p);
  endEl.classList.toggle("is-on", p >= END_AT);
}

/* =====================================================================
   INTRO — scroll draws the katana, then the screen is cut open onto the island
   ===================================================================== */
const scramble = (el, to, dur = 650) => {
  const G = "風月刀影侍霧火葉ABCDEFGHJKLMNPRSTUVWXYZ", len = to.length, t0 = performance.now(), id = el.dataset.sid = Math.random();
  (function f(now) {
    if (el.dataset.sid != id) return;                                  // a newer word took over
    const p = Math.min(1, (now - t0) / dur);
    let s = "";
    for (let i = 0; i < len; i++) s += p >= (i / len) * .7 + .3 || to[i] === " " ? to[i] : G[(Math.random() * G.length) | 0];
    el.textContent = s;
    if (p < 1) requestAnimationFrame(f);
  })(t0);
};
// callouts: label the sword's parts while it turns side-on, and the hamon once the blade is out
const notes = intro.anchors.map((a, i) => {
  const el = document.createElement("div");
  el.className = "note note--" + ["up", "down", "down", "up", "up"][i];          // keep neighbours apart
  el.innerHTML = `<i></i><span><b>${a.name}</b><small>${a.text}</small></span>`;
  $(".intro__notes").appendChild(el);
  return el;
});
const NOTE_WIN = [[.21, .43], [.23, .43], [.25, .43], [.27, .43], [.6, .7]];
const introEl = $("#intro"), I = { big: $(".intro__big"), meta: $(".intro__meta"), word: $(".intro__word"), cue: $(".intro__cue"), slash: $(".intro__slash") };
const WORDS = [[.2, "Breathe"], [.42, "Steady your hand"], [.68, "Draw"], [.82, ""]];
let wordIdx = -1, drawn = false, cut = false;
// once the blade is up, the cut plays on its own: a timed slash, then the frame parts onto the beach
const cutS = { c: 0 };
let cutTl = null;
function slashCheck() {
  if (!cutTl && introT >= .84) {
    const y = lenis ? lenis.scroll : scrollY, land = y < introPx();
    cutTl = gsap.to(cutS, { c: 1, duration: 1.8, ease: "none" });
    if (land) lenis ? lenis.scrollTo(introPx(), { duration: 1.8, lock: true }) : window.scrollTo(0, introPx());
  } else if (cutTl && introTarget < .8) { cutTl.kill(); cutTl = null; cutS.c = 0; }   // scrolled back up: sheathe the cut
}
function setCut() { introEl.style.setProperty("--cut", Math.atan2(-.24 * innerHeight, innerWidth) * 180 / Math.PI + "deg"); }
setCut(); addEventListener("resize", setCut);
function playIntro(t, time, dt) {
  introEl.classList.remove("is-done");
  const c = cutS.c;
  intro.update(t, c, time, dt);
  intro.anchors.forEach((a, i) => {
    const [s, e] = NOTE_WIN[i], onScreen = a.x > 24 && a.x < innerWidth - 24 && a.y > 60 && a.y < innerHeight - 60;
    const o = onScreen ? sstep(s, s + .03, t) * (1 - sstep(e - .03, e, t)) : 0;
    notes[i].style.opacity = o;
    if (o > 0) { notes[i].style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px)`; notes[i].classList.toggle("note--left", a.x > innerWidth - 230); }
  });
  const fade = 1 - sstep(.08, .3, t);
  I.big.style.opacity = fade; I.big.style.transform = `translateY(${(1 - fade) * 12}vh)`;
  I.meta.style.opacity = fade; I.meta.style.transform = `translateY(${-(1 - fade) * 4}vh)`;
  I.cue.style.opacity = 1 - sstep(0, .05, t);
  let wi = -1; while (wi < WORDS.length - 1 && t >= WORDS[wi + 1][0]) wi++;
  if (wi !== wordIdx) { wordIdx = wi; scramble(I.word, wi < 0 ? "" : WORDS[wi][1]); }
  // the stroke: a white streak where the blade passed, then the frame parts along it
  const streak = sstep(.16, .26, c), open = Math.pow(sstep(.26, 1, c), .8);
  I.slash.style.opacity = streak * (1 - sstep(.5, .7, c));
  I.slash.style.transform = `rotate(var(--cut)) scaleX(${streak})`;
  if (open > 0) {
    const g = open * 75;                                                // gap in % of the height, centred on the cut line
    introEl.style.setProperty("--clip", `polygon(0 0, 100% 0, 100% ${38 - g}%, 0 ${62 - g}%, 0 ${62 + g}%, 100% ${38 + g}%, 100% 100%, 0 100%)`);
  } else introEl.style.removeProperty("--clip");
  if (t > .68 !== drawn) { drawn = !drawn; if (drawn) sfx.shing(); }
  if (c > .2 !== cut) { cut = !cut; if (cut) sfx.strike(); }
}

/* =====================================================================
   OUTRO — the frame seals shut along the cut, the blade is lowered and sheathed, then the credits
   ===================================================================== */
const credits = $(".credits"), introCv = $("#introCanvas"), dusk = $(".dusk");
let homed = false, sealed = false;
// the close plays on its own, like the opening cut: darken, seal along the cut, the blade rises back over the shoulder
const closeS = { c: 0 };
let closeTl = null;
function closeCheck() {
  if (!closeTl && outroTarget > .03) {
    closeTl = gsap.to(closeS, { c: 1, duration: 2.2, ease: "none" });
    const land = introPx() + rideLen() + outroPx() * .2, y = lenis ? lenis.scroll : scrollY;
    if (y < land) lenis ? lenis.scrollTo(land, { duration: 2.2, lock: true, easing: t => 1 - Math.pow(1 - t, 3) }) : window.scrollTo(0, land);
  } else if (closeTl && outroTarget < .015) { closeTl.kill(); closeTl = null; gsap.to(closeS, { c: 0, duration: .9, ease: "power2.out" }); }   // scrolled back: reopen
}
function playOutro(o, time, dt) {
  const cl = closeS.c;
  introEl.classList.remove("is-done");
  endEl.classList.toggle("is-on", cl < .05);
  dusk.style.opacity = sstep(0, .16, cl) * .55;                       // dim the night so the closing halves read against it
  // blade rests on the cut line while the halves close, then sweeps back up; after that the scroll sheathes it
  const swing = sstep(.52, .86, cl);
  const t = mix(.84, .3, sstep(.2, .82, o));
  intro.update(cl < 1 ? .84 : t, cl < .52 ? .5 : mix(.22, 0, swing), time, dt, true);
  notes.forEach(n => n.style.opacity = 0);
  for (const el of [I.big, I.meta, I.cue]) el.style.opacity = 0;
  wordIdx = -2;                                                         // the intro rewrites its words when scrolled back to
  const w = o > .3 && o < .62 ? "Sheathe the blade" : "";
  if (w !== I.word.dataset.last) { I.word.dataset.last = w; scramble(I.word, w); }
  const open = 1 - Math.pow(sstep(.1, .46, cl), 1.4);                 // the two halves slide back together along the cut
  const streak = sstep(.4, .47, cl) * (1 - sstep(.5, .66, cl));          // a white seam flashes where they meet
  I.slash.style.opacity = streak; I.slash.style.transform = `rotate(var(--cut)) scaleX(${sstep(.38, .48, cl)})`;
  if (cl > .47 !== sealed) { sealed = !sealed; if (sealed) sfx.strike(); }
  if (open > 0) {
    const g = open * 75;
    introEl.style.setProperty("--clip", `polygon(0 0, 100% 0, 100% ${38 - g}%, 0 ${62 - g}%, 0 ${62 + g}%, 100% ${38 + g}%, 100% 100%, 0 100%)`);
  } else introEl.style.removeProperty("--clip");
  if (t < .45 !== homed) { homed = !homed; if (homed) { sfx.tick(); sfx.drum(); } }   // the soft click of the guard meeting the mouth
  const show = sstep(.82, .96, o);
  credits.style.opacity = show; credits.classList.toggle("is-on", show > .05);
  introCv.style.transform = show ? `translateY(${(-show * 24).toFixed(2)}vh)` : "";          // lift the sheathed sword above the credits
  if (show > 0 && time - statsAt > .5) { statsAt = time; paintStats(); }
}
const mix = (a, b, t) => a + (b - a) * t;

if (lenis) gsap.ticker.lagSmoothing(0);
gsap.ticker.add(frame);
history.scrollRestoration = "manual";
window.scrollTo(0, 0);
// boot: fonts and every world shader compiled before the curtain lifts
Promise.all([document.fonts.ready, new Promise(r => requestAnimationFrame(() => { world.warm(); r(); }))])
  .then(() => document.body.classList.remove("is-loading"));
