const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherApi', {
  getState: () => ipcRenderer.invoke('launcher:getState'),
  getGame: (id) => ipcRenderer.invoke('launcher:getGame', id),
  queueInstall: (id, mode) => ipcRenderer.invoke('launcher:queueInstall', id, mode),
  pauseDownload: (jobId) => ipcRenderer.invoke('launcher:pauseDownload', jobId),
  resumeDownload: (jobId) => ipcRenderer.invoke('launcher:resumeDownload', jobId),
  cancelDownload: (jobId) => ipcRenderer.invoke('launcher:cancelDownload', jobId),
  launchGame: (id) => ipcRenderer.invoke('launcher:launchGame', id),
  uninstallGame: (id) => ipcRenderer.invoke('launcher:uninstallGame', id),
  setSetting: (key, value) => ipcRenderer.invoke('launcher:setSetting', key, value),
  clearCache: () => ipcRenderer.invoke('launcher:clearCache'),
  openLogs: () => ipcRenderer.invoke('launcher:openLogs'),
  openFolder: (folderPath) => ipcRenderer.invoke('launcher:openFolder', folderPath),
  subscribe: (callback) => {
    ipcRenderer.on('launcher:event', (_event, payload) => callback(payload));
    ipcRenderer.send('launcher:subscribe');
  },
});
