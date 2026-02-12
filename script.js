const envelope = document.getElementById("envelope");
const flame = document.getElementById("flame");
const wishText = document.getElementById("wishText");
const ending = document.getElementById("ending");
const closeCard = document.getElementById("closeCard");

const wishes = [
  "Пусть каждый день приносит радость.",
  "Пусть желания сбываются легко.",
  "Пусть рядом будут нужные люди.",
  "Пусть год будет добрым и светлым."
];

function randomWish(){
  wishText.textContent = wishes[Math.floor(Math.random()*wishes.length)];
}

envelope.addEventListener("click", ()=>{
  envelope.classList.add("open");
  flame.classList.add("on");
  randomWish();
});

document.getElementById("randomBtn").onclick = randomWish;
document.getElementById("partyBtn").onclick = randomWish;

closeCard.onclick = ()=>{
  envelope.classList.remove("open");
  flame.classList.remove("on");
  ending.hidden = true;
};
