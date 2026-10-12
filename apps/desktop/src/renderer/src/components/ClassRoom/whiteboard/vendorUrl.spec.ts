import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vendorUrl } from './vendorUrl';

/* eslint-disable @typescript-eslint/no-explicit-any */
function stubApi(getUrl?: (rel: string) => Promise<string>) {
  (window as any).electronAPI = getUrl ? { vendorGetUrl: getUrl } : {};
}

beforeEach(() => {
  stubApi();
});

afterEach(() => {
  delete (window as any).electronAPI;
});

describe('vendorUrl（F3.4/F3.5 外挂资源寻址）', () => {
  it('正向：委托 electronAPI.vendorGetUrl 拼出完整 URL', async () => {
    stubApi(async rel => `atom:///app/out/renderer/vendor/${rel}`);
    await expect(vendorUrl('circuitjs/circuitjs.html')).resolves.toBe(
      'atom:///app/out/renderer/vendor/circuitjs/circuitjs.html'
    );
  });

  it('负向：拒绝路径穿越（..）', async () => {
    const spy = vi.fn(async (rel: string) => rel);
    stubApi(spy);
    await expect(vendorUrl('../secrets.txt')).rejects.toThrow('非法');
    await expect(vendorUrl('circuitjs/../../x')).rejects.toThrow('非法');
    expect(spy).not.toHaveBeenCalled();
  });

  it('负向：拒绝绝对路径与反斜杠', async () => {
    await expect(vendorUrl('/etc/passwd')).rejects.toThrow('非法');
    await expect(vendorUrl('c:\\windows\\x')).rejects.toThrow('非法');
  });

  it('负向：preload 未注入 vendorGetUrl 时报错', async () => {
    stubApi();
    await expect(vendorUrl('circuitjs/circuitjs.html')).rejects.toThrow('不可用');
  });
});
