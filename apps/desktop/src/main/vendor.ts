import { ipcMain, net, protocol } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { IpcChannels } from '@yunyan-live/ipc';
import { PROTOCOL_SCHEME } from './constants';

// vendor 相对路径白名单校验：仅允许 [\w./-] 且禁止 .. 段与前导斜杠（防路径穿越）
const SAFE_REL = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[\w./-]+$/;

export function isSafeVendorRel(relPath: string): boolean {
  return SAFE_REL.test(relPath);
}

export function resolveVendorUrl(relPath: string): string {
  if (!SAFE_REL.test(relPath)) {
    throw new Error(`非法 vendor 路径: ${relPath}`);
  }
  // dev：Vite 以 public 目录在 renderer origin 下直接服务 /vendor/*
  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  if (rendererUrl) {
    return `${rendererUrl.replace(/\/$/, '')}/vendor/${relPath}`;
  }
  // prod：虚拟 host + 相对路径，绝对路径由主进程 protocol.handle 内部解析。
  // 不得把绝对路径拼进 URL：Windows 盘符冒号会被 WHATWG URL 规范化吞掉
  // （atom://C:/x → host=C 端口空 → 路径错乱，iframe 白屏）。
  return `${PROTOCOL_SCHEME}://vendor/${relPath}`;
}

export function registerVendorHandlers(): void {
  ipcMain.handle(IpcChannels.vendorGetUrl, (_event, relPath: string) => {
    return resolveVendorUrl(relPath);
  });
}

// atom:// 协议统一入口：vendor（renderer/vendor 相对资源）与 recording（本地录像绝对路径）。
// protocol.handle 收 fetch API Request，回 net.fetch(pathToFileURL)，
// 天然支持子资源、Range（视频拖动）与 asar 内路径。
export function registerAtomProtocolHandler(): void {
  const vendorRoot = join(__dirname, '../renderer/vendor');
  protocol.handle(PROTOCOL_SCHEME, request => {
    const url = new URL(request.url);
    if (url.hostname === 'vendor') {
      const relPath = decodeURIComponent(url.pathname).replace(/^\//, '');
      if (!isSafeVendorRel(relPath)) {
        return Promise.resolve(new Response('Forbidden', { status: 403 }));
      }
      return net.fetch(pathToFileURL(join(vendorRoot, relPath)).toString());
    }
    if (url.hostname === 'recording') {
      let filePath = decodeURIComponent(url.pathname);
      // Windows 盘符路径经 URL 解析后形如 /C:/...，去掉前导斜杠还原
      if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(filePath)) {
        filePath = filePath.slice(1);
      }
      return net.fetch(pathToFileURL(filePath).toString());
    }
    return Promise.resolve(new Response('Not Found', { status: 404 }));
  });
}
