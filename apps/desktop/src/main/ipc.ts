import { app, BrowserWindow, clipboard, desktopCapturer, ipcMain, shell } from 'electron';
import { DesktopSource, IpcChannels, SystemInfo } from '@yunyan-live/ipc';
import { registerRecordingHandlers } from './recording';

type GetWindow = () => BrowserWindow | null;

export function registerIpcHandlers(getWindow: GetWindow): void {
  ipcMain.handle(IpcChannels.getSources, async (): Promise<DesktopSource[]> => {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 320, height: 200 }
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnailDataUrl: source.thumbnail.toDataURL(),
      displayId: source.display_id
    }));
  });

  ipcMain.handle(IpcChannels.clipboardWrite, (_event, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.handle(IpcChannels.openExternal, (_event, url: string) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      return shell.openExternal(url);
    }
    return Promise.resolve();
  });

  ipcMain.handle(IpcChannels.getSystemInfo, (): SystemInfo => {
    return {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      node: process.versions.node ?? ''
    };
  });

  ipcMain.on(IpcChannels.message, (_event, payload: unknown) => {
    getWindow()?.webContents.send(IpcChannels.message, payload);
  });

  registerRecordingHandlers(getWindow);
}