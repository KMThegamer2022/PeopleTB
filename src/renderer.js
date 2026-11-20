// The pet window is a full-width, click-through overlay along the taskbar.
// Each character ("pet") is drawn (in "base" units) onto its own offscreen layer, then composited
// at its own position - several can be on screen at once, each dragged/shaken independently.
const BASE_W = 330, ABOVE = 190;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const tintCv = document.createElement('canvas'); // shared scratch canvas for the red-hot tint (draws are sequential)
const tctx = tintCv.getContext('2d');
const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
const ease = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

let handL, handR, ready = false, ignoring = true;
let hidden = 0, hiddenTarget = 0, lastT = 0; // hidden: 0 = clinging, 1 = tucked away (fullscreen), shared by all pets
let loadingJobs = 1, loadingSince = performance.now(), busy = false; // spinner while starting / switching character / updating
let dpr = 1, W = 0, H = 0, maxScale = 1;
let pets = [], draggingPet = null, chars = null;
window.jack.onFullscreen((fs) => { hiddenTarget = fs ? 1 : 0; });
window.jack.onBusy((b) => { if (b && !busy) loadingSince = performance.now(); busy = b; });
window.jack.onSay((text) => {
  const p = draggingPet || pets[0]; if (!p) return;
  const now = performance.now();
  p.announceText = text; p.announceUntil = now + 3200;
  p.suppressHeatBubbleUntil = now + 3200; // stop the "too hot" bubble re-claiming its spot while shaking continues
});
function jobStart() { if (loadingJobs++ === 0) loadingSince = performance.now(); }
function jobEnd() { loadingJobs = Math.max(0, loadingJobs - 1); }

function resize() {
  dpr = window.devicePixelRatio || 1;
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  maxScale = pets.length ? Math.max(...pets.map((p) => p.scale)) : 1;
  for (const p of pets) {
    p.pw = Math.round(BASE_W * p.scale);
    p.petCv.width = Math.round(p.pw * dpr); p.petCv.height = cv.height;
  }
}
window.addEventListener('resize', resize);
window.jack.onScale(() => setTimeout(resize, 50));

// ---------- overheat easter egg ----------
let cfg = { enabled: true, hotSpeed: 1100, secondsToWarn: 5, secondsAfterWarnToBsod: 4, cooldownSeconds: 30, message: "Please stop! I'm getting too hot!!" };
window.jack.getOverheat().then((c) => { cfg = { ...cfg, ...c }; });
const particles = [];

function updateHeat(p, dt, now) {
  const left = (W - p.pw) * p.position;
  if (p.prevLeft !== null && dt > 0) {
    const inst = p.dragging ? Math.abs(left - p.prevLeft) / dt : 0;
    p.speed += (inst - p.speed) * Math.min(1, dt * 12);
  }
  p.prevLeft = left; p.petLeft = left;
  const hot = cfg.enabled && p.dragging && p.speed > cfg.hotSpeed;
  if (hot) {
    const boost = 1 + clamp01((p.speed - cfg.hotSpeed) / 2000) * 0.5;
    p.heat = Math.min(1.3, p.heat + dt * boost / cfg.secondsToWarn);   // reaches 1.0 after ~secondsToWarn
  } else {
    p.heat = Math.max(0, p.heat - dt * 0.12);                         // slowly cools back to normal (~10 s)
  }
  if (p.heat >= 1 && now >= p.suppressHeatBubbleUntil) p.bubbleUntil = now + 3500;
  if (hot && p.heat >= 1) {
    p.overTime += dt;
    // repeatable: fires again as soon as cooldownSeconds have passed, without needing to fully cool down first
    if (p.overTime >= cfg.secondsAfterWarnToBsod && now - p.lastFireAt >= cfg.cooldownSeconds * 1000) {
      p.lastFireAt = now; p.overTime = 0; window.jack.overheatFire();
    }
  } else if (!hot) p.overTime = 0;

  // smoke trail from the hands
  if (p.heat > 0.4 && (p.speed > 150 || p.heat > 0.8)) {
    const n = (dt * 70 * (p.heat - 0.3)) * (0.4 + clamp01(p.speed / 1500));
    let count = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    while (count-- > 0 && particles.length < 500) {
      const side = Math.random() < 0.5 ? -1 : 1;
      particles.push({
        x: p.petLeft + p.pw / 2 + side * 121 * p.scale + (Math.random() - 0.5) * 20 * p.scale,
        y: H - (14 + Math.random() * 18) * p.scale,
        vx: (Math.random() - 0.5) * 18, vy: -(18 + Math.random() * 30),
        r: (3 + Math.random() * 3) * p.scale, grow: (9 + Math.random() * 8) * p.scale,
        age: 0, life: 2.4 + Math.random() * 1.2
      });
    }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const sp = particles[i]; sp.age += dt;
    if (sp.age >= sp.life) { particles.splice(i, 1); continue; }
    sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.r += sp.grow * dt;
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

function drawBubble(p, now) {
  let text, stroke, tcolor, shaky;
  if (now <= p.announceUntil) { text = p.announceText; stroke = '#2563eb'; tcolor = '#1d4ed8'; shaky = false; }
  else if (now <= p.bubbleUntil) { text = cfg.message; stroke = '#d33'; tcolor = '#c00'; shaky = true; }
  else return;
  const shake = shaky ? Math.sin(now / 35) * 1.5 : 0;
  ctx.save();
  ctx.font = 'bold 15px "Segoe UI", sans-serif';
  const tw = ctx.measureText(text).width, bw = tw + 26, bh = 34;
  let bx = p.petLeft + p.pw / 2 - bw / 2 + shake;
  bx = Math.max(4, Math.min(W - bw - 4, bx));
  const by = 4;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = stroke; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 12); ctx.fill(); ctx.stroke();
  const tx = p.petLeft + p.pw / 2 + shake;
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
  const p = pets[0];
  const cx = p ? p.petLeft + p.pw / 2 : W / 2, cy = Math.max(40, H - 70 * (p ? p.scale : 1));
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
function drawHand(p, img, cx, dropPx, groundY) {
  const w = img.width * HAND_K * p.handScale, h = img.height * HAND_K * p.handScale;
  // Peek above the taskbar edge is a fixed amount (from the hand's BASE size, not handScale),
  // so the fingertip stays pinned at the edge at any hand size instead of floating higher as
  // handScale grows. The rest of the hand extends down in front of the taskbar.
  const peek = img.height * HAND_K * 0.25;
  const y = groundY - peek + dropPx;
  const tint = clamp01(p.heat);
  if (tint < 0.02) { p.pctx.drawImage(img, cx - w / 2, y, w, h); return; }
  // red-hot tint: draw the hand, then paint red over only its opaque pixels
  tintCv.width = img.width; tintCv.height = img.height;
  tctx.clearRect(0, 0, tintCv.width, tintCv.height);
  tctx.drawImage(img, 0, 0);
  tctx.globalCompositeOperation = 'source-atop';
  tctx.fillStyle = `rgba(255,${Math.round(40 - tint * 20)},10,${(0.8 * tint).toFixed(3)})`;
  tctx.fillRect(0, 0, tintCv.width, tintCv.height);
  tctx.globalCompositeOperation = 'source-over';
  p.pctx.drawImage(tintCv, cx - w / 2, y, w, h);
}

function drawPet(p, t, dt) {
  const handDrop = ease(clamp01(hidden / 0.45));          // hands drop away first
  const headDrop = ease(clamp01((hidden - 0.3) / 0.7));   // then the character slides down behind the taskbar
  p.pctx.setTransform(1, 0, 0, 1, 0, 0);
  p.pctx.clearRect(0, 0, p.petCv.width, p.petCv.height);
  const k = p.scale * dpr;
  p.pctx.setTransform(k, 0, 0, k, 0, 0);
  // the window is sized for the biggest pet on screen; a smaller pet's own "above the taskbar"
  // area is scaled up to match so its taskbar edge still lands on the real taskbar's top edge.
  const groundY = ABOVE * maxScale / p.scale;
  const headH = p.headW * p.head.height / p.head.width;
  const cx = BASE_W / 2;
  const hot = clamp01(p.heat);
  const sway = Math.sin(t / (900 - hot * 600)) * (1.2 + hot * 2.5) * Math.PI / 180;
  let hop = 0;
  if (p.bounceT >= 0) {
    const pr = (t - p.bounceT) / 450;
    if (pr >= 1) p.bounceT = -1; else hop = Math.sin(pr * Math.PI) * 14;
  }
  const bob = Math.sin(t / 700) * 1.5 - hop;

  // behind the taskbar: body clipped at its top edge
  p.pctx.save();
  p.pctx.beginPath(); p.pctx.rect(0, 0, BASE_W, groundY); p.pctx.clip();
  p.pctx.translate(cx, groundY + 8 + headDrop * (headH + 24));
  p.pctx.rotate(sway);
  p.pctx.drawImage(p.head, -p.headW / 2, -headH + bob, p.headW, headH);
  p.pctx.restore();

  // hands IN FRONT of the taskbar, hooked over its top edge, fingers reaching up over the top
  const dropPx = handDrop * 70;
  drawHand(p, handL, cx - HAND_OFF, dropPx, groundY);
  drawHand(p, handR, cx + HAND_OFF, dropPx, groundY);
}

function draw(t) {
  const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
  hidden += Math.sign(hiddenTarget - hidden) * Math.min(Math.abs(hiddenTarget - hidden), dt / 0.9);
  for (const p of pets) updateHeat(p, dt, t);
  for (const p of pets) { if (p.head) drawPet(p, t, dt); }      // head art loads async; skip until it's ready
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSmoke();
  for (const p of pets) ctx.drawImage(p.petCv, 0, 0, p.petCv.width, p.petCv.height, p.petLeft, 0, p.petCv.width / dpr, p.petCv.height / dpr);
  for (const p of pets) drawBubble(p, t);
  drawSpinner(t);
}
function loop(t) {
  if (ready) draw(t);
  else {                                   // still starting up: just the spinner
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    drawSpinner(t);
  }
  requestAnimationFrame(loop);
}

// ---------- mouse: click-through except over a character's own pixels ----------
function petAt(x, y) {
  for (let i = pets.length - 1; i >= 0; i--) {                 // topmost (last drawn) first
    const p = pets[i];
    const px = Math.floor((x - p.petLeft) * dpr), py = Math.floor(y * dpr);
    if (px < 0 || py < 0 || px >= p.petCv.width || py >= p.petCv.height) continue;
    if (p.pctx.getImageData(px, py, 1, 1).data[3] > 20) return p;
  }
  return null;
}
function setIgnore(v) { if (v !== ignoring) { ignoring = v; window.jack.ignoreMouse(v); } }
window.addEventListener('mousemove', (e) => {
  if (!ready || draggingPet) return;
  const over = petAt(e.clientX, e.clientY);
  setIgnore(!over);
  document.body.style.cursor = over ? 'grab' : 'default';
});
cv.addEventListener('pointerdown', (e) => {
  if (e.button === 2) { window.jack.petMenu(); return; }
  if (e.button !== 0 || !ready) return;
  const p = petAt(e.clientX, e.clientY); if (!p) return;
  draggingPet = p; p.dragging = true; p.moved = false; p.downX = e.clientX; p.grabDX = e.clientX - p.petLeft;
  cv.setPointerCapture(e.pointerId);
  document.body.style.cursor = 'grabbing';
});
cv.addEventListener('pointermove', (e) => {
  const p = draggingPet; if (!p) return;
  if (Math.abs(e.clientX - p.downX) > 4) p.moved = true;
  const range = Math.max(1, W - p.pw);
  p.position = clamp01((e.clientX - p.grabDX) / range);
});
function syncPets() {
  window.jack.setSettings({ pets: pets.map((p) => ({ id: p.id, character: p.character, skin: p.skin, scale: p.scale, handScale: p.handScale, position: p.position })) });
}
function endDrag() {
  const p = draggingPet; if (!p) return;
  draggingPet = null; p.dragging = false; document.body.style.cursor = 'grab';
  if (!p.moved) p.bounceT = performance.now(); else syncPets();
}
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);
window.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- characters / settings ----------
const headCache = new Map(); // "character/skin" -> Promise<{img,width}>, shared across pets using the same character
function loadHead(character, skin) {
  const key = character + '/' + skin;
  if (!headCache.has(key)) {
    const c = chars.characters.find((x) => x.id === character) || chars.characters[0];
    const sk = c.skins.find((x) => x.id === skin) || c.skins[0];
    headCache.set(key, load('../assets/characters/' + sk.head).then((img) => ({ img, width: sk.width || 170 })));
  }
  return headCache.get(key);
}
function newPet(spec) {
  const petCv = document.createElement('canvas');
  return {
    id: spec.id, character: spec.character, skin: spec.skin,
    scale: spec.scale, handScale: spec.handScale, position: spec.position,
    head: null, headW: 170, petCv, pctx: petCv.getContext('2d', { willReadFrequently: true }),
    pw: 0, petLeft: 0,
    dragging: false, grabDX: 0, downX: 0, moved: false, bounceT: -1,
    speed: 0, prevLeft: null, heat: 0, overTime: 0, lastFireAt: -Infinity, bubbleUntil: 0,
    announceText: '', announceUntil: 0, suppressHeatBubbleUntil: 0
  };
}
// Merge the latest settings.pets into the running pets, keeping each one's live runtime state
// (heat, drag, canvases, loaded head) instead of recreating everything on every settings change.
function syncFromSettings(st) {
  if (!chars) return Promise.resolve();
  const specs = st.pets || [];
  const byId = new Map(pets.map((p) => [p.id, p]));
  const next = [], loads = [];
  for (const spec of specs) {
    let p = byId.get(spec.id);
    const isNew = !p;
    if (isNew) p = newPet(spec);
    const charChanged = isNew || p.character !== spec.character || p.skin !== spec.skin;
    p.scale = spec.scale; p.handScale = spec.handScale;
    if (!p.dragging) p.position = spec.position;
    p.character = spec.character; p.skin = spec.skin;
    next.push(p);
    if (charChanged) {
      jobStart();
      loads.push(loadHead(spec.character, spec.skin).then(({ img, width }) => { p.head = img; p.headW = width; jobEnd(); }));
    }
  }
  pets = next;
  resize();
  return Promise.all(loads);
}
Promise.all([load('../assets/hand-left.webp'), load('../assets/hand-right.webp'), window.jack.getCharacters(), window.jack.getSettings()])
  .then(async ([l, r, c, st]) => { handL = l; handR = r; chars = c; await syncFromSettings(st); ready = true; jobEnd(); });
window.jack.onSettings((st) => { syncFromSettings(st); });
resize();
requestAnimationFrame(loop);
