const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { LauncherService } = require('./service');

const rootDir = app.isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '../../');
const launcher = new LauncherService(rootDir);

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: 'PortableGitHubGameLauncher',
    backgroundColor: '#0b0f1a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(async () => {
  await launcher.initialize();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('launcher:getState', async () => launcher.getState());
ipcMain.handle('launcher:getGame', async (_e, id) => launcher.getGame(id));
ipcMain.handle('launcher:queueInstall', async (_e, id, mode) => launcher.queueInstall(id, mode));
ipcMain.handle('launcher:pauseDownload', async (_e, jobId) => launcher.pauseDownload(jobId));
ipcMain.handle('launcher:resumeDownload', async (_e, jobId) => launcher.resumeDownload(jobId));
ipcMain.handle('launcher:cancelDownload', async (_e, jobId) => launcher.cancelDownload(jobId));
ipcMain.handle('launcher:launchGame', async (_e, id) => launcher.launchGame(id));
ipcMain.handle('launcher:uninstallGame', async (_e, id) => launcher.uninstallGame(id));
ipcMain.handle('launcher:setSetting', async (_e, key, value) => launcher.setSetting(key, value));
ipcMain.handle('launcher:clearCache', async () => launcher.clearCache());
ipcMain.handle('launcher:openLogs', async () => {
  await shell.openPath(launcher.paths.logsDir);
  return true;
});
ipcMain.handle('launcher:openFolder', async (_e, folderPath) => {
  await shell.openPath(folderPath);
  return true;
});

ipcMain.on('launcher:subscribe', (event) => {
  const listener = (payload) => event.sender.send('launcher:event', payload);
  launcher.onEvent(listener);
  event.sender.once('destroyed', () => launcher.offEvent(listener));
});
