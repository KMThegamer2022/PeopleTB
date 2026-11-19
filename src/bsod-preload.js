const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bsod', { done: () => ipcRenderer.send('bsod-done') });
