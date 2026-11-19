// Pet is drawn in base units (270 x 140) and scaled to the window size.
const BASE_W = 330, ABOVE = 156;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });

let head, arm, ready = false, bounce = 0, bounceT = -1, ignoring = true;
let k = 1; // device px per base unit

function resize() {
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(cv.clientWidth * dpr);
  cv.height = Math.round(cv.clientHeight * dpr);
  k = cv.width / BASE_W;
}
window.addEventListener('resize', resize);
window.jack.onScale(() => setTimeout(resize, 50));

const HEAD_W = 170, HAND_W = 96;
function drawHand(cx, y, side) {
  // bottom part of the arm photo (fist + cuff), turned upright: hands cupped on the taskbar, fingers up
  const sy = 190, sh = arm.height - sy;
  const h = HAND_W * sh / arm.width;
  ctx.save();
  ctx.translate(cx, y);
  ctx.scale(side, 1);
  ctx.rotate(Math.PI - 0.35);
  ctx.drawImage(arm, 0, sy, arm.width, sh, -HAND_W / 2, -h / 2, HAND_W, h);
  ctx.restore();
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

  // hands IN FRONT of the taskbar, cupped to catch it
  drawHand(cx - 105, groundY + 14, 1);
  drawHand(cx + 105, groundY + 14, -1);
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

Promise.all([load('../assets/head.png'), load('../assets/arm.png')]).then(([h, a]) => {
  head = h; arm = a; resize(); ready = true;
});
requestAnimationFrame(loop);
