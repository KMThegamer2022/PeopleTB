const { spawn } = require('child_process');
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const updater = require('./updater');

// On an older/weaker GPU (common on Windows 7 boxes), Chromium's GPU process can crash and retry in a
// loop before falling back to software rendering, which can leave a transparent window blank for minutes
// even though the rest of the app (tray icon, IPC) is already running fine. Skip straight to software
// rendering - the window here is tiny, so the extra CPU cost is negligible.
app.disableHardwareAcceleration();

// Pet geometry in "base" pixels at 100% size (must match renderer.js)
const BASE_W = 330;
const ABOVE = 190; // height of the part of the pet above the taskbar (base px)

const defaults = { scale: 1.5, position: 0.5, startup: false, visible: true, autoHide: true, character: 'jack', skin: 'default' };
let fullscreen = false, psProc = null, hideTimer = null;
let settings = { ...defaults };
let pet, settingsWin, tray;
let quitting = false;

// Overheat easter egg: configured in overheat.config.json (edit before building). Shake a character fast
// enough and, after a warning, a fake BSOD fills the screen for a few seconds then disappears on its own.
// Nothing is executed on the PC.
let overheat = { enabled: true, hotSpeed: 1100, secondsToWarn: 5, secondsAfterWarnToBsod: 4, cooldownSeconds: 30,
  message: "Please stop! I'm getting too hot!!", afterMessage: 'Just Kidding, lol!' };
try { overheat = { ...overheat, ...JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'overheat.config.json'), 'utf8')) }; } catch {}
let lastBsod = 0, bsodWin = null, bsodRaise = null;
function showBsod() {
  if (bsodWin && !bsodWin.isDestroyed()) return;
  const d = screen.getPrimaryDisplay();
  bsodWin = new BrowserWindow({
    ...d.bounds, frame: false, resizable: false, movable: false, skipTaskbar: true,
    alwaysOnTop: true, backgroundColor: '#0078d7', show: false,
    webPreferences: { preload: path.join(__dirname, 'bsod-preload.js'), contextIsolation: true }
  });
  bsodWin.setAlwaysOnTop(true, 'screen-saver');
  bsodWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  bsodWin.loadFile(path.join(__dirname, 'bsod.html'));
  bsodWin.once('ready-to-show', () => { bsodWin.setBounds(d.bounds); bsodWin.show(); bsodWin.focus(); });
  // The real Windows taskbar is itself an always-on-top window and can raise itself above ours (the
  // same issue the taskbar character had) - OS-level fullscreen isn't reliable on every machine, so
  // re-raise this window constantly instead, the same fix that worked for the character.
  clearInterval(bsodRaise);
  bsodRaise = setInterval(() => {
    if (!bsodWin || bsodWin.isDestroyed()) { clearInterval(bsodRaise); bsodRaise = null; return; }
    bsodWin.setAlwaysOnTop(false);
    bsodWin.setAlwaysOnTop(true, 'screen-saver');
    bsodWin.moveTop();
  }, 150);
}

const charsFile = path.join(__dirname, '..', 'assets', 'characters', 'characters.json');
let manifest = { default: 'jack', characters: [] };
try { manifest = JSON.parse(fs.readFileSync(charsFile, 'utf8')); } catch {}
function currentSkin() {
  const c = manifest.characters.find((x) => x.id === settings.character) || manifest.characters[0];
  if (!c) return null;
  const sk = c.skins.find((x) => x.id === settings.skin) || c.skins[0];
  return { character: c, skin: sk };
}
function setCharacter(id, skin) {
  const c = manifest.characters.find((x) => x.id === id); if (!c) return;
  settings.character = id; settings.skin = (c.skins.find((x) => x.id === skin) || c.skins[0]).id;
  save(); broadcast();
}

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function load() {
  // carry settings over from the old "Taskbar Jack" install
  if (!fs.existsSync(settingsFile())) {
    try {
      const old = path.join(app.getPath('appData'), 'Taskbar Jack', 'settings.json');
      if (fs.existsSync(old)) { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.copyFileSync(old, settingsFile()); }
    } catch {}
  }
  try { settings = { ...defaults, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch {}
}
function save() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch {}
}

function applyStartup() {
  if (!app.isPackaged && process.platform !== 'win32') return;
  app.setLoginItemSettings({ openAtLogin: !!settings.startup, path: process.execPath });
}

function place() {
  if (!pet || pet.isDestroyed()) return;
  const d = screen.getPrimaryDisplay();
  const w = d.bounds.width; // full-width, click-through overlay so smoke can trail along the taskbar
  const above = Math.round(ABOVE * settings.scale);
  // top of the taskbar == bottom of the work area (taskbar docked at bottom)
  const taskbarTop = d.workArea.y + d.workArea.height;
  let tb = d.bounds.y + d.bounds.height - taskbarTop; // taskbar thickness
  if (tb < 10) tb = 48;                                 // auto-hide: reserve room for the hands
  pet.setBounds({ x: d.bounds.x, y: taskbarTop - above, width: w, height: above + tb });
  pet.webContents.send('scale', settings.scale);
}

function createPet() {
  pet = new BrowserWindow({
    width: BASE_W, height: ABOVE + 48,
    frame: false, transparent: true, resizable: false, movable: false,
    focusable: false, skipTaskbar: true, hasShadow: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  pet.setAlwaysOnTop(true, 'screen-saver');
  pet.setIgnoreMouseEvents(true, { forward: true });
  // 'dom-ready' (not 'did-finish-load') so the window appears as soon as the page itself is parsed,
  // without waiting on the character art to finish loading - the in-page spinner covers that gap.
  pet.webContents.once('dom-ready', () => {
    place();
    if (settings.visible) pet.showInactive();
  });
  pet.loadFile(path.join(__dirname, 'pet.html'));
}

// Windows: ask the shell whether a fullscreen app / game / presentation is running. This spawns
// powershell.exe and has it compile a few lines of C# (Add-Type), which is known to stall for a long
// time on some Windows 7 machines (a busy .NET background optimizer, or antivirus inspecting the new
// process). It is only needed for the "hide in fullscreen apps" feature, so: only start it when that
// setting is actually on, start/stop it live when the setting is toggled, and never start it until a
// few seconds after the character is already on screen, so it can never be what delays that.
let watcherStarted = false;
function maybeStartWatcher() {
  if (process.platform !== 'win32' || watcherStarted || !settings.autoHide) return;
  watcherStarted = true;
  const script = "Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class N { [DllImport(\"shell32.dll\")] public static extern int SHQueryUserNotificationState(out int s); }';" +
    "while($true){ $s=0; [void][N]::SHQueryUserNotificationState([ref]$s); [Console]::Out.WriteLine($s); [Console]::Out.Flush(); Start-Sleep -Milliseconds 700 }";
  psProc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], { windowsHide: true });
  let buf = '';
  psProc.stdout.on('data', (d) => {
    buf += d.toString();
    const lines = buf.split(/\r?\n/); buf = lines.pop();
    for (const l of lines) {
      const n = parseInt(l.trim(), 10);
      if (!isNaN(n)) setFullscreen(n === 2 || n === 3 || n === 4);
    }
  });
  psProc.on('error', () => {});
}
function stopWatcher() {
  try { psProc && psProc.kill(); } catch {}
  psProc = null; watcherStarted = false;
  if (fullscreen && pet && !pet.isDestroyed()) {
    fullscreen = false; place(); if (settings.visible) pet.showInactive(); pet.webContents.send('fullscreen', false);
  } else { fullscreen = false; }
}
function setFullscreen(fs) {
  if (fs === fullscreen) return;
  fullscreen = fs;
  if (!pet || pet.isDestroyed() || !settings.visible || !settings.autoHide) return;
  clearTimeout(hideTimer);
  if (fs) {
    pet.webContents.send('fullscreen', true);           // hands drop, the character slides down
    hideTimer = setTimeout(() => { if (fullscreen) pet.hide(); }, 1100);
  } else {
    place(); pet.showInactive();
    pet.webContents.send('fullscreen', false);          // the character slides up, hands pop up
  }
}

function setVisible(v) {
  settings.visible = v; save();
  if (v) { pet.showInactive(); place(); } else pet.hide();
  buildTray();
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 380, height: 520, resizable: false, maximizable: false, minimizable: false,
    title: 'PeopleTB Settings', autoHideMenuBar: true, backgroundColor: '#12151c',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
}

function characterMenu() {
  return manifest.characters.map((c) => {
    if (c.skins.length === 1) {
      return { label: c.name, type: 'radio', checked: settings.character === c.id, click: () => setCharacter(c.id, c.skins[0].id) };
    }
    return { label: c.name, submenu: c.skins.map((k) => ({
      label: k.name, type: 'radio', checked: settings.character === c.id && settings.skin === k.id, click: () => setCharacter(c.id, k.id)
    })) };
  });
}

function menuTemplate() {
  return [
    { label: 'Character', submenu: characterMenu() },
    { type: 'separator' },
    { label: 'Settings…', click: openSettings },
    { label: 'Show on taskbar', type: 'checkbox', checked: settings.visible, click: (i) => setVisible(i.checked) },
    { label: 'Start with Windows', type: 'checkbox', checked: settings.startup,
      click: (i) => { settings.startup = i.checked; save(); applyStartup(); broadcast(); } },
    { label: 'Hide in fullscreen apps', type: 'checkbox', checked: settings.autoHide,
      click: (i) => { settings.autoHide = i.checked; save(); if (i.checked) maybeStartWatcher(); else stopWatcher(); broadcast(); } },
    { label: 'Check for updates…', click: () => updater.check({ manual: true, onQuit: quit, onBusy: busy }) },
    { type: 'separator' },
    { label: 'Quit', click: quit }
  ];
}
function buildTray() {
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()));
}
function busy(b) { if (pet && !pet.isDestroyed()) pet.webContents.send('busy', b); }
function quit() { quitting = true; try { psProc && psProc.kill(); } catch {} app.quit(); }
function broadcast() {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('settings', settings);
  if (pet && !pet.isDestroyed()) pet.webContents.send('settings', settings);
  if (tray) buildTray();
}

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', openSettings);
  app.whenReady().then(() => {
    load();
    applyStartup();

    // Register every ipcMain handler BEFORE creating the window: the pet window's page calls these
    // over IPC the instant it starts loading, and if the handler isn't registered yet that call fails
    // outright (it does not wait/retry) instead of just being a little slow.
    ipcMain.handle('get-settings', () => settings);
    ipcMain.handle('get-characters', () => manifest);
    ipcMain.handle('get-overheat', () => overheat);
    ipcMain.on('overheat-fire', () => {
      if (!overheat.enabled) return;
      if (Date.now() - lastBsod < (overheat.cooldownSeconds || 60) * 1000) return;
      lastBsod = Date.now();
      showBsod();
    });
    ipcMain.on('bsod-done', () => {
      clearInterval(bsodRaise); bsodRaise = null;
      if (bsodWin && !bsodWin.isDestroyed()) bsodWin.close();
      bsodWin = null;
      setTimeout(() => { if (pet && !pet.isDestroyed()) pet.webContents.send('say', overheat.afterMessage); }, 350);
    });
    ipcMain.on('set-settings', (_e, patch) => {
      const prev = settings.startup, prevVis = settings.visible, prevAutoHide = settings.autoHide;
      settings = { ...settings, ...patch };
      settings.scale = Math.min(2.5, Math.max(0.4, Number(settings.scale) || 1));
      settings.position = Math.min(1, Math.max(0, Number(settings.position) || 0));
      save(); place();
      if (prev !== settings.startup) applyStartup();
      if (prevAutoHide !== settings.autoHide) { settings.autoHide ? maybeStartWatcher() : stopWatcher(); }
      if (prevVis !== settings.visible && !(fullscreen && settings.autoHide)) { settings.visible ? pet.showInactive() : pet.hide(); }
      broadcast();
    });
    ipcMain.on('quit', quit);
    ipcMain.on('open-settings', openSettings);
    ipcMain.on('pet-ignore', (_e, ignore) => {
      if (pet && !pet.isDestroyed()) pet.setIgnoreMouseEvents(ignore, { forward: true });
    });
    ipcMain.on('pet-menu', () => Menu.buildFromTemplate(menuTemplate()).popup({ window: pet }));

    // Handlers are live - now create the window and the rest of the chrome.
    createPet();
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png')));
    tray.setToolTip('PeopleTB');
    tray.on('click', openSettings);
    buildTray();
    // Deferred: give the character a few seconds to be on screen before this can ever run.
    setTimeout(maybeStartWatcher, 8000);
    updater.start({ onQuit: quit, onBusy: busy });

    screen.on('display-metrics-changed', place);
    screen.on('display-added', place);
    screen.on('display-removed', place);
    // Keep the pet above the taskbar. The taskbar is itself a topmost window and Windows raises it
    // whenever it is clicked, so re-raise very often, and now and then fully re-assert topmost
    // (Electron ignores setAlwaysOnTop(true) when it already thinks the window is topmost).
    const canRaise = () => pet && !pet.isDestroyed() && settings.visible && !(fullscreen && settings.autoHide);
    setInterval(() => { if (canRaise()) pet.moveTop(); }, 120);
    setInterval(() => {
      if (!canRaise()) return;
      pet.setAlwaysOnTop(false);
      pet.setAlwaysOnTop(true, 'screen-saver');
      pet.moveTop();
    }, 1500);
    setInterval(() => { if (canRaise()) place(); }, 3000);
  });
  app.on('window-all-closed', (e) => { if (!quitting) e.preventDefault(); });
}
