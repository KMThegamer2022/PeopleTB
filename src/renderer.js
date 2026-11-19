// Pet is drawn in base units (270 x 140) and scaled to the window size.
const BASE_W = 330, ABOVE = 156;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });

let head, handL, handR, ready = false, bounce = 0, bounceT = -1, ignoring = true;
let k = 1; // device px per base unit

function resize() {
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(cv.clientWidth * dpr);
  cv.height = Math.round(cv.clientHeight * dpr);
  k = cv.width / BASE_W;
}
window.addEventListener('resize', resize);
window.jack.onScale(() => setTimeout(resize, 50));

const HEAD_W = 170, HAND_K = 0.34, HAND_OFF = 121;
function drawHand(img, cx, bottom) {
  const w = img.width * HAND_K, h = img.height * HAND_K;
  ctx.drawImage(img, cx - w / 2, bottom - h, w, h);
}
function draw(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const groundY = ABOVE;                      // taskbar top edge
  const headH = HEAD_W * head.height / head.width;
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
  ctx.translate(cx, groundY + 8);
  ctx.rotate(sway);
  ctx.drawImage(head, -HEAD_W / 2, -headH + bob, HEAD_W, headH);
  ctx.restore();

  // hands IN FRONT of the taskbar, resting on its bottom edge, fingers reaching up over the top
  const bottom = cv.height / k;
  drawHand(handL, cx - HAND_OFF, bottom);
  drawHand(handR, cx + HAND_OFF, bottom);
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

Promise.all([load('../assets/head.png'), load('../assets/hand-left.png'), load('../assets/hand-right.png')]).then(([h, l, r]) => {
  head = h; handL = l; handR = r; resize(); ready = true;
});
requestAnimationFrame(loop);
