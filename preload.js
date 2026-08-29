'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('forja', {
  toggleFullscreen: () => ipcRenderer.invoke('mf:fullscreen'),
  clearPartition: (part) => ipcRenderer.invoke('mf:clear-partition', part)
});
