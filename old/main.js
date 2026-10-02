(() => {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

gsap.registerPlugin(ScrollTrigger, SplitText);

/* =====================================================================
   SOUND — everything is synthesised with Web Audio, no audio files
   ===================================================================== */
const sfx = (() => {
  let ctx, master, noise, windGain, on = false, lastTick = 0;
  const btn = $("#soundToggle");

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = .6; master.connect(ctx.destination);
    // one shared second of white noise, reused by every effect
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // looping wind bed; its level follows the cursor-driven wind in the hero
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 520; bp.Q.value = .7;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    src.connect(bp).connect(windGain).connect(master); src.start();
  }
  function burst({ freq = 3000, q = 1, dur = .08, vol = .2, type = "bandpass", sweepTo }) {
    const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + .02);
  }
  function ring(freqs, dur, vol) {
    const t = ctx.currentTime;
    freqs.forEach((fr, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = fr;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol / (i + 1), t + .005);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur * (1 - i * .15));
      o.connect(g).connect(master); o.start(t); o.stop(t + dur);
    });
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
      const n = performance.now(); if (n - lastTick < 45) return; lastTick = n;
      burst({ freq: 2400 + Math.random() * 900, q: 6, dur: .045, vol: .22 });
      ring([1320 + Math.random() * 80], .12, .025);
    },
    shing() { if (!on) return; burst({ freq: 1800, sweepTo: 7000, q: 3, dur: .45, vol: .3 }); ring([1720, 2610, 3890], 1.4, .04); },
    strike() { if (!on) return; burst({ type: "lowpass", freq: 900, q: .5, dur: .25, vol: .7 }); burst({ freq: 5000, sweepTo: 1200, q: 2, dur: .2, vol: .25 }); },
    gong() { if (!on) return; ring([110, 165, 247], 2.2, .14); },
    wind(level) { if (on && windGain) windGain.gain.setTargetAtTime(level, ctx.currentTime, .25); },
  };
  btn.addEventListener("click", () => api.set(!on));
  return api;
})();

document.addEventListener("pointerenter", e => {
  if (e.target.closest && e.target.matches("[data-sfx], .hopt")) sfx.tick();
}, true);

/* =====================================================================
   TEXT SCRAMBLE — letters resolve left to right (no blur anywhere)
   ===================================================================== */
const GLYPHS = "風月刀影侍霧火葉ABCDEFGHJKLMNPRSTUVWXYZ";
function scramble(el, to, dur = 700) {
  const from = el.textContent, len = Math.max(from.length, to.length), t0 = performance.now();
  return new Promise(res => {
    (function frame(now) {
      const p = Math.min(1, (now - t0) / dur);
      let out = "";
      for (let i = 0; i < len; i++) {
        const settle = (i / len) * .7 + .3;
        out += p >= settle ? (to[i] || "") : (to[i] === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0]);
      }
      el.textContent = out;
      p < 1 ? requestAnimationFrame(frame) : res();
    })(t0);
  });
}

/* =====================================================================
   SMOOTH SCROLL
   ===================================================================== */
const lenis = reduced ? null : new Lenis({ duration: 1.15, easing: t => 1 - Math.pow(1 - t, 4) });
if (lenis) {
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}
$$('a[href^="#"]').forEach(a => a.addEventListener("click", e => {
  const t = $(a.getAttribute("href")); if (!t) return;
  e.preventDefault();
  lenis ? lenis.scrollTo(t, { duration: 1.6 }) : t.scrollIntoView();
}));

const bar = $(".progress span");
ScrollTrigger.create({ start: 0, end: "max", onUpdate: s => gsap.set(bar, { scaleX: s.progress }) });

/* =====================================================================
   CURSOR
   ===================================================================== */
const mouse = { x: innerWidth / 2, y: innerHeight / 2, moved: false };
addEventListener("pointermove", e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true; }, { passive: true });
if (!coarse) {
  const cur = $(".cursor"), dot = $(".cursor__dot"), ringEl = $(".cursor__ring");
  const dx = gsap.quickSetter(dot, "x", "px"), dy = gsap.quickSetter(dot, "y", "px");
  const rx = gsap.quickSetter(ringEl, "x", "px"), ry = gsap.quickSetter(ringEl, "y", "px");
  let x = mouse.x, y = mouse.y;
  gsap.ticker.add((_, dt) => {
    const k = 1 - Math.exp(-dt / 60);
    x += (mouse.x - x) * k; y += (mouse.y - y) * k;
    dx(mouse.x); dy(mouse.y); rx(x); ry(y);
  });
  document.addEventListener("pointerover", e => cur.classList.toggle("is-hover", !!e.target.closest("a, button, [data-sfx], .arena")));
}

/* =====================================================================
   LOADER
   ===================================================================== */
const katanaSvg = $("#loader .katana");
$(".moon__katana").appendChild(katanaSvg.cloneNode(true));

function runLoader() {
  const word = $(".loader__word"), count = $("#count"), enter = $(".loader__enter");
  const words = ["Breathe", "Steady your hand", "Draw"];
  const tl = gsap.timeline();
  tl.from(".katana__tsuka, .katana__tsuba, .katana__habaki, #loader .katana rect", { opacity: 0, x: -30, duration: .9, ease: "expo.out", stagger: .06 })
    .from(".katana__blade, .katana__hamon", { scaleX: 0, transformOrigin: "0% 50%", duration: 2.2, ease: "expo.inOut" }, .2);
  const pct = { v: 0 };
  const ready = Promise.all([document.fonts.ready, new Promise(r => document.readyState === "complete" ? r() : addEventListener("load", r))]);
  gsap.to(pct, { v: 90, duration: 2.2, ease: "power2.inOut", onUpdate: () => count.textContent = pct.v | 0 });
  (async () => {
    for (const w of words) { await scramble(word, w, 650); await new Promise(r => setTimeout(r, 380)); }
  })();
  ready.then(() => new Promise(r => setTimeout(r, 2600))).then(() => {
    gsap.to(pct, { v: 100, duration: .4, onUpdate: () => count.textContent = pct.v | 0 });
    enter.hidden = false;
    gsap.from(enter.children, { y: 16, opacity: 0, duration: .8, stagger: .08, ease: "expo.out" });
    const remembered = store.get("tsu-sound");
    if (remembered === "1") $("[data-enter=sound]").focus();
  });
  enter.addEventListener("click", e => {
    const b = e.target.closest("[data-enter]"); if (!b) return;
    sfx.set(b.dataset.enter === "sound");
    sfx.shing();
    exitLoader();
  });
}

function exitLoader() {
  const L = $("#loader");
  // cut angle matches the polygon split (62% → 38% across the width)
  const ang = Math.atan2(-.24 * innerHeight, innerWidth) * 180 / Math.PI;
  L.style.setProperty("--cut", ang + "deg");
  const tl = gsap.timeline({ onComplete: () => { L.remove(); } });
  tl.to(".loader__inner, .loader__count", { opacity: 0, duration: .35, ease: "power2.in" })
    .to(".loader__slash", { scaleX: 1, duration: .35, ease: "expo.in" }, "-=.1")
    .add(() => { document.body.classList.remove("is-loading"); lenis && lenis.start(); heroIntro(); })
    .to(".loader__slash", { opacity: 0, duration: .3 })
    .to(".loader__half--a", { yPercent: -70, xPercent: -8, rotation: -2, duration: 1.3, ease: "expo.inOut" }, "<-.1")
    .to(".loader__half--b", { yPercent: 70, xPercent: 8, rotation: 2, duration: 1.3, ease: "expo.inOut" }, "<");
}

/* =====================================================================
   HERO — grass field + falling maple leaves, steered by the cursor
   ===================================================================== */
const field = (() => {
  const cv = $("#field"), cx = cv.getContext("2d");
  const hero = $(".hero");
  const DPR = Math.min(devicePixelRatio || 1, coarse ? 1 : 1.5);
  let W, H, layers = [], leaves = [], leaf, visible = true, t = 0;
  let wind = 0, windT = 0, gust = 0;

  const LAYERS = [
    { base: .80, hMin: .05, hMax: .11, gap: 7, col: "#4a2b17", w: 1.6, amp: 6, plume: 0 },
    { base: .89, hMin: .09, hMax: .19, gap: 6, col: "#7d4a21", w: 2.0, amp: 12, plume: 0 },
    { base: 1.02, hMin: .2, hMax: .42, gap: coarse ? 11 : 8, col: "#b9874a", w: 2.6, amp: 22, plume: 1 },
  ];

  function makeLeaf() {
    const s = 22, c = document.createElement("canvas");
    c.width = c.height = s * DPR;
    const g = c.getContext("2d"); g.scale(DPR, DPR); g.translate(s / 2, s / 2);
    g.fillStyle = "#d4492a";
    // five-lobed maple: lobes drawn as rotated ellipses
    for (let i = 0; i < 5; i++) {
      g.save(); g.rotate(-Math.PI / 2 + (i - 2) * .62);
      g.beginPath(); g.ellipse(4.5, 0, 5, 1.9, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
    return c;
  }

  function resize() {
    W = hero.clientWidth; H = hero.clientHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    layers = LAYERS.map(L => {
      const blades = [];
      for (let x = -20; x < W + 20; x += L.gap * (.6 + Math.random() * .8)) {
        blades.push({ x, h: H * (L.hMin + Math.random() * (L.hMax - L.hMin)), ph: Math.random() * 6.28, lean: (Math.random() - .5) * 10, bend: 0 });
      }
      return { ...L, blades };
    });
    leaf = leaf || makeLeaf();
    const n = coarse ? 18 : 34;
    while (leaves.length < n) leaves.push(spawn(true));
  }
  function spawn(anywhere) {
    return { x: Math.random() * W, y: anywhere ? Math.random() * H : -20, vy: 18 + Math.random() * 30, r: Math.random() * 6.28, vr: (Math.random() - .5) * 3, s: .6 + Math.random() * .7, ph: Math.random() * 6.28 };
  }

  function draw(dt) {
    t += dt;
    const inHero = mouse.moved && mouse.y < H;
    windT = inHero ? (mouse.x / W - .5) * 2 : Math.sin(t * .23) * .35;
    wind += (windT - wind) * (1 - Math.exp(-dt * 2));
    gust = .55 + .45 * Math.sin(t * .7) * Math.sin(t * .31 + 1);
    sfx.wind(visible ? (.05 + Math.abs(wind) * .1) * gust : 0);

    cx.clearRect(0, 0, W, H);
    const mx = mouse.x, my = mouse.y;
    for (const L of layers) {
      const by = H * L.base;
      cx.beginPath();
      const plumes = [];
      for (const b of L.blades) {
        let target = Math.sin(t * 1.6 + b.x * .012 + b.ph) * L.amp * gust + wind * L.amp * 1.6 + b.lean;
        if (L.plume && inHero) {
          // blades part around the cursor
          const d = b.x - mx, tipY = by - b.h;
          if (my > tipY - 60) target += Math.exp(-(d * d) / 9000) * Math.sign(d) * 55;
        }
        b.bend += (target - b.bend) * (1 - Math.exp(-dt * 6));
        const tx = b.x + b.bend, ty = by - b.h + Math.abs(b.bend) * .25;
        cx.moveTo(b.x - L.w, by);
        cx.quadraticCurveTo(b.x + b.bend * .3, by - b.h * .55, tx, ty);
        cx.quadraticCurveTo(b.x + b.bend * .3 + L.w * .4, by - b.h * .55, b.x + L.w, by);
        if (L.plume && b.ph > 3.6) plumes.push(tx, ty, Math.atan2(ty - (by - b.h * .55), tx - (b.x + b.bend * .3)));
      }
      cx.fillStyle = L.col; cx.fill();
      if (plumes.length) {
        cx.beginPath();
        for (let i = 0; i < plumes.length; i += 3) {
          const a = plumes[i + 2], ex = plumes[i] + Math.cos(a) * 10, ey = plumes[i + 1] + Math.sin(a) * 10;
          cx.moveTo(ex + 14, ey);
          cx.ellipse(ex, ey, 14, 3.6, a, 0, Math.PI * 2);
        }
        cx.fillStyle = "rgba(242,222,182,.82)"; cx.fill();
      }
    }
    for (const p of leaves) {
      p.ph += dt;
      p.x += (wind * 140 + Math.sin(p.ph * 1.3) * 22) * dt;
      p.y += p.vy * dt; p.r += p.vr * dt;
      if (p.y > H + 20 || p.x < -40 || p.x > W + 40) Object.assign(p, spawn(false), { x: wind > .3 ? -20 : wind < -.3 ? W + 20 : Math.random() * W, y: wind > .3 || wind < -.3 ? Math.random() * H * .6 : -20 });
      const c = Math.cos(p.r) * p.s, s = Math.sin(p.r) * p.s;
      cx.setTransform(c * DPR, s * DPR, -s * DPR * Math.cos(p.ph), c * DPR * Math.cos(p.ph * .8), p.x * DPR, p.y * DPR);
      cx.drawImage(leaf, -11, -11, 22, 22);
    }
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  resize();
  let rw; addEventListener("resize", () => { clearTimeout(rw); rw = setTimeout(resize, 150); });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (!visible) sfx.wind(0); }).observe(hero);
  gsap.ticker.add((_, dt) => { if (visible) draw(Math.min(dt, 50) / 1000); });
  if (reduced) draw(0);
})();

function heroIntro() {
  const split = new SplitText(".hero__title .line", { type: "chars", charsClass: "char" });
  gsap.timeline()
    .from(split.chars, { yPercent: 110, rotation: 6, duration: 1.4, stagger: .035, ease: "expo.out" }, .2)
    .from(".hero__copy .kicker, .hero__sub, .hero__scroll", { y: 20, opacity: 0, duration: 1, stagger: .1, ease: "expo.out" }, .6)
    .from(".sun", { scale: .6, opacity: 0, duration: 2, ease: "expo.out" }, 0)
    .from(".nav", { y: -30, opacity: 0, duration: 1, ease: "expo.out" }, .5);

  gsap.to(".hero__copy", { yPercent: -30, opacity: 0, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
  gsap.to(".sun", { yPercent: 40, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
}

/* =====================================================================
   SCROLL SCENES
   ===================================================================== */
const mm = gsap.matchMedia();

// 1274 — pinned; each line lights up word by word, the fleet crosses the strait
(() => {
  const fleet = $(".sea__fleet"), route = $(".sea__route");
  const len = route.getTotalLength(), boats = [];
  for (let i = 0; i < 26; i++) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", "M-7 0 L7 0 L5 3.5 L-5 3.5 Z M0 -1 L0 -11 L5 -2 Z");
    fleet.appendChild(p);
    boats.push({ el: p, off: i / 26 * .45 + Math.random() * .04, dy: (Math.random() - .5) * 26 });
  }
  const placeBoats = prog => boats.forEach(b => {
    const k = gsap.utils.clamp(0, 1, prog * 1.45 - b.off);
    const pt = route.getPointAtLength(k * len);
    b.el.setAttribute("transform", `translate(${pt.x.toFixed(1)} ${(pt.y + b.dy * (1 - k)).toFixed(1)})`);
    b.el.style.opacity = k <= 0 ? 0 : k >= 1 ? .2 : 1;
  });
  placeBoats(0);

  const lines = $$(".strait__lines li").map(li => new SplitText(li, { type: "words", wordsClass: "w" }));
  gsap.from(".year span", { yPercent: 100, duration: 1.2, stagger: .08, ease: "expo.out", scrollTrigger: { trigger: ".strait", start: "top 70%" } });

  const tl = gsap.timeline({ defaults: { ease: "none" } });
  lines.forEach((s, i) => tl.to(s.words, { opacity: 1, stagger: .08, duration: .3 }, i));
  ScrollTrigger.create({
    trigger: ".strait", start: "top top", end: "+=220%", pin: ".strait__pin", scrub: .6, animation: tl,
    onUpdate: s => placeBoats(s.progress),
  });
})();

// Two paths — the dark arch rises over the light page
(() => {
  const tl = gsap.timeline({ defaults: { ease: "none" } });
  tl.to(".paths__dark", { clipPath: "ellipse(150% 160% at 50% 100%)", duration: 1, ease: "power2.in" })
    .to(".paths__light > *:not(.kanji-bg)", { yPercent: -40, opacity: 0, duration: .7 }, 0)
    .from(".paths__dark > *", { yPercent: 60, opacity: 0, duration: .6, stagger: .05 }, .35)
    .from(".paths__dark .kanji-bg", { scale: .8, duration: 1 }, 0);
  ScrollTrigger.create({ trigger: ".paths", start: "top top", end: "+=160%", pin: ".paths__pin", scrub: .8, animation: tl,
    onEnter: () => sfx.gong() });
})();

// headings: characters rise in once
$$("[data-split]").forEach(h => {
  const s = new SplitText(h, { type: "chars,words", charsClass: "char", wordsClass: "word" });
  gsap.from(s.chars, { yPercent: 100, opacity: 0, rotation: 8, duration: 1.1, stagger: .02, ease: "expo.out", scrollTrigger: { trigger: h, start: "top 85%" } });
});
$$(".sec-head__note, .sec-head .kicker").forEach(el =>
  gsap.from(el, { y: 24, opacity: 0, duration: 1, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 90%" } }));

// virtue seals fly in; the red fill grows from wherever the cursor entered
gsap.from(".virtue", { y: 80, opacity: 0, duration: 1.1, stagger: { each: .07, from: "start" }, ease: "expo.out", scrollTrigger: { trigger: ".virtues__grid", start: "top 85%" } });
$$(".virtue").forEach(v => v.addEventListener("pointerenter", e => {
  const r = v.getBoundingClientRect();
  v.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100) + "%");
  v.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100) + "%");
}));

gsap.from(".arena", { clipPath: "inset(20% 10% 20% 10% round 6px)", duration: 1.4, ease: "expo.out", scrollTrigger: { trigger: ".arena", start: "top 85%" } });

// moon — octagon scales up while the katana slowly crosses it
mm.add("(prefers-reduced-motion: no-preference)", () => {
  const st = { trigger: ".moon", start: "top bottom", end: "bottom top", scrub: true };
  gsap.fromTo(".moon__frame", { scale: .78, rotation: -6 }, { scale: 1, rotation: 0, ease: "none", scrollTrigger: st });
  gsap.fromTo(".moon__katana", { rotation: -32, xPercent: -14 }, { rotation: 12, xPercent: 10, ease: "none", scrollTrigger: st });
});
gsap.from(".foot__big", { yPercent: 40, ease: "none", scrollTrigger: { trigger: ".foot", start: "top bottom", end: "bottom bottom", scrub: true } });

/* =====================================================================
   STANDOFF
   ===================================================================== */
(() => {
  const arena = $("#arena"), state = $("#duelState"), sign = $(".arena__sign"), flash = $(".arena__flash");
  const you = $(".ronin--you"), foe = $(".ronin--foe");
  const out = { last: $("#duelLast"), best: $("#duelBest"), wins: $("#duelWins") };
  let phase = "idle", timer, t0 = 0, inView = false;
  let best = +store.get("tsu-best") || 0, wins = +store.get("tsu-wins") || 0;
  const paint = () => { out.best.textContent = best ? best + " ms" : "—"; out.wins.textContent = wins; };
  paint();

  function reset() {
    gsap.set([you, foe], { clearProps: "rotation,x,y,opacity" });
    gsap.set($$(".ronin__blade", arena), { opacity: 0 });
    gsap.set(sign, { opacity: 0, scale: .6 });
  }
  function begin() {
    reset(); phase = "wait"; state.textContent = "Steady…";
    gsap.fromTo([you, foe], { y: 0 }, { y: 3, duration: 1.2, yoyo: true, repeat: -1, ease: "sine.inOut" });
    timer = setTimeout(() => requestAnimationFrame(() => {
      phase = "go"; t0 = performance.now();
      gsap.to(sign, { opacity: 1, scale: 1, duration: .12, ease: "expo.out" });
      state.textContent = "Strike!";
      sfx.tick();
      // foe reacts in 230–420 ms
      timer = setTimeout(() => phase === "go" && finish(false, null), 230 + Math.random() * 190);
    }), 1600 + Math.random() * 3200);
  }
  function finish(win, ms) {
    clearTimeout(timer); phase = "done";
    gsap.killTweensOf([you, foe]);
    const [winner, loser] = win ? [you, foe] : [foe, you];
    gsap.timeline()
      .set(flash, { opacity: .9 }).to(flash, { opacity: 0, duration: .5 })
      .to(winner, { x: win ? "38vw" : "-38vw", duration: .14, ease: "expo.in" }, 0)
      .set($(".ronin__blade", winner), { opacity: 1 }, 0)
      .to(sign, { opacity: 0, duration: .2 }, 0)
      .to(loser, { rotation: win ? 80 : -80, transformOrigin: "50% 100%", y: 10, opacity: .55, duration: .9, ease: "expo.out" }, .5);
    sfx.strike();
    if (ms != null) out.last.textContent = ms + " ms";
    if (win) {
      wins++; if (!best || ms < best) best = ms;
      store.set("tsu-best", best); store.set("tsu-wins", wins);
      state.textContent = ms < 200 ? `${ms} ms. Unseen.` : `${ms} ms. The duel is yours.`;
    } else {
      state.textContent = ms == null ? "Too slow. Again?" : `${ms} ms. Too slow. Again?`;
    }
    paint();
  }
  function act() {
    if (phase === "idle" || phase === "done") return begin();
    if (phase === "wait") {
      clearTimeout(timer); phase = "done"; gsap.killTweensOf([you, foe]);
      state.textContent = "Too eager. The foe saw it coming.";
      gsap.fromTo(you, { x: -6 }, { x: 0, duration: .4, ease: "elastic.out(1,.3)" });
      return;
    }
    if (phase === "go") finish(true, Math.round(performance.now() - t0));
  }
  arena.addEventListener("pointerdown", e => { e.preventDefault(); act(); });
  new IntersectionObserver(([e]) => { inView = e.intersectionRatio > .5; }, { threshold: [0, .5, 1] }).observe(arena);
  addEventListener("keydown", e => {
    if ((e.code === "Space" || e.code === "Enter") && (inView || document.activeElement === arena)) { e.preventDefault(); if (!e.repeat) act(); }
  });
})();

/* =====================================================================
   HAIKU — original lines, 5 / 7 / 5
   ===================================================================== */
(() => {
  const ROWS = [
    ["Red leaves on the wind", "Moon over the strait", "A blade in the grass"],
    ["a horse waits where no one rides", "the tide forgets every name", "smoke drifts over Komoda"],
    ["I sheathe it, and breathe", "the island stays still", "autumn, then the ghost"],
  ];
  const LABELS = ["Five", "Seven", "Five"];
  const picker = $("#haikuPicker"), outLines = $$("#haikuOut span");
  const chosen = [0, 0, 0];

  ROWS.forEach((opts, r) => {
    const row = document.createElement("div");
    row.className = "hrow";
    row.innerHTML = `<p class="hrow__label">Line ${r + 1} · ${LABELS[r]} syllables</p><div class="hrow__opts" role="group" aria-label="Line ${r + 1}"></div>`;
    const box = $(".hrow__opts", row);
    opts.forEach((txt, i) => {
      const b = document.createElement("button");
      b.className = "hopt"; b.textContent = txt; b.setAttribute("aria-pressed", i === 0);
      b.addEventListener("click", () => {
        $$(".hopt", box).forEach(x => x.setAttribute("aria-pressed", x === b));
        chosen[r] = i; write(r, true);
      });
      box.appendChild(b);
    });
    picker.appendChild(row);
  });

  function write(r, animate) {
    const el = outLines[r], txt = ROWS[r][chosen[r]];
    el.setAttribute("aria-label", txt);
    el.innerHTML = txt.split(" ").map(w => `<span class="hw" aria-hidden="true">${[...w].map(c => `<span class="ch">${c}</span>`).join("")}</span>`).join(" ");
    if (animate) gsap.from($$(".ch", el), { yPercent: 70, opacity: 0, rotation: 6, duration: .8, stagger: .018, ease: "expo.out" });
  }
  ROWS.forEach((_, r) => write(r, false));
  ScrollTrigger.create({ trigger: ".haiku__card", start: "top 80%", once: true,
    onEnter: () => outLines.forEach((el, r) => gsap.from($$(".ch", el), { yPercent: 70, opacity: 0, duration: .9, stagger: .02, delay: r * .25, ease: "expo.out" })) });
})();

/* =====================================================================
   MOON — a maple drawn once per resize, seeded so it never changes
   ===================================================================== */
(() => {
  const cv = $("#tree"), g = cv.getContext("2d");
  function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function paint() {
    const S = cv.clientWidth, D = Math.min(devicePixelRatio || 1, 2);
    if (!S) return;
    cv.width = cv.height = S * D; g.setTransform(D, 0, 0, D, 0, 0);
    const R = rng(1274);
    const sky = g.createLinearGradient(0, 0, 0, S);
    sky.addColorStop(0, "#efe4cf"); sky.addColorStop(.7, "#e6cfa6"); sky.addColorStop(1, "#c9a777");
    g.fillStyle = sky; g.fillRect(0, 0, S, S);
    g.fillStyle = "#f8efdc"; g.beginPath(); g.arc(S * .66, S * .3, S * .2, 0, 7); g.fill();
    g.fillStyle = "rgba(140,90,50,.25)";
    g.beginPath(); g.moveTo(0, S * .78);
    for (let x = 0; x <= S; x += S / 12) g.lineTo(x, S * (.72 + R() * .06));
    g.lineTo(S, S); g.lineTo(0, S); g.fill();
    g.fillStyle = "#3a2618"; g.fillRect(0, S * .86, S, S * .14);

    const tips = [];
    (function branch(x, y, len, ang, w, depth) {
      const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      g.strokeStyle = "#17110d"; g.lineWidth = w; g.lineCap = "round";
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(ang + .3) * len * .5, y + Math.sin(ang + .3) * len * .5, x2, y2); g.stroke();
      if (depth === 0 || len < 6) { tips.push(x2, y2); return; }
      const n = depth > 6 ? 2 : 2 + (R() > .6);
      for (let i = 0; i < n; i++) branch(x2, y2, len * (.68 + R() * .16), ang + (R() - .5) * 1.1 + (i - (n - 1) / 2) * .45, w * .68, depth - 1);
    })(S * .38, S * .88, S * .2, -Math.PI / 2 - .18, S * .045, 8);

    const reds = ["#b8321f", "#d4492a", "#e0683a", "#9e2a1a", "#c43e22"];
    for (let i = 0; i < tips.length; i += 2) {
      for (let k = 0; k < 7; k++) {
        g.fillStyle = reds[(R() * reds.length) | 0];
        g.globalAlpha = .55 + R() * .45;
        g.beginPath(); g.arc(tips[i] + (R() - .5) * S * .07, tips[i + 1] + (R() - .5) * S * .06, S * (.006 + R() * .012), 0, 7); g.fill();
      }
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 70; i++) {
      g.fillStyle = reds[(R() * reds.length) | 0];
      g.beginPath(); g.ellipse(S * (.1 + R() * .8), S * (.87 + R() * .1), S * .008, S * .004, R() * 3, 0, 7); g.fill();
    }
  }
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(paint, 200); });
  document.fonts.ready.then(paint);
})();

/* ===================================================================== */
if (reduced) {
  $("#loader").remove(); document.body.classList.remove("is-loading"); heroIntro();
} else {
  runLoader();
}
addEventListener("load", () => ScrollTrigger.refresh());
})();
