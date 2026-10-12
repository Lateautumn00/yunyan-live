import { ipcMain } from 'electron';
import { join } from 'node:path';
import { IpcChannels } from '@yunyan-live/ipc';
import { PROTOCOL_SCHEME } from './constants';

// vendor 相对路径白名单校验：仅允许 [\w./-] 且禁止 .. 段与前导斜杠（防路径穿越）
const SAFE_REL = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[\w./-]+$/;

export function resolveVendorUrl(relPath: string): string {
  if (!SAFE_REL.test(relPath)) {
    throw new Error(`非法 vendor 路径: ${relPath}`);
  }
  // dev：Vite 以 public 目录在 renderer origin 下直接服务 /vendor/*
  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  if (rendererUrl) {
    return `${rendererUrl.replace(/\/$/, '')}/vendor/${relPath}`;
  }
  // prod：renderer 构建产物在 out/renderer/vendor，经 privileged atom:// 加载（子资源 fetch 可用）
  const abs = join(__dirname, '../renderer/vendor', relPath).replaceAll('\\', '/');
  return `${PROTOCOL_SCHEME}://${abs}`;
}

export function registerVendorHandlers(): void {
  ipcMain.handle(IpcChannels.vendorGetUrl, (_event, relPath: string) => {
    return resolveVendorUrl(relPath);
  });
}
