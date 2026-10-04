import { BrowserWindow, clipboard, desktopCapturer, ipcMain } from 'electron';
import { DesktopSource, IpcChannels } from '@yunyan-live/ipc';
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

  ipcMain.on(IpcChannels.message, (_event, payload: unknown) => {
    getWindow()?.webContents.send(IpcChannels.message, payload);
  });

  registerRecordingHandlers(getWindow);
}
