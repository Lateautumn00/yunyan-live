import { BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { IpcChannels } from '@yunyan-live/ipc';

export function initUpdater(window: BrowserWindow, feedUrl: string): void {
  autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });

  const send = (type: string, message?: unknown): void => {
    window.webContents.send(IpcChannels.message, { type, message });
  };

  autoUpdater.on('error', (error) => send('error', String(error)));
  autoUpdater.on('checking-for-update', () => send('checking'));
  autoUpdater.on('update-available', () => send('update-available'));
  autoUpdater.on('update-not-available', () => send('update-not-available'));
  autoUpdater.on('download-progress', (progress) => send('download-progress', progress.percent));
  autoUpdater.on('update-downloaded', () => {
    send('update-downloaded');
    setImmediate(() => autoUpdater.quitAndInstall());
  });

  ipcMain.on(IpcChannels.checkForUpdate, () => {
    autoUpdater.checkForUpdates();
  });
}