const envelope = document.getElementById("envelope");
const hint = document.getElementById("hint");

const wishText = document.getElementById("wishText");
const footerMsg = document.getElementById("footerMsg");

const cake = document.getElementById("cake");
const flame = document.getElementById("flame");
const smoke = document.getElementById("smoke");
const wick = document.getElementById("wick");

const candleSlider = document.getElementById("candleSlider");
const sliderState = document.getElementById("sliderState");

const randomBtn = document.getElementById("randomBtn");
const partyBtn = document.getElementById("partyBtn");

const micBtn = document.getElementById("micBtn");
const micStatus = document.getElementById("micStatus");
const soundToggle = document.getElementById("soundToggle");

const canvas = document.getElementById("fx");
const ctx = canvas.getContext("2d", { alpha: true });

let opened = false;
let lastWish = -1;
let effectIndex = 0;

/* ===== MIC ===== */
let micStream = null;
let audioCtx = null;
let analyser = null;
let micRAF = null;
let blowHoldMs = 0;
let lastTs = 0;
let micEnabled = false;

// Настройки "подува"
const BLOW_THRESHOLD = 0.12;      // чувствительность (0..~0.3)
const BLOW_HOLD_TIME = 220;       // мс удержания, чтобы "задуло"
const MIN_ON_TIME_MS = 350;       // не тушить мгновенно после зажигания
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
  off: "Подсказка: зажги свечу слайдером — и загадай желание… (или задуть — в микрофон)",
  on:  "Свеча горит. Самое время загадать желание… (попробуй задуть в микрофон 🙂)",
};

function setRandomWish() {
  let i = Math.floor(Math.random() * wishes.length);
  if (i === lastWish) i = (i + 1) % wishes.length;
  lastWish = i;
  wishText.textContent = wishes[i];
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
  if (soundToggle.checked) return;
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

/* ===== smoke + wick glow ===== */
function puffSmoke() {
  if (!smoke) return;
  smoke.classList.remove("on");
  void smoke.offsetWidth; // reflow
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

/* ===== FX (particles canvas) ===== */
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
    const a = (Math.random() * Math.PI) - Math.PI/2;
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

function effectHearts(x, y) {
  const particles = [];
  for (let i = 0; i < 90; i++) {
    const a = (Math.random() * Math.PI) - Math.PI/2;
    const s = 2.5 + Math.random() * 5.5;
    particles.push({
      x, y,
      vx: Math.cos(a)*s + (Math.random()-0.5)*1.2,
      vy: Math.sin(a)*s - Math.random()*1.5,
      g: 0.08,
      life: 90 + Math.random()*50,
      size: 10 + Math.random()*14,
      hue: 340 + Math.floor(Math.random()*30),
      wobble: Math.random()*Math.PI*2,
    });
  }
  runParticles(particles, (p) => {
    const alpha = Math.max(0, Math.min(1, p.life / 120));
    p.wobble += 0.15;
    const wx = Math.sin(p.wobble) * 0.6;

    ctx.save();
    ctx.translate(p.x + wx, p.y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `hsl(${p.hue} 90% 60%)`;

    const s = p.size;
    ctx.beginPath();
    ctx.moveTo(0, s*0.25);
    ctx.bezierCurveTo(0, 0, -s*0.55, 0, -s*0.55, s*0.35);
    ctx.bezierCurveTo(-s*0.55, s*0.8, 0, s*0.95, 0, s*1.2);
    ctx.bezierCurveTo(0, s*0.95, s*0.55, s*0.8, s*0.55, s*0.35);
    ctx.bezierCurveTo(s*0.55, 0, 0, 0, 0, s*0.25);
    ctx.fill();
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

function effectRainbowWave(x, y) {
  const particles = [];
  for (let i = 0; i < 180; i++) {
    particles.push({
      x: x + (Math.random()-0.5)*220,
      y: y + (Math.random()-0.5)*30,
      vx: (Math.random()-0.5)*0.8,
      vy: - (1.6 + Math.random()*1.6),
      g: -0.01,
      life: 70 + Math.random()*50,
      r: 2 + Math.random()*3,
      hue: Math.floor((i/180)*360),
    });
  }
  runParticles(particles, (p) => {
    const alpha = Math.max(0, Math.min(1, p.life / 110));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `hsl(${p.hue} 90% 60%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  });
}

const effects = [
  { name: "confetti", fn: effectConfetti },
  { name: "hearts", fn: effectHearts },
  { name: "sparkles", fn: effectSparkles },
  { name: "firework", fn: effectFirework },
  { name: "rainbow", fn: effectRainbowWave },
];

/* ===== candle logic ===== */
function setCandleState(isOn, source = "ui") {
  flame.classList.toggle("on", isOn);
  sliderState.textContent = isOn ? "горит" : "потушена";
  footerMsg.textContent = isOn ? footerByState.on : footerByState.off;

  if (isOn) {
    candleOnSince = performance.now();
    wishText.textContent = "Зажгли свечу… теперь загадай желание 🙂";
  } else {
    setRandomWish();
  }

  if (!isOn && source === "mic") {
    candleSlider.value = "0";
  }
}

/* ===== mic toggle ===== */
function setMicUI({ enabled, text, level = null } = {}) {
  if (micBtn) {
    micBtn.classList.toggle("is-on", !!enabled);
    micBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
    micBtn.textContent = enabled ? "Микрофон: вкл ✅" : "Микрофон: выкл 🎙️";
  }

  if (micStatus) {
    if (level != null && enabled) {
      const bars = Math.max(0, Math.min(10, Math.floor(level * 60)));
      micStatus.textContent = `Микрофон: слушаю ${"▮".repeat(bars)}${"▯".repeat(10 - bars)}`;
    } else {
      micStatus.textContent = text ?? (enabled ? "Микрофон: включён" : "Микрофон: выключен");
    }
  }
}

function isMicSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

async function startMic() {
  if (!isMicSupported()) {
    setMicUI({ enabled: false, text: "Микрофон: не поддерживается в этом браузере" });
    return false;
  }
  if (!window.isSecureContext) {
    setMicUI({ enabled: false, text: "Микрофон: нужен https:// или localhost" });
    return false;
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
    });

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);

    micEnabled = true;
    setMicUI({ enabled: true, text: "Микрофон: включён — можно «задуть» свечу" });

    blowHoldMs = 0;
    lastTs = 0;
    monitorMic();
    return true;

  } catch (err) {
    setMicUI({ enabled: false, text: "Микрофон: доступ не предоставлен" });
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
  setMicUI({ enabled: false, text: "Микрофон: выключен" });
}

function monitorMic() {
  const data = new Uint8Array(analyser.frequencyBinCount);

  const loop = (ts) => {
    if (!analyser) return;

    analyser.getByteTimeDomainData(data);

    // RMS громкости
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);

    // удержание порога
    const dt = lastTs ? (ts - lastTs) : 0;
    lastTs = ts;

    if (rms > BLOW_THRESHOLD) blowHoldMs += dt;
    else blowHoldMs = Math.max(0, blowHoldMs - dt * 0.8);

    setMicUI({ enabled: true, level: rms });

    const isOn = flame.classList.contains("on");
    const onLongEnough = (performance.now() - candleOnSince) > MIN_ON_TIME_MS;

    if (isOn && onLongEnough && blowHoldMs >= BLOW_HOLD_TIME) {
      blowHoldMs = 0;

      setCandleState(false, "mic");
      wickGlow();
      puffSmoke();

      const rect = cake.getBoundingClientRect();
      effects[2].fn(rect.left + rect.width * 0.5, rect.top + rect.height * 0.12);

      wishText.textContent = "Свеча погасла… желание отправлено во Вселенную 🙂";
      footerMsg.textContent = "Хочешь ещё раз? Зажги свечу слайдером.";
      beep(520, 0.08, 0.02);
    }

    micRAF = requestAnimationFrame(loop);
  };

  micRAF = requestAnimationFrame(loop);
}

/* ===== events ===== */
function openEnvelope() {
  envelope.classList.add("open");
  opened = true;
  hint.textContent = "Зажги свечу слайдером…";
  setRandomWish();

  const r = envelope.getBoundingClientRect();
  effects[0].fn(r.left + r.width*0.55, r.top + r.height*0.35);
  beep(988, 0.05, 0.025);
}

envelope.addEventListener("click", () => {
  if (!opened) openEnvelope();
  else { setRandomWish(); beep(740, 0.05, 0.02); }
});

candleSlider.addEventListener("input", () => {
  const wasOn = flame.classList.contains("on");
  const isOn = Number(candleSlider.value) >= 60;

  setCandleState(isOn, "ui");

  // если потушили слайдером — чуть кино
  if (wasOn && !isOn) {
    wickGlow();
    puffSmoke();
  }

  // если зажгли — лёгкий акцент
  if (!wasOn && isOn) {
    beep(1040, 0.05, 0.02);
  }
});

randomBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  setRandomWish();
  beep(880, 0.05, 0.02);
});

partyBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const rect = cake.getBoundingClientRect();
  effectConfetti(rect.left + rect.width*0.5, rect.top + rect.height*0.2);
  setRandomWish();
  beep(1040, 0.06, 0.03);
});

cake.addEventListener("click", (e) => {
  e.stopPropagation();

  const isOn = flame.classList.contains("on");
  const rect = cake.getBoundingClientRect();
  const x = rect.left + rect.width * 0.5;
  const y = rect.top + rect.height * 0.15;

  if (!isOn) {
    setRandomWish();
    footerMsg.textContent = "Псс… сначала зажги свечу слайдером (а микрофон — чтобы эффектно задуть) 🙂";
    effects[2].fn(x, y);
    beep(660, 0.05, 0.02);
    return;
  }

  const eff = effects[effectIndex % effects.length];
  eff.fn(x, y);
  effectIndex++;

  const phrases = [
    "Загадай желание…",
    "Пусть сбудется ✨",
    "Тихо-тихо… пусть получится 🙂",
    "Это было красиво. Ещё раз?",
  ];
  const p = phrases[Math.floor(Math.random() * phrases.length)];
  wishText.textContent = p + " " + wishes[Math.floor(Math.random() * wishes.length)];

  beep(880, 0.05, 0.02);
  setTimeout(() => beep(1040, 0.05, 0.02), 70);
  setTimeout(() => beep(1320, 0.05, 0.02), 140);
});

micBtn?.addEventListener("click", async (e) => {
  e.stopPropagation();

  if (micEnabled) {
    stopMic();
    beep(520, 0.06, 0.02);
    return;
  }

  const ok = await startMic();
  if (ok) beep(1040, 0.05, 0.02);
});

/* ===== init ===== */
wishText.textContent = "Открой конверт 🙂";
footerMsg.textContent = footerByState.off;
setMicUI({ enabled: false, text: "Микрофон: выключен" });
