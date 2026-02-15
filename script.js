/* script.js */
const envelope = document.getElementById("envelope");
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
const tapToOpenComic = document.getElementById("tapToOpenComic");

const tip = document.getElementById("tip");
const canvas = document.getElementById("fx");
const ctx = canvas.getContext("2d", { alpha: true });

let opened = false;
let lastWish = -1;
let effectIndex = 0;
let wishTimer = null;

/* MIC */
let micStream = null;
let audioCtx = null;
let analyser = null;
let micRAF = null;
let blowHoldMs = 0;
let lastTs = 0;
let micEnabled = false;


// Sinatra song: starts when user enables mic (button "включить звук"), stops when candle is blown out
const sinatraSongEl = document.getElementById("sinatraSong");
let sinatraStarted = false;

function playSinatra() {
  if (!sinatraSongEl) return;
  // restart each time mic is enabled
  sinatraStarted = true;
  try { sinatraSongEl.currentTime = 0; } catch (e) {}
  const p = sinatraSongEl.play();
  if (p && typeof p.catch === "function") {
    p.catch(() => {
      // autoplay might be blocked; keep state so next user gesture can start it
      sinatraStarted = false;
    });
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

const MIC_ACTIVITY_THRESHOLD = 0.02;     // lower than blow threshold, just "any audible signal"
const MIC_NO_REACTION_MS = 2500;         // how long to wait before showing fallback

const BLOW_THRESHOLD = 0.12;
const BLOW_HOLD_TIME = 220;
const MIN_ON_TIME_MS = 350;
let candleOnSince = 0;

const wishes = [
  "Пусть работа уважает твои границы, а люди — твоё время. И пусть в календаре будет больше радости, чем созвонов 🙂",
  "Желаю лёгкости в решениях и точности в попаданиях. Чтобы важное — получалось, а лишнее — само отпадало.",
  "Пусть каждый день приносит маленькие хорошие новости. И пусть силы будут — на главное, а не на «пожары».",
  "Пусть рядом будут те, с кем спокойно. А любые сложные задачи превращаются в понятные чек-листы.",
  "Желаю вдохновения, здоровья и ощущения: «Я на своём месте». И немного праздника — просто так ✨",
  "Пусть год будет щедрым на людей, которые поддерживают. И на идеи, которые дают энергию.",
];

const footerByState = {
  off: "Подсказка: включи микрофон и подуй, чтобы задуть свечу 🙂",
  on:  "Свеча горит. Загадай желание… (и попробуй задуть в микрофон 🙂)",
};

function showWish(text) {
  if (wishTimer) clearTimeout(wishTimer);
  wishText.textContent = text;
  wishText.classList.add("show");
  wishTimer = setTimeout(() => {
    wishText.classList.remove("show");
  }, 5000);
}

function setRandomWish() {
  let i = Math.floor(Math.random() * wishes.length);
  if (i === lastWish) i = (i + 1) % wishes.length;
  lastWish = i;
  showWish(wishes[i]);
}

function resizeCanvas() {
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
  smoke.classList.remove("on");
  void smoke.offsetWidth;
  smoke.classList.add("on");
  setTimeout(() => smoke.classList.remove("on"), 2600);
}

function wickGlow() {
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
    const alive = particles.some(p => p.life > 0);
    if (alive) requestAnimationFrame(frame);
    else clearFx();
  }
  requestAnimationFrame(frame);
}

function effectConfetti(x, y) {
  const particles = [];
  for (let i = 0; i < 160; i++) {
    const a = -Math.PI/2 + (Math.random() - 0.5) * 1.2;
    const s = 4 + Math.random() * 9;
    particles.push({
      x, y,
      vx: Math.cos(a)*s + (Math.random()-0.5)*3,
      vy: Math.sin(a)*s - Math.random()*2,
      r: 2 + Math.random()*4,
      rot: Math.random()*Math.PI,
      vr: (Math.random()-0.5)*0.25,
      g: 0.18 + Math.random()*0.06,
      life: 75 + Math.random()*55,
      hue: Math.floor(Math.random()*360),
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
    if (p.shape === "rect") ctx.fillRect(-p.r, -p.r*0.6, p.r*2.2, p.r*1.2);
    else { ctx.beginPath(); ctx.arc(0,0,p.r,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
  });
}

function effectSparkles(x, y) {
  const particles = [];
  for (let i = 0; i < 120; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 0.8 + Math.random()*3.6;
    particles.push({
      x, y,
      vx: Math.cos(a)*s,
      vy: Math.sin(a)*s,
      g: 0.03,
      life: 60 + Math.random()*40,
      r: 1 + Math.random()*2.5,
      hue: 45 + Math.floor(Math.random()*70),
    });
  }
  runParticles(particles, (p) => {
    const alpha = Math.max(0, Math.min(1, p.life / 90));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `hsl(${p.hue} 95% 65%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  });
}

function effectFirework(x, y) {
  const particles = [];
  for (let i = 0; i < 140; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 2 + Math.random()*8;
    particles.push({
      x, y,
      vx: Math.cos(a)*s,
      vy: Math.sin(a)*s,
      g: 0.06,
      life: 70 + Math.random()*50,
      hue: Math.floor(Math.random()*360),
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
    ctx.arc(p.x, p.y, 2.2, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  });
}

const effects = [
  effectConfetti,
  effectSparkles,
  effectFirework
];

/* candle state */
function setCandleOn() {
  flame.classList.add("on");
  candleOnSince = performance.now();
  footerMsg.textContent = footerByState.on;
}
function setCandleOff(source = "mic") {
  stopSinatra();
  flame.classList.remove("on");
  footerMsg.textContent = footerByState.off;
}

/* mic UI */
function setMicUI({ enabled, text, level = null } = {}) {
  
  

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

  // Replace the "listening" label with the fallback message
  setMicUI({ enabled: true, text: "Не получилось? Тогда кликни по экрану!" });

  if (tapToOpenComic) {
    tapToOpenComic.hidden = false;
    tapToOpenComic.classList.add("is-visible");
  }
}

function hideMicFallback() {
  micFallbackShown = false;
  if (tapToOpenComic) {
    tapToOpenComic.classList.remove("is-visible");
    tapToOpenComic.hidden = true;
  }
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
      audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true }
    });

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);

    micEnabled = true;

    // Start in explicit "listening" state.
    // If we don't see sound activity soon, we'll prompt a click/tap.
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
    micStream.getTracks().forEach(t => t.stop());
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

    // Track any signal (not only blow).
    // Some devices/browsers keep the mic stream alive but audio context is suspended
    // until a user gesture; this fallback helps user recover.
    if (rms > MIC_ACTIVITY_THRESHOLD) {
      lastMicActivityAt = ts;
      micHadAnyActivity = true;
    }

    const dt = lastTs ? (ts - lastTs) : 0;
    lastTs = ts;

    if (rms > BLOW_THRESHOLD) blowHoldMs += dt;
    else blowHoldMs = Math.max(0, blowHoldMs - dt * 0.8);

    // If fallback already shown, keep the text stable (do not overwrite with bars)
    if (!micFallbackShown) {
      setMicUI({ enabled: true, level: rms });
    }

    // No reaction for a while right after enabling mic → show click/tap fallback
    if (!micFallbackShown && micStartedAt && (ts - micStartedAt) >= MIC_NO_REACTION_MS && !micHadAnyActivity) {
      showMicFallback();
    }

    const isOn = flame.classList.contains("on");
    const onLongEnough = (performance.now() - candleOnSince) > MIN_ON_TIME_MS;

    if (isOn && onLongEnough && blowHoldMs >= BLOW_HOLD_TIME) {
      blowHoldMs = 0;

      setCandleOff("mic");
      wickGlow();
      puffSmoke();

      const rect = cake.getBoundingClientRect();
      effectSparkles(rect.left + rect.width * 0.5, rect.top + rect.height * 0.12);

      showWish("Свеча погасла… желание отправлено во Вселенную 🙂");
      footerMsg.textContent = "Можно закрыть открытку ниже — или открыть снова.";
      ending.hidden = false;

      beep(520, 0.08, 0.02);

      // Show comic immediately after candle is blown out
      showComic();
    }

    micRAF = requestAnimationFrame(loop);
  };

  micRAF = requestAnimationFrame(loop);
}

/* events */
function openEnvelope() {
  envelope.classList.add("open");
  opened = true;
  hint.textContent = "Загадай желание 🙂";

  setCandleOn();
  ending.hidden = true;

  showWish("Свеча уже горит. Загадай желание… 🙂");
  footerMsg.textContent = footerByState.on;

  const r = envelope.getBoundingClientRect();
  effectConfetti(r.left + r.width*0.55, r.top + r.height*0.35);
  beep(988, 0.05, 0.025);
}

envelope.addEventListener("click", () => {
  if (!opened) openEnvelope();
  else { setRandomWish(); beep(740, 0.05, 0.02); }
});


closeLetterBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  envelope.classList.remove("open");
  opened = false;
  ending.hidden = true;
  wishText.textContent = "Открой конверт 🙂";
  footerMsg.textContent = "Нажми на конверт, чтобы начать.";
  hint.textContent = "Нажми, чтобы открыть…";
  setCandleOff("ui");
});
cake.addEventListener("click", (e) => {
  e.stopPropagation();
  if (tip) tip.style.display = "none";

  const rect = cake.getBoundingClientRect();
  const x = rect.left + rect.width * 0.5;
  const y = rect.top + rect.height * 0.15;

  const isOn = flame.classList.contains("on");

  if (!isOn) {
    // после задувания оставляем торт кликабельным, но мягко
    effects[1](x, y);
    setRandomWish();
    return;
  }

  effects[effectIndex % effects.length](x, y);
  effectIndex++;

  const phrases = [
    "Загадай желание…",
    "Пусть сбудется ✨",
    "Тихо-тихо… пусть получится 🙂",
    "Это было красиво. Ещё раз?",
  ];
  const p = phrases[Math.floor(Math.random() * phrases.length)];
  showWish(p + " " + wishes[Math.floor(Math.random() * wishes.length)]);

  beep(880, 0.05, 0.02);
});

async function toggleMic(e) {
  e.stopPropagation();

  if (micEnabled) {
    stopMic();
    stopSinatra();
    beep(520, 0.06, 0.02);
    return;
  }

  const ok = await startMic();
  if (ok) {
    playSinatra();
    beep(1040, 0.05, 0.02);
  }
}

micToggle.addEventListener("click", toggleMic);

const stepMicBtn = document.getElementById("stepMicBtn");
if (stepMicBtn) stepMicBtn.addEventListener("click", toggleMic);

closeCard.addEventListener("click", (e) => {
  e.stopPropagation();

  envelope.classList.remove("open");
  opened = false;

  ending.hidden = true;

  wishText.textContent = "Открой конверт 🙂";
  footerMsg.textContent = "Нажми на конверт, чтобы начать.";
  hint.textContent = "Нажми, чтобы открыть…";

  setCandleOff("ui");
  // микрофон оставляем как есть
});

/* init */
wishText.textContent = "Открой конверт 🙂";
footerMsg.textContent = "Нажми на конверт, чтобы начать.";
ending.hidden = true;
setMicUI({ enabled: false, text: "выключен" });
  stopSinatra();

/* ========== COMIC INTEGRATION ========== */
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
    p.catch(() => {
      // Autoplay might be blocked in some browsers; user can tap/click once inside the comic.
      bdaySongPlayed = false;
    });
  }
}


function showComic() {
  resetBdaySong();
  const cardWrap = document.querySelector(".card-wrap");
  const comicSection = document.getElementById("comicSection");
  if (!comicSection) return;

  cardWrap.classList.add("fade-out");

  setTimeout(() => {
    comicSection.classList.add("visible");
    if (!comicInited) { initComic(); comicInited = true; }
  }, 900);
}

// If mic fallback is shown (no sound reaction), a click/tap should open the comic.
if (tapToOpenComic) {
  const openFromTap = (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideMicFallback();
    showComic();
    // mic is no longer needed at this point
    if (micEnabled) stopMic();
  };

  tapToOpenComic.addEventListener("click", openFromTap);
  tapToOpenComic.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") openFromTap(e);
  });
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
    if (comicIdx === 1) {
      playBdaySongOnce();
    }
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
    if (!document.getElementById("comicSection").classList.contains("visible")) return;
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
(function() {
  var c = document.getElementById("particlesBg");
  if (!c) return;
  var syms = ["❤","✨","⭐","💕","🌟"];
  function add() {
    var p = document.createElement("span");
    p.textContent = syms[Math.floor(Math.random()*syms.length)];
    p.style.cssText = "position:absolute;left:"+Math.random()*100+"%;top:-20px;font-size:"+(10+Math.random()*14)+"px;opacity:"+(0.4+Math.random()*0.3)+";animation:particleFall "+(7+Math.random()*5)+"s linear forwards;";
    c.appendChild(p);
    setTimeout(function(){p.remove();},12000);
  }
  setInterval(add,900);
  for(var i=0;i<4;i++)setTimeout(add,i*250);
})();
