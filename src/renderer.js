// Pet is drawn in base units (270 x 140) and scaled to the window size.
const BASE_W = 270, BASE_H = 160, SINK = 6;
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

const HEAD_W = 170, ARM_W = 70;
function draw(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const groundY = BASE_H - SINK;              // taskbar top edge
  const headH = HEAD_W * head.height / head.width;
  const armH = ARM_W * arm.height / arm.width;
  const cx = BASE_W / 2;

  const sway = Math.sin(t / 900) * 1.2 * Math.PI / 180;
  let hop = 0;
  if (bounceT >= 0) {
    const p = (t - bounceT) / 450;
    if (p >= 1) bounceT = -1; else hop = Math.sin(p * Math.PI) * 14;
  }
  const bob = Math.sin(t / 700) * 1.5 - hop;

  // arms: fists rest on the taskbar edge, sleeves tucked behind the body
  const armBottom = groundY + SINK + 2;
  const lx = cx - HEAD_W / 2 - ARM_W + 28;
  ctx.drawImage(arm, lx, armBottom - armH, ARM_W, armH);
  ctx.save(); ctx.translate(cx + HEAD_W / 2 + ARM_W - 28, 0); ctx.scale(-1, 1);
  ctx.drawImage(arm, 0, armBottom - armH, ARM_W, armH); ctx.restore();

  // body + head, pivoting around the bottom centre
  ctx.save();
  ctx.translate(cx, groundY + SINK);
  ctx.rotate(sway);
  ctx.drawImage(head, -HEAD_W / 2, -headH + bob, HEAD_W, headH);
  ctx.restore();
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
