/* script.js */

const envelope = document.getElementById("envelope");
const heartSeal = document.getElementById("heartSeal");
const hint = document.getElementById("hint");

const wishText = document.getElementById("wishText");
const footerMsg = document.getElementById("footerMsg");

const cake = document.getElementById("cake");
const flame = document.getElementById("flame");
const smoke = document.getElementById("smoke");
const wick = document.getElementById("wick");

const closeLetterBtn = document.getElementById("closeLetterBtn");

const ending = document.getElementById("ending");
const closeCard = document.getElementById("closeCard");

const micToggle = document.getElementById("micToggle");
const inlineTapHint = document.getElementById("inlineTapHint");

const tip = document.getElementById("tip");
const canvas = document.getElementById("fx");
const ctx = canvas.getContext("2d", { alpha: true });

/* Steps */
const steps = document.getElementById("steps");
const step1 = document.getElementById("step1");
const step2 = document.getElementById("step2");
const step3 = document.getElementById("step3");
const stepMicBtn = document.getElementById("stepMicBtn");

/* ===== state ===== */
let opened = false;
let lastWish = -1;
let effectIndex = 0;
let wishTimer = null;

/* ===== MIC ===== */
let micStream = null;
let audioCtx = null;
let analyser = null;
let micRAF = null;
let blowHoldMs = 0;
let lastTs = 0;
let micEnabled = false;

// iOS/Safari quirks hardening
const IS_IOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// Blow detection auto-calibration
let micBaseline = null;   // { start, sum, n, avg }
let blowThreshold = null; // computed dynamic threshold

function ensureAudioAwake() {
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}
// iOS often needs a gesture to unlock WebAudio
document.addEventListener("touchend", () => ensureAudioAwake(), { once: true, passive: true });
document.addEventListener("click", () => ensureAudioAwake(), { once: true });

// Sinatra song: starts when user enables mic (button "включить звук"), stops when candle is blown out
const sinatraSongEl = document.getElementById("sinatraSong");
let sinatraStarted = false;

function playSinatra() {
  if (!sinatraSongEl) return;
  sinatraStarted = true;
  try { sinatraSongEl.currentTime = 0; } catch (e) {}
  const p = sinatraSongEl.play();
  if (p && typeof p.catch === "function") {
    p.catch(() => { sinatraStarted = false; });
  }
}
function stopSinatra() {
  if (!sinatraSongEl) return;
  sinatraStarted = false;
  try { sinatraSongEl.pause(); } catch (e) {}
  try { sinatraSongEl.currentTime = 0; } catch (e) {}
}

// mic fallback: if mic is enabled but there is no reaction to sound,
// prompt user to click/tap to continue (browser gesture / permissions quirks)
let micStartedAt = 0;
let lastMicActivityAt = 0;
let micFallbackShown = false;
let micHadAnyActivity = false;

const MIC_ACTIVITY_THRESHOLD = 0.02; // any audible signal
const MIC_NO_REACTION_MS = 6000;     // wait before showing fallback

const BLOW_THRESHOLD = 0.06;         // fallback threshold until calibration finishes
const BLOW_HOLD_TIME = 120;
const MIN_ON_TIME_MS = 350;
let candleOnSince = 0;

/* ===== content ===== */
const wishes = [
  "Пусть работа уважает твои границы, а люди — твоё время. И пусть в календаре будет больше радости, чем созвонов 🙂",
  "Желаю лёгкости в решениях и точности в попаданиях. Чтобы важное — получалось, а лишнее — само отпадало.",
  "Пусть каждый день приносит маленькие хорошие новости. И пусть силы будут — на главное, а не на «пожары».",
  "Пусть рядом будут те, с кем спокойно. А любые сложные задачи превращаются в понятные чек-листы.",
  "Желаю вдохновения, здоровья и ощущения: «Я на своём месте». И немного праздника — просто так ✨",
  "Пусть год будет щедрым на людей, которые поддерживают. И на идеи, которые дают энергию.",
];

const footerByState = { off: "", on: "" };

/* ===== UI helpers ===== */
function setStep(n) {
  const v = Number(n || 0);
  if (step1) step1.hidden = v !== 1;
  if (step2) step2.hidden = v !== 2;
  if (step3) step3.hidden = v !== 3;
}
function showWish(text) {
  if (!wishText) return;
  if (wishTimer) clearTimeout(wishTimer);
  wishText.textContent = text;
  wishText.classList.add("show");
  wishTimer = setTimeout(() => wishText.classList.remove("show"), 5000);
}
function setRandomWish() {
  let i = Math.floor(Math.random() * wishes.length);
  if (i === lastWish) i = (i + 1) % wishes.length;
  lastWish = i;
  showWish(wishes[i]);
}

function resizeCanvas() {
  if (!canvas) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function beep(freq = 880, dur = 0.06, gain = 0.03) {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g); g.connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur);
    setTimeout(() => ac.close(), 150);
  } catch (_) {}
}

/* smoke + glow */
function puffSmoke() {
  if (!smoke) return;
  smoke.classList.remove("on");
  void smoke.offsetWidth;
  smoke.classList.add("on");
  setTimeout(() => smoke.classList.remove("on"), 2600);
}
function wickGlow() {
  if (!wick) return;
  wick.classList.remove("glow");
  void wick.offsetWidth;
  wick.classList.add("glow");
  setTimeout(() => wick.classList.remove("glow"), 300);
}

/* FX helpers */
function clearFx() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
}
function runParticles(particles, drawFn) {
  function frame() {
    clearFx();
    for (const p of particles) {
      p.vy += p.g ?? 0;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr ?? 0;
      p.life -= 1;
      drawFn(p);
    }
    const alive = particles.some((p) => p.life > 0);
    if (alive) requestAnimationFrame(frame);
    else clearFx();
  }
  requestAnimationFrame(frame);
}

function effectConfetti(x, y) {
  const particles = [];
  for (let i = 0; i < 160; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    const s = 4 + Math.random() * 9;
    particles.push({
      x, y,
      vx: Math.cos(a) * s + (Math.random() - 0.5) * 3,
      vy: Math.sin(a) * s - Math.random() * 2,
      r: 2 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.25,
      g: 0.18 + Math.random() * 0.06,
      life: 75 + Math.random() * 55,
      hue: Math.floor(Math.random() * 360),
      shape: Math.random() < 0.6 ? "rect" : "circle",
    });
  }
  runParticles(particles, (p) => {
    const alpha = Math.max(0, Math.min(1, p.life / 100));
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `hsl(${p.hue} 90% 60%)`;
    if (p.shape === "rect") ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2.2, p.r * 1.2);
    else { ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  });
}
function effectSparkles(x, y) {
  const particles = [];
  for (let i = 0; i < 120; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 0.8 + Math.random() * 3.6;
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      g: 0.03,
      life: 60 + Math.random() * 40,
      r: 1 + Math.random() * 2.5,
      hue: 45 + Math.floor(Math.random() * 70),
    });
  }
  runParticles(particles, (p) => {
    const alpha = Math.max(0, Math.min(1, p.life / 90));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `hsl(${p.hue} 95% 65%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}
function effectFirework(x, y) {
  const particles = [];
  for (let i = 0; i < 140; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 2 + Math.random() * 8;
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      g: 0.06,
      life: 70 + Math.random() * 50,
      hue: Math.floor(Math.random() * 360),
      trail: [],
    });
  }
  runParticles(particles, (p) => {
    const alpha = Math.max(0, Math.min(1, p.life / 110));
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 8) p.trail.shift();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = `hsla(${p.hue} 95% 60% / ${alpha})`;
    ctx.lineWidth = 2;

    ctx.beginPath();
    for (let i = 0; i < p.trail.length; i++) {
      const t = p.trail[i];
      if (i === 0) ctx.moveTo(t.x, t.y);
      else ctx.lineTo(t.x, t.y);
    }
    ctx.stroke();

    ctx.fillStyle = `hsl(${p.hue} 95% 60%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}
const effects = [effectConfetti, effectSparkles, effectFirework];

/* candle state */
function setCandleOn() {
  if (!flame) return;
  flame.classList.add("on");
  candleOnSince = performance.now();
  if (footerMsg) footerMsg.textContent = footerByState.on;
}
function setCandleOff(source = "mic") {
  stopSinatra();
  if (!flame) return;
  flame.classList.remove("on");
  if (footerMsg) footerMsg.textContent = footerByState.off;
}

/* mic UI */
function setMicUI({ enabled, text, level = null } = {}) {
  if (!micToggle) return;

  if (level != null && enabled) {
    const bars = Math.max(0, Math.min(10, Math.floor(level * 60)));
    micToggle.textContent = `слушаю ${"▮".repeat(bars)}${"▯".repeat(10 - bars)}`;
  } else {
    micToggle.textContent = text ?? (enabled ? "включён ✅" : "выключен");
  }
}

function showMicFallback() {
  if (micFallbackShown) return;
  micFallbackShown = true;
  if (inlineTapHint) inlineTapHint.hidden = false;

  const openOnce = (e) => {
    if (!micFallbackShown) return;
    if (e && e.target && e.target.id === "micToggle") return;

    hideMicFallback();
    try { if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {}); } catch (_) {}
    showComic();
    if (micEnabled) stopMic();

    document.removeEventListener("click", openOnce, true);
    document.removeEventListener("touchend", openOnce, true);
  };

  document.addEventListener("click", openOnce, true);
  document.addEventListener("touchend", openOnce, true);
}
function hideMicFallback() {
  micFallbackShown = false;
  if (inlineTapHint) inlineTapHint.hidden = true;
}

function isMicSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

async function startMic() {
  if (!isMicSupported()) {
    setMicUI({ enabled: false, text: "не поддерживается" });
    return false;
  }
  if (!window.isSecureContext) {
    setMicUI({ enabled: false, text: "нужен https" });
    return false;
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: IS_IOS ? true : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    ensureAudioAwake();

    const src = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);

    micEnabled = true;

    // reset calibration every time mic starts
    micBaseline = null;
    blowThreshold = null;

    micStartedAt = performance.now();
    lastMicActivityAt = micStartedAt;
    micHadAnyActivity = false;

    hideMicFallback();
    setMicUI({ enabled: true, text: "слушаю" });

    blowHoldMs = 0;
    lastTs = 0;

    monitorMic();
    return true;
  } catch (err) {
    setMicUI({ enabled: false, text: "доступ запрещён" });
    return false;
  }
}

function stopMic() {
  if (micRAF) cancelAnimationFrame(micRAF);
  micRAF = null;

  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }

  analyser = null;
  micEnabled = false;

  micStartedAt = 0;
  lastMicActivityAt = 0;
  micHadAnyActivity = false;

  micBaseline = null;
  blowThreshold = null;

  hideMicFallback();
  setMicUI({ enabled: false, text: "выключен" });
  stopSinatra();
}

function monitorMic() {
  const data = new Uint8Array(analyser.frequencyBinCount);

  const loop = (ts) => {
    if (!analyser) return;

    analyser.getByteTimeDomainData(data);

    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);

    if (rms > MIC_ACTIVITY_THRESHOLD) {
      lastMicActivityAt = ts;
      micHadAnyActivity = true;
    }

    const dt = lastTs ? ts - lastTs : 0;
    lastTs = ts;

    // AUTO-CALIBRATION (first ~800ms): estimate baseline noise floor to adapt blow threshold on iOS
    if (blowThreshold === null) {
      if (micBaseline === null) micBaseline = { start: ts, sum: 0, n: 0 };
      if (ts - micBaseline.start <= 800) {
        micBaseline.sum += rms;
        micBaseline.n += 1;
      } else if (micBaseline.n > 0) {
        micBaseline.avg = micBaseline.sum / micBaseline.n;

        // искомые строки:
        const dyn = (micBaseline.avg * 4.0) + 0.03;
        blowThreshold = Math.max(0.04, Math.min(0.18, dyn));
      }
    }

    const thr = blowThreshold === null ? BLOW_THRESHOLD : blowThreshold;

    if (rms > thr) blowHoldMs += dt;
    else blowHoldMs = Math.max(0, blowHoldMs - dt * 0.8);

    if (!micFallbackShown) setMicUI({ enabled: true, level: rms });

    if (!micFallbackShown && micStartedAt && ts - micStartedAt >= MIC_NO_REACTION_MS && !micHadAnyActivity) {
      showMicFallback();
    }

    const isOn = flame && flame.classList.contains("on");
    const onLongEnough = performance.now() - candleOnSince > MIN_ON_TIME_MS;

    if (isOn && onLongEnough && blowHoldMs >= BLOW_HOLD_TIME) {
      blowHoldMs = 0;

      setCandleOff("mic");
      wickGlow();
      puffSmoke();

      const rect = cake.getBoundingClientRect();
      effectSparkles(rect.left + rect.width * 0.5, rect.top + rect.height * 0.12);

      showWish("Свеча погасла… желание отправлено во Вселенную 🙂");
      if (footerMsg) footerMsg.textContent = "Можно закрыть открытку ниже — или открыть снова.";
      if (ending) ending.hidden = false;

      beep(520, 0.08, 0.02);

      // Show comic immediately after candle is blown out
      showComic();
    }

    micRAF = requestAnimationFrame(loop);
  };

  micRAF = requestAnimationFrame(loop);
}

/* ===== events ===== */

// Open the envelope ONLY via the heart seal
if (heartSeal) {
  heartSeal.addEventListener("click", (e) => {
    e.stopPropagation();
    openEnvelope();
  });
  heartSeal.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openEnvelope();
    }
  });
}

// IMPORTANT: do NOT open by clicking the envelope itself
if (envelope) {
  envelope.addEventListener("click", (e) => {
    e.preventDefault();
  });
}

function openEnvelope() {
  if (!envelope) return;
  envelope.classList.add("open");
  if (heartSeal) heartSeal.style.display = "none";
  opened = true;

  if (hint) hint.textContent = "";

  setCandleOn();
  if (ending) ending.hidden = true;

  // Step 1 only
  if (steps) steps.hidden = false;
  setStep(1);

  // Candle hint above cake
  showWish("Свеча уже горит. Загадай желание… 🙂");

  if (footerMsg) footerMsg.textContent = footerByState.on;

  const r = envelope.getBoundingClientRect();
  effectConfetti(r.left + r.width * 0.55, r.top + r.height * 0.35);
  beep(988, 0.05, 0.025);
}

if (closeLetterBtn) {
  closeLetterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    resetCardUI();
  });
}
if (closeCard) {
  closeCard.addEventListener("click", (e) => {
    e.stopPropagation();
    resetCardUI();
  });
}

function resetCardUI() {
  if (envelope) envelope.classList.remove("open");
  opened = false;

  if (ending) ending.hidden = true;

  if (wishText) wishText.textContent = "Открой конверт 🙂";
  if (footerMsg) footerMsg.textContent = "Нажми на конверт, чтобы начать.";
  if (hint) hint.textContent = "";

  if (heartSeal) heartSeal.style.display = "";

  if (steps) steps.hidden = true;
  setStep(0);
  if (tip) tip.style.display = "";

  setCandleOff("ui");
  // mic stays as is (your logic), but Sinatra must stop when candle off:
  stopSinatra();
}

if (cake) {
  cake.addEventListener("click", (e) => {
    e.stopPropagation();

    // Hide “Нажми на торт…” after first click
    if (tip) tip.style.display = "none";
    if (hint) hint.textContent = "";

    const rect = cake.getBoundingClientRect();
    const x = rect.left + rect.width * 0.5;
    const y = rect.top + rect.height * 0.15;

    const isOn = flame && flame.classList.contains("on");

    if (!isOn) {
      // After blow-out we still allow cake clicks softly
      effectSparkles(x, y);
      setRandomWish();
      return;
    }

    effects[effectIndex % effects.length](x, y);
    effectIndex++;

    const phrases = [
      "Пусть сбудется ✨",
      "Тихо-тихо… пусть получится 🙂",
      "Это было красиво. Ещё раз?",
    ];
    const p = phrases[Math.floor(Math.random() * phrases.length)];
    showWish(p + " " + wishes[Math.floor(Math.random() * wishes.length)]);

    // After the first cake click -> show Step 2 (button), hide Step 1
    setStep(2);

    beep(880, 0.05, 0.02);
  });
}

async function toggleMic(e) {
  if (e) e.stopPropagation();

  if (micEnabled) {
    stopMic();
    beep(520, 0.06, 0.02);
    return;
  }

  const ok = await startMic();
  if (ok) {
    playSinatra();
    beep(1040, 0.05, 0.02);
  }
}

if (micToggle) micToggle.addEventListener("click", toggleMic);

// Step 2 button -> enable mic, then show step 3
if (stepMicBtn) {
  stepMicBtn.addEventListener("click", (e) => {
    setStep(3);
    toggleMic(e);
  });
}

/* ===== init ===== */
if (wishText) wishText.textContent = "Открой конверт 🙂";
if (footerMsg) footerMsg.textContent = "Нажми на конверт, чтобы начать.";
if (ending) ending.hidden = true;
if (steps) steps.hidden = true;
setStep(0);
setMicUI({ enabled: false, text: "выключен" });
stopSinatra();

/* ===== COMIC INTEGRATION ===== */
const comicPages = [
  "assets/p1.png","assets/p2.png","assets/p3.png","assets/p4.png",
  "assets/p5.png","assets/p6.png","assets/p7.png","assets/p8.png"
];
let comicIdx = 0;
let comicInited = false;

// Birthday song: play once when the last comic page is reached
const bdaySongEl = document.getElementById("bdaySong");
let bdaySongPlayed = false;

function resetBdaySong() {
  bdaySongPlayed = false;
  if (!bdaySongEl) return;
  try { bdaySongEl.pause(); } catch (e) {}
  try { bdaySongEl.currentTime = 0; } catch (e) {}
}
function playBdaySongOnce() {
  if (bdaySongPlayed) return;
  bdaySongPlayed = true;
  if (!bdaySongEl) return;
  try { bdaySongEl.currentTime = 0; } catch (e) {}
  const p = bdaySongEl.play();
  if (p && typeof p.catch === "function") {
    p.catch(() => { bdaySongPlayed = false; });
  }
}

function showComic() {
  resetBdaySong();

  const cardWrap = document.querySelector(".card-wrap");
  const comicSection = document.getElementById("comicSection");
  if (!comicSection) return;

  if (cardWrap) cardWrap.classList.add("fade-out");

  setTimeout(() => {
    comicSection.classList.add("visible");
    if (!comicInited) { initComic(); comicInited = true; }
  }, 900);
}

function initComic() {
  const img = document.getElementById("comicPageImg");
  const prevBtn = document.getElementById("comicPrevBtn");
  const nextBtn = document.getElementById("comicNextBtn");
  const leftZone = document.getElementById("comicLeftZone");
  const rightZone = document.getElementById("comicRightZone");
  const pageLabel = document.getElementById("comicPageLabel");
  const viewer = document.getElementById("comicViewer");
  const n = comicPages.length;

  function render() {
    img.src = comicPages[comicIdx];
    img.alt = "Страница " + (comicIdx + 1);
    pageLabel.textContent = (comicIdx + 1) + " / " + n;

    prevBtn.disabled = comicIdx <= 0;
    nextBtn.disabled = comicIdx >= n - 1;

    // When the 2nd page is shown — start the birthday song
    if (comicIdx === 1) playBdaySongOnce();
  }

  function goTo(i) {
    comicIdx = Math.max(0, Math.min(n - 1, i));
    render();
  }
  const next = () => { if (comicIdx < n - 1) goTo(comicIdx + 1); };
  const prev = () => { if (comicIdx > 0) goTo(comicIdx - 1); };

  prevBtn.addEventListener("click", prev);
  nextBtn.addEventListener("click", next);
  leftZone.addEventListener("click", prev);
  rightZone.addEventListener("click", next);

  window.addEventListener("keydown", (e) => {
    const cs = document.getElementById("comicSection");
    if (!cs || !cs.classList.contains("visible")) return;
    if (e.key === "ArrowRight") next();
    if (e.key === "ArrowLeft") prev();
  });

  // Swipe support
  let startX = null, startY = null;
  viewer.addEventListener("touchstart", (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  viewer.addEventListener("touchend", (e) => {
    if (startX == null) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) { startX = startY = null; return; }
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    startX = startY = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) next(); else prev();
  }, { passive: true });

  render();
}

/* Falling particles */
(function () {
  const c = document.getElementById("particlesBg");
  if (!c) return;
  const syms = ["❤", "✨", "⭐", "💕", "🌟"];
  function add() {
    const p = document.createElement("span");
    p.textContent = syms[Math.floor(Math.random() * syms.length)];
    p.style.cssText =
      "position:absolute;left:" + Math.random() * 100 + "%;top:-20px;" +
      "font-size:" + (10 + Math.random() * 14) + "px;" +
      "opacity:" + (0.4 + Math.random() * 0.3) + ";" +
      "animation:particleFall " + (7 + Math.random() * 5) + "s linear forwards;";
    c.appendChild(p);
    setTimeout(() => p.remove(), 12000);
  }
  setInterval(add, 900);
  for (let i = 0; i < 4; i++) setTimeout(add, i * 250);
})();
