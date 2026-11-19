// Pet is drawn in base units (270 x 140) and scaled to the window size.
const BASE_W = 330, ABOVE = 156;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });

let head, handL, handR, ready = false, bounce = 0, bounceT = -1, ignoring = true;
let k = 1, hidden = 0, hiddenTarget = 0, lastT = 0; // hidden: 0 = clinging, 1 = tucked away
window.jack.onFullscreen((fs) => { hiddenTarget = fs ? 1 : 0; });
const ease = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x)); // device px per base unit

function resize() {
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(cv.clientWidth * dpr);
  cv.height = Math.round(cv.clientHeight * dpr);
  k = cv.width / BASE_W;
}
window.addEventListener('resize', resize);
window.jack.onScale(() => setTimeout(resize, 50));

let headW = 170;
const HAND_K = 0.34, HAND_OFF = 121;
function drawHand(img, cx, bottom) {
  const w = img.width * HAND_K, h = img.height * HAND_K;
  ctx.drawImage(img, cx - w / 2, bottom - h, w, h);
}
function draw(t) {
  const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
  hidden += Math.sign(hiddenTarget - hidden) * Math.min(Math.abs(hiddenTarget - hidden), dt / 0.9);
  const handDrop = ease(clamp01(hidden / 0.45));          // hands drop away first
  const headDrop = ease(clamp01((hidden - 0.3) / 0.7));   // then Jack slides down behind the taskbar
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const groundY = ABOVE;                      // taskbar top edge
  const headH = headW * head.height / head.width;
  const cx = BASE_W / 2;
  const sway = Math.sin(t / 900) * 1.2 * Math.PI / 180;
  let hop = 0;
  if (bounceT >= 0) {
    const p = (t - bounceT) / 450;
    if (p >= 1) bounceT = -1; else hop = Math.sin(p * Math.PI) * 14;
  }
  const bob = Math.sin(t / 700) * 1.5 - hop;

  // Jack is BEHIND the taskbar: body clipped at its top edge
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, BASE_W, groundY); ctx.clip();
  ctx.translate(cx, groundY + 8 + headDrop * (headH + 24));
  ctx.rotate(sway);
  ctx.drawImage(head, -headW / 2, -headH + bob, headW, headH);
  ctx.restore();

  // hands IN FRONT of the taskbar, resting on its bottom edge, fingers reaching up over the top
  const bottom = cv.height / k;
  const dropPx = handDrop * 70;
  drawHand(handL, cx - HAND_OFF, bottom + dropPx);
  drawHand(handR, cx + HAND_OFF, bottom + dropPx);
}

function loop(t) { if (ready) draw(t); requestAnimationFrame(loop); }

// Click-through everywhere except over Jack's actual pixels
function alphaAt(x, y) {
  const dpr = window.devicePixelRatio || 1;
  const px = Math.floor(x * dpr), py = Math.floor(y * dpr);
  if (px < 0 || py < 0 || px >= cv.width || py >= cv.height) return 0;
  return ctx.getImageData(px, py, 1, 1).data[3];
}
window.addEventListener('mousemove', (e) => {
  if (!ready) return;
  const over = alphaAt(e.clientX, e.clientY) > 20;
  if (over === ignoring) { ignoring = !over; window.jack.ignoreMouse(ignoring); }
});
window.addEventListener('mousedown', (e) => {
  if (e.button === 2) window.jack.petMenu();
  else bounceT = performance.now();
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

let chars = null;
async function applyCharacter(st) {
  if (!chars) return;
  const c = chars.characters.find((x) => x.id === st.character) || chars.characters[0];
  const sk = c.skins.find((x) => x.id === st.skin) || c.skins[0];
  const img = await load('../assets/characters/' + sk.head);
  head = img; headW = sk.width || 170;
}
Promise.all([load('../assets/hand-left.png'), load('../assets/hand-right.png'), window.jack.getCharacters(), window.jack.getSettings()])
  .then(async ([l, r, c, st]) => { handL = l; handR = r; chars = c; await applyCharacter(st); resize(); ready = true; });
window.jack.onSettings((st) => applyCharacter(st));
requestAnimationFrame(loop);
