import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { IpcChannels, type MediaImportFileArgs } from '@yunyan-live/ipc';

// F5.3：本地媒体导入——渲染端 File.arrayBuffer → 复制入 userData/media。
// 文件名剥路径防穿越，加 uid 前缀避免同名覆盖；失败返回 null（渲染端 toast，不半开放置）
export function registerMediaHandlers(): void {
  ipcMain.handle(
    IpcChannels.mediaImportFile,
    async (_event, data: MediaImportFileArgs): Promise<string | null> => {
      try {
        const base = path.basename(String(data?.name ?? '')).trim();
        if (!base) return null;
        const dir = path.join(app.getPath('userData'), 'media');
        fs.mkdirSync(dir, { recursive: true });
        const id = Math.random().toString(36).slice(2, 10);
        const dest = path.join(dir, `${id}-${base}`);
        fs.writeFileSync(dest, Buffer.from(data.buffer));
        return dest;
      } catch {
        return null;
      }
    }
  );
}
