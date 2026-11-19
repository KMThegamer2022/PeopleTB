const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// Pet geometry in "base" pixels at 100% size (must match renderer.js)
const BASE_W = 330;
const ABOVE = 156; // height of the part of the pet above the taskbar (base px)

const defaults = { scale: 1, position: 0.5, startup: false, visible: true };
let settings = { ...defaults };
let pet, settingsWin, tray;
let quitting = false;

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function load() {
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
  const w = Math.round(BASE_W * settings.scale);
  const above = Math.round(ABOVE * settings.scale);
  // top of the taskbar == bottom of the work area (taskbar docked at bottom)
  const taskbarTop = d.workArea.y + d.workArea.height;
  let tb = d.bounds.y + d.bounds.height - taskbarTop; // taskbar thickness
  if (tb < 10) tb = 48;                                 // auto-hide: reserve room for the hands
  const minX = d.bounds.x, maxX = d.bounds.x + d.bounds.width - w;
  const x = Math.round(minX + (maxX - minX) * settings.position);
  pet.setBounds({ x, y: taskbarTop - above, width: w, height: above + tb });
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
  pet.loadFile(path.join(__dirname, 'pet.html'));
  pet.webContents.once('did-finish-load', () => {
    place();
    if (settings.visible) pet.showInactive();
  });
}

function setVisible(v) {
  settings.visible = v; save();
  if (v) { pet.showInactive(); place(); } else pet.hide();
  buildTray();
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 380, height: 420, resizable: false, maximizable: false, minimizable: false,
    title: 'Taskbar Jack Settings', autoHideMenuBar: true, backgroundColor: '#12151c',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
}

function menuTemplate() {
  return [
    { label: 'Settings…', click: openSettings },
    { label: 'Show Jack', type: 'checkbox', checked: settings.visible, click: (i) => setVisible(i.checked) },
    { label: 'Start with Windows', type: 'checkbox', checked: settings.startup,
      click: (i) => { settings.startup = i.checked; save(); applyStartup(); broadcast(); } },
    { type: 'separator' },
    { label: 'Quit', click: quit }
  ];
}
function buildTray() {
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()));
}
function quit() { quitting = true; app.quit(); }
function broadcast() {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('settings', settings);
  if (tray) buildTray();
}

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', openSettings);
  app.whenReady().then(() => {
    load();
    applyStartup();
    createPet();
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png')));
    tray.setToolTip('Taskbar Jack');
    tray.on('click', openSettings);
    buildTray();

    screen.on('display-metrics-changed', place);
    screen.on('display-added', place);
    screen.on('display-removed', place);
    // Keep Jack above the taskbar (Windows can re-raise the taskbar over topmost windows)
    setInterval(() => {
      if (pet && !pet.isDestroyed() && settings.visible) {
        pet.setAlwaysOnTop(true, 'screen-saver');
        pet.moveTop();
        place();
      }
    }, 3000);

    ipcMain.handle('get-settings', () => settings);
    ipcMain.on('set-settings', (_e, patch) => {
      const prev = settings.startup, prevVis = settings.visible;
      settings = { ...settings, ...patch };
      settings.scale = Math.min(2.5, Math.max(0.4, Number(settings.scale) || 1));
      settings.position = Math.min(1, Math.max(0, Number(settings.position) || 0));
      save(); place();
      if (prev !== settings.startup) applyStartup();
      if (prevVis !== settings.visible) { settings.visible ? pet.showInactive() : pet.hide(); }
      broadcast();
    });
    ipcMain.on('quit', quit);
    ipcMain.on('open-settings', openSettings);
    ipcMain.on('pet-ignore', (_e, ignore) => {
      if (pet && !pet.isDestroyed()) pet.setIgnoreMouseEvents(ignore, { forward: true });
    });
    ipcMain.on('pet-menu', () => Menu.buildFromTemplate(menuTemplate()).popup({ window: pet }));
  });
  app.on('window-all-closed', (e) => { if (!quitting) e.preventDefault(); });
}
