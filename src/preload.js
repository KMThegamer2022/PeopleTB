const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jack', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (p) => ipcRenderer.send('set-settings', p),
  onSettings: (cb) => ipcRenderer.on('settings', (_e, s) => cb(s)),
  onScale: (cb) => ipcRenderer.on('scale', (_e, s) => cb(s)),
  quit: () => ipcRenderer.send('quit'),
  ignoreMouse: (v) => ipcRenderer.send('pet-ignore', v),
  petMenu: () => ipcRenderer.send('pet-menu')
});
