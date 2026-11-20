// The pet window is a full-width, click-through overlay along the taskbar.
// The character is drawn (in "base" units) onto an offscreen layer, then composited at its position.
const BASE_W = 330, ABOVE = 190;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const petCv = document.createElement('canvas');
const pctx = petCv.getContext('2d', { willReadFrequently: true });
const tintCv = document.createElement('canvas');
const tctx = tintCv.getContext('2d');
const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
const ease = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

let head, handL, handR, ready = false, bounceT = -1, ignoring = true;
let hidden = 0, hiddenTarget = 0, lastT = 0; // hidden: 0 = clinging, 1 = tucked away (fullscreen)
let loadingJobs = 1, loadingSince = performance.now(), busy = false; // spinner while starting / switching character / updating
let scale = 1.5, position = 0.5, headW = 170;
let dpr = 1, W = 0, H = 0, petLeft = 0, pw = 0;
window.jack.onFullscreen((fs) => { hiddenTarget = fs ? 1 : 0; });
window.jack.onBusy((b) => { if (b && !busy) loadingSince = performance.now(); busy = b; });
window.jack.onSay((text) => {
  const now = performance.now();
  announceText = text; announceUntil = now + 3200;
  suppressHeatBubbleUntil = now + 3200; // stop the "too hot" bubble re-claiming its spot while shaking continues
});
function jobStart() { if (loadingJobs++ === 0) loadingSince = performance.now(); }
function jobEnd() { loadingJobs = Math.max(0, loadingJobs - 1); }

function resize() {
  dpr = window.devicePixelRatio || 1;
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  pw = Math.round(BASE_W * scale);
  petCv.width = Math.round(pw * dpr); petCv.height = cv.height;
}
window.addEventListener('resize', resize);
window.jack.onScale(() => setTimeout(resize, 50));

// ---------- overheat easter egg ----------
let cfg = { enabled: true, hotSpeed: 1100, secondsToWarn: 5, secondsAfterWarnToBsod: 4, cooldownSeconds: 30, message: "Please stop! I'm getting too hot!!" };
window.jack.getOverheat().then((c) => { cfg = { ...cfg, ...c }; });
let dragging = false, grabDX = 0, downX = 0, moved = false;
let speed = 0, prevLeft = null, heat = 0, overTime = 0, lastFireAt = -Infinity, bubbleUntil = 0;
let announceText = '', announceUntil = 0, suppressHeatBubbleUntil = 0;
const particles = [];

function updateHeat(dt, now) {
  const left = (W - pw) * position;
  if (prevLeft !== null && dt > 0) {
    const inst = dragging ? Math.abs(left - prevLeft) / dt : 0;
    speed += (inst - speed) * Math.min(1, dt * 12);
  }
  prevLeft = left; petLeft = left;
  const hot = cfg.enabled && dragging && speed > cfg.hotSpeed;
  if (hot) {
    const boost = 1 + clamp01((speed - cfg.hotSpeed) / 2000) * 0.5;
    heat = Math.min(1.3, heat + dt * boost / cfg.secondsToWarn);   // reaches 1.0 after ~secondsToWarn
  } else {
    heat = Math.max(0, heat - dt * 0.12);                         // slowly cools back to normal (~10 s)
  }
  if (heat >= 1 && now >= suppressHeatBubbleUntil) bubbleUntil = now + 3500;
  if (hot && heat >= 1) {
    overTime += dt;
    // repeatable: fires again as soon as cooldownSeconds have passed, without needing to fully cool down first
    if (overTime >= cfg.secondsAfterWarnToBsod && now - lastFireAt >= cfg.cooldownSeconds * 1000) {
      lastFireAt = now; overTime = 0; window.jack.overheatFire();
    }
  } else if (!hot) overTime = 0;

  // smoke trail from the hands
  if (heat > 0.4 && (speed > 150 || heat > 0.8)) {
    const n = (dt * 70 * (heat - 0.3)) * (0.4 + clamp01(speed / 1500));
    let count = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    while (count-- > 0 && particles.length < 500) {
      const side = Math.random() < 0.5 ? -1 : 1;
      particles.push({
        x: petLeft + pw / 2 + side * 121 * scale + (Math.random() - 0.5) * 20 * scale,
        y: H - (14 + Math.random() * 18) * scale,
        vx: (Math.random() - 0.5) * 18, vy: -(18 + Math.random() * 30),
        r: (3 + Math.random() * 3) * scale, grow: (9 + Math.random() * 8) * scale,
        age: 0, life: 2.4 + Math.random() * 1.2
      });
    }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.age += dt;
    if (p.age >= p.life) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.grow * dt;
  }
}

function drawSmoke() {
  for (const p of particles) {
    const a = Math.pow(1 - p.age / p.life, 1.3) * 0.5;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    g.addColorStop(0, `rgba(120,120,120,${a})`);
    g.addColorStop(1, 'rgba(120,120,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
}

function drawBubble(now) {
  let text, stroke, tcolor, shaky;
  if (now <= announceUntil) { text = announceText; stroke = '#2563eb'; tcolor = '#1d4ed8'; shaky = false; }
  else if (now <= bubbleUntil) { text = cfg.message; stroke = '#d33'; tcolor = '#c00'; shaky = true; }
  else return;
  const shake = shaky ? Math.sin(now / 35) * 1.5 : 0;
  ctx.save();
  ctx.font = 'bold 15px "Segoe UI", sans-serif';
  const tw = ctx.measureText(text).width, bw = tw + 26, bh = 34;
  let bx = petLeft + pw / 2 - bw / 2 + shake;
  bx = Math.max(4, Math.min(W - bw - 4, bx));
  const by = 4;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = stroke; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 12); ctx.fill(); ctx.stroke();
  const tx = petLeft + pw / 2 + shake;
  ctx.beginPath(); ctx.moveTo(tx - 8, by + bh); ctx.lineTo(tx, by + bh + 10); ctx.lineTo(tx + 8, by + bh); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(tx - 7, by + bh - 2, 14, 3);
  ctx.fillStyle = tcolor; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillText(text, bx + bw / 2, by + bh / 2 + 1);
  ctx.restore();
}

// ---------- loading spinner ----------
function drawSpinner(now) {
  if (!(loadingJobs > 0 || busy) || now - loadingSince < 120) return;
  const cx = petLeft + pw / 2, cy = Math.max(40, H - 70 * scale);
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = 'rgba(15,18,28,0.72)';
  ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.fill();
  const n = 12, rot = (now / 90) % n;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, f = ((i - rot + n) % n) / n;       // trailing fade
    ctx.fillStyle = `rgba(255,255,255,${(0.15 + 0.85 * (1 - f)).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 16, cy + Math.sin(a) * 16, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------- character ----------
const HAND_K = 0.34, HAND_OFF = 121;
let handScale = 1;
function drawHand(img, cx, dropPx) {
  const w = img.width * HAND_K * handScale, h = img.height * HAND_K * handScale;
  // Anchored to the taskbar's visual top edge (ABOVE), not the window's own bottom - that included
  // the OS's own taskbar-thickness gap, which swamped small hands entirely at low handScale. This way
  // the same fraction of the hand always shows above the edge, at any size and any taskbar thickness.
  const y = ABOVE - h * 0.7 + dropPx;
  const tint = clamp01(heat);
  if (tint < 0.02) { pctx.drawImage(img, cx - w / 2, y, w, h); return; }
  // red-hot tint: draw the hand, then paint red over only its opaque pixels
  tintCv.width = img.width; tintCv.height = img.height;
  tctx.clearRect(0, 0, tintCv.width, tintCv.height);
  tctx.drawImage(img, 0, 0);
  tctx.globalCompositeOperation = 'source-atop';
  tctx.fillStyle = `rgba(255,${Math.round(40 - tint * 20)},10,${(0.8 * tint).toFixed(3)})`;
  tctx.fillRect(0, 0, tintCv.width, tintCv.height);
  tctx.globalCompositeOperation = 'source-over';
  pctx.drawImage(tintCv, cx - w / 2, y, w, h);
}

function drawPet(t, dt) {
  hidden += Math.sign(hiddenTarget - hidden) * Math.min(Math.abs(hiddenTarget - hidden), dt / 0.9);
  const handDrop = ease(clamp01(hidden / 0.45));          // hands drop away first
  const headDrop = ease(clamp01((hidden - 0.3) / 0.7));   // then the character slides down behind the taskbar
  pctx.setTransform(1, 0, 0, 1, 0, 0);
  pctx.clearRect(0, 0, petCv.width, petCv.height);
  const k = scale * dpr;
  pctx.setTransform(k, 0, 0, k, 0, 0);
  const groundY = ABOVE;                      // taskbar top edge
  const headH = headW * head.height / head.width;
  const cx = BASE_W / 2;
  const hot = clamp01(heat);
  const sway = Math.sin(t / (900 - hot * 600)) * (1.2 + hot * 2.5) * Math.PI / 180;
  let hop = 0;
  if (bounceT >= 0) {
    const p = (t - bounceT) / 450;
    if (p >= 1) bounceT = -1; else hop = Math.sin(p * Math.PI) * 14;
  }
  const bob = Math.sin(t / 700) * 1.5 - hop;

  // behind the taskbar: body clipped at its top edge
  pctx.save();
  pctx.beginPath(); pctx.rect(0, 0, BASE_W, groundY); pctx.clip();
  pctx.translate(cx, groundY + 8 + headDrop * (headH + 24));
  pctx.rotate(sway);
  pctx.drawImage(head, -headW / 2, -headH + bob, headW, headH);
  pctx.restore();

  // hands IN FRONT of the taskbar, hooked over its top edge, fingers reaching up over the top
  const dropPx = handDrop * 70;
  drawHand(handL, cx - HAND_OFF, dropPx);
  drawHand(handR, cx + HAND_OFF, dropPx);
}

function draw(t) {
  const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
  updateHeat(dt, t);
  drawPet(t, dt);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSmoke();
  ctx.drawImage(petCv, 0, 0, petCv.width, petCv.height, petLeft, 0, petCv.width / dpr, petCv.height / dpr);
  drawBubble(t);
  drawSpinner(t);
}
function loop(t) {
  if (ready) draw(t);
  else {                                   // still starting up: just the spinner
    petLeft = Math.max(0, (W - pw) * position);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    drawSpinner(t);
  }
  requestAnimationFrame(loop);
}

// ---------- mouse: click-through except over the character's own pixels ----------
function overPet(x, y) {
  const px = Math.floor((x - petLeft) * dpr), py = Math.floor(y * dpr);
  if (px < 0 || py < 0 || px >= petCv.width || py >= petCv.height) return false;
  return pctx.getImageData(px, py, 1, 1).data[3] > 20;
}
function setIgnore(v) { if (v !== ignoring) { ignoring = v; window.jack.ignoreMouse(v); } }
window.addEventListener('mousemove', (e) => {
  if (!ready || dragging) return;
  const over = overPet(e.clientX, e.clientY);
  setIgnore(!over);
  document.body.style.cursor = over ? 'grab' : 'default';
});
cv.addEventListener('pointerdown', (e) => {
  if (e.button === 2) { window.jack.petMenu(); return; }
  if (e.button !== 0 || !ready || !overPet(e.clientX, e.clientY)) return;
  dragging = true; moved = false; downX = e.clientX; grabDX = e.clientX - petLeft;
  cv.setPointerCapture(e.pointerId);
  document.body.style.cursor = 'grabbing';
});
cv.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  if (Math.abs(e.clientX - downX) > 4) moved = true;
  const range = Math.max(1, W - pw);
  position = clamp01((e.clientX - grabDX) / range);
});
function endDrag() {
  if (!dragging) return;
  dragging = false; document.body.style.cursor = 'grab';
  if (!moved) bounceT = performance.now(); else window.jack.setSettings({ position });
}
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);
window.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- characters / settings ----------
let chars = null;
async function applyCharacter(st) {
  if (!chars) return;
  const c = chars.characters.find((x) => x.id === st.character) || chars.characters[0];
  const sk = c.skins.find((x) => x.id === st.skin) || c.skins[0];
  jobStart();
  try { head = await load('../assets/characters/' + sk.head); headW = sk.width || 170; } finally { jobEnd(); }
}
function applySettings(st) {
  if (st.scale && st.scale !== scale) { scale = st.scale; resize(); }
  if (typeof st.handScale === 'number') handScale = st.handScale;
  if (!dragging && typeof st.position === 'number') position = st.position;
  return applyCharacter(st);
}
Promise.all([load('../assets/hand-left.webp'), load('../assets/hand-right.webp'), window.jack.getCharacters(), window.jack.getSettings()])
  .then(async ([l, r, c, st]) => { handL = l; handR = r; chars = c; scale = st.scale || scale; handScale = st.handScale || handScale; position = st.position; await applyCharacter(st); resize(); ready = true; jobEnd(); });
window.jack.onSettings(applySettings);
resize();
requestAnimationFrame(loop);
