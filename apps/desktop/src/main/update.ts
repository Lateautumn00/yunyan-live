import { BrowserWindow, app, ipcMain } from 'electron';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import { IpcChannels, type UpdateMessage } from '@yunyan-live/ipc';

/**
 * 自动更新（确认式）：
 * - feed 地址由 electron-builder 打包时写入 resources/app-update.yml（electron-builder.yml 的
 *   publish.url，唯一真源），运行时不再 setFeedURL；dev 联调放根目录 dev-app-update.yml。
 * - autoDownload=false：渲染端确认后经 downloadUpdate 通道触发下载。
 * - 下载完成不自动重启：渲染端经 installUpdate 通道触发 quitAndInstall；
 *   autoInstallOnAppQuit=true 作为退出应用时的兜底安装。
 */
export function initUpdater(getWindow: () => BrowserWindow | null): void {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  // 未签名构建（无 publisherName）下 electron-updater 6 跳过 Windows 签名校验；
  // 勿在 electron-builder 配置 publisherName，否则缺证书会直接校验失败。

  const send = (type: UpdateMessage, message?: unknown): void => {
    const window = getWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send(IpcChannels.message, { type, message });
    }
  };

  autoUpdater.on('error', error => send('error', String(error)));
  autoUpdater.on('checking-for-update', () => send('checking'));
  autoUpdater.on('update-available', info => send('update-available', info?.version));
  autoUpdater.on('update-not-available', () => send('update-not-available'));
  autoUpdater.on('download-progress', progress => send('download-progress', progress.percent));
  autoUpdater.on('update-downloaded', info => send('update-downloaded', info?.version));

  // 检查失败同时经 'error' 事件上报，promise 拒绝在此吞掉避免重复处理
  ipcMain.on(IpcChannels.checkForUpdate, () => {
    autoUpdater.checkForUpdates().catch(() => undefined);
  });

  ipcMain.handle(IpcChannels.getVersion, (): string => app.getVersion());

  ipcMain.on(IpcChannels.downloadUpdate, () => {
    autoUpdater.downloadUpdate().catch(() => undefined);
  });

  ipcMain.on(IpcChannels.installUpdate, () => {
    setImmediate(() => {
      try {
        autoUpdater.quitAndInstall();
      } catch (error) {
        send('error', String(error));
      }
    });
  });
}
