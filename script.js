const envelope = document.getElementById("envelope");
const flame = document.getElementById("flame");
const wishText = document.getElementById("wishText");

const wishes = [
  "Пусть рядом будут люди, с которыми спокойно.",
  "Пусть сложные задачи превращаются в простые шаги.",
  "Пусть год будет добрым и тёплым.",
  "Пусть будет больше радости, чем поводов для спешки.",
];

function randomWish() {
  wishText.textContent = wishes[Math.floor(Math.random() * wishes.length)];
}

envelope.addEventListener("click", () => {
  envelope.classList.add("open");
  flame.classList.add("on");
  randomWish();
});

document.getElementById("randomBtn").addEventListener("click", randomWish);
