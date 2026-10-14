import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (...args: unknown[]) => unknown>()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      h.ipcHandlers.set(channel, fn);
    }
  },
  net: { fetch: vi.fn() },
  protocol: { handle: vi.fn() },
  dialog: { showSaveDialog: vi.fn() },
  BrowserWindow: class {}
}));

import { isSafeVendorRel, resolveVendorUrl } from './vendor';
import { registerRecordingHandlers } from './recording';
import { IpcChannels } from '@yunyan-live/ipc';

const originalRendererUrl = process.env['ELECTRON_RENDERER_URL'];
// Node 类型下 process.env 键为只读，测试改 env 走可变别名
const env = process.env as Record<string, string | undefined>;

function setRendererUrl(value: string | undefined): void {
  if (value === undefined) {
    delete env['ELECTRON_RENDERER_URL'];
  } else {
    env['ELECTRON_RENDERER_URL'] = value;
  }
}

beforeEach(() => {
  h.ipcHandlers.clear();
});

afterEach(() => {
  setRendererUrl(originalRendererUrl);
});

describe('resolveVendorUrl（prod 虚拟 host 形态，防 Windows 盘符冒号被 URL 规范化吞掉）', () => {
  it('prod：返回 atom://vendor/<rel>，绝不含绝对路径/盘符', () => {
    setRendererUrl(undefined);
    expect(resolveVendorUrl('circuitjs/circuitjs.html')).toBe(
      'atom://vendor/circuitjs/circuitjs.html'
    );
    // 回归锚点：旧实现把 join(__dirname, ...) 绝对路径拼进 authority，
    // atom://C:/x 在 WHATWG 解析下盘符冒号被当端口吞掉 → 打包态 iframe 白屏
    const url = new URL(resolveVendorUrl('molecule/harness.html'));
    expect(url.hostname).toBe('vendor');
    expect(url.pathname).toBe('/molecule/harness.html');
  });

  it('dev：优先 ELECTRON_RENDERER_URL 拼 /vendor/', () => {
    setRendererUrl('http://localhost:5173');
    expect(resolveVendorUrl('circuitjs/circuitjs.html')).toBe(
      'http://localhost:5173/vendor/circuitjs/circuitjs.html'
    );
  });

  it('路径穿越与非法字符仍被拒绝', () => {
    setRendererUrl(undefined);
    expect(() => resolveVendorUrl('../secrets.txt')).toThrow('非法');
    expect(() => resolveVendorUrl('a/../../b')).toThrow('非法');
    expect(() => resolveVendorUrl('/etc/passwd')).toThrow('非法');
    expect(isSafeVendorRel('circuitjs/circuitjs.html')).toBe(true);
    expect(isSafeVendorRel('c:\\windows\\x')).toBe(false);
  });
});

describe('recordingGetFileUrl（绝对路径进 recording 虚拟 host）', () => {
  it('Windows 反斜杠路径归一为 atom://recording/C:/...', () => {
    registerRecordingHandlers(() => null);
    const fn = h.ipcHandlers.get(IpcChannels.recordingGetFileUrl)!;
    const url = fn(null, 'C:\\Users\\demo\\clip.mp4') as string;
    expect(url).toBe('atom://recording/C:/Users/demo/clip.mp4');
    const parsed = new URL(url);
    expect(parsed.hostname).toBe('recording');
    expect(parsed.pathname).toBe('/C:/Users/demo/clip.mp4');
  });

  it('POSIX 路径保持完整 pathname', () => {
    registerRecordingHandlers(() => null);
    const fn = h.ipcHandlers.get(IpcChannels.recordingGetFileUrl)!;
    const url = fn(null, '/home/code/uploads/a.mp4') as string;
    expect(url).toBe('atom://recording/home/code/uploads/a.mp4');
    expect(new URL(url).pathname).toBe('/home/code/uploads/a.mp4');
  });
});
