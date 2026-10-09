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
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnailDataUrl: source.thumbnail.toDataURL(),
      displayId: source.display_id
    }));
  });

  // F4.6 截图插入：主屏全分辨率捕获（v1 取第一个 screen 源）。macOS 无屏幕录制权限时
  // getSources 抛错 → invoke reject，渲染端降级剪贴板插入
  ipcMain.handle(IpcChannels.captureScreen, async (): Promise<string> => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 2560, height: 1440 }
    });
    const primary = sources[0];
    return primary ? primary.thumbnail.toDataURL() : '';
  });

  // F4.6 降级路径：剪贴板无图片时返回空串（renderer 侧 toast，不 reject）
  ipcMain.handle(IpcChannels.clipboardReadImage, (): string => {
    const img = clipboard.readImage();
    return img.isEmpty() ? '' : img.toDataURL();
  });

  ipcMain.handle(IpcChannels.clipboardWrite, (_event, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.on(IpcChannels.message, (_event, payload: unknown) => {
    getWindow()?.webContents.send(IpcChannels.message, payload);
  });

  registerRecordingHandlers(getWindow);
}
