const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jack', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getCharacters: () => ipcRenderer.invoke('get-characters'),
  setSettings: (p) => ipcRenderer.send('set-settings', p),
  onSettings: (cb) => ipcRenderer.on('settings', (_e, s) => cb(s)),
  onScale: (cb) => ipcRenderer.on('scale', (_e, s) => cb(s)),
  onFullscreen: (cb) => ipcRenderer.on('fullscreen', (_e, v) => cb(v)),
  quit: () => ipcRenderer.send('quit'),
  ignoreMouse: (v) => ipcRenderer.send('pet-ignore', v),
  petMenu: () => ipcRenderer.send('pet-menu')
});
