import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectronApi } from '@yunyan-live/ipc';
import { useUpdater } from '@/composables/useUpdater';

const mocks = vi.hoisted(() => ({
  onMessage: vi.fn(),
  checkForUpdate: vi.fn(),
  downloadUpdate: vi.fn(),
  installUpdate: vi.fn(),
  getVersion: vi.fn()
}));

function setup() {
  Object.assign(window, {
    electronAPI: { ...mocks } as unknown as ElectronApi
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setup();
  mocks.getVersion.mockResolvedValue('0.5.0');
  useUpdater().resetUpdater();
});

describe('useUpdater 状态机', () => {
  it('check 触发 IPC 并进入 checking，manual 标记跟随入参', () => {
    const u = useUpdater();
    u.check(true);
    expect(mocks.checkForUpdate).toHaveBeenCalled();
    expect(u.status.value).toBe('checking');
    expect(u.manual.value).toBe(true);

    u.check(false);
    expect(u.manual.value).toBe(false);
  });

  it('update-available 携带版本号；update-not-available 手动回显 latest、后台回到 idle', () => {
    const u = useUpdater();
    u.check(true);
    u.handleUpdateEvent({ type: 'update-available', message: '0.6.0' });
    expect(u.status.value).toBe('available');
    expect(u.latestVersion.value).toBe('0.6.0');

    u.handleUpdateEvent({ type: 'update-not-available' });
    expect(u.status.value).toBe('latest');

    u.resetUpdater();
    u.check(false);
    u.handleUpdateEvent({ type: 'update-not-available' });
    expect(u.status.value).toBe('idle');
  });

  it('download 仅在 available 态触发，download-progress 更新进度', () => {
    const u = useUpdater();
    u.download();
    expect(mocks.downloadUpdate).not.toHaveBeenCalled();

    u.handleUpdateEvent({ type: 'update-available', message: '0.6.0' });
    u.download();
    expect(mocks.downloadUpdate).toHaveBeenCalled();

    u.handleUpdateEvent({ type: 'download-progress', message: 42.3 });
    expect(u.status.value).toBe('downloading');
    expect(u.progress.value).toBe(42);
  });

  it('update-downloaded 进入 downloaded，install 触发 IPC；非 downloaded 态不触发', () => {
    const u = useUpdater();
    u.install();
    expect(mocks.installUpdate).not.toHaveBeenCalled();

    u.handleUpdateEvent({ type: 'update-available', message: '0.6.0' });
    u.handleUpdateEvent({ type: 'update-downloaded', message: '0.6.0' });
    expect(u.status.value).toBe('downloaded');
    expect(u.progress.value).toBe(100);

    u.install();
    expect(mocks.installUpdate).toHaveBeenCalled();
  });

  it('error：手动检查进入 error，后台静默回到 idle；下载中的 error 进入 error', () => {
    const u = useUpdater();
    u.check(true);
    u.handleUpdateEvent({ type: 'error', message: 'net fail' });
    expect(u.status.value).toBe('error');
    expect(u.errorMessage.value).toBe('net fail');

    u.resetUpdater();
    u.check(false);
    u.handleUpdateEvent({ type: 'error', message: 'net fail' });
    expect(u.status.value).toBe('idle');

    u.handleUpdateEvent({ type: 'update-available', message: '0.6.0' });
    u.download();
    u.handleUpdateEvent({ type: 'error', message: 'dl fail' });
    expect(u.status.value).toBe('error');
    expect(u.errorMessage.value).toBe('dl fail');
  });

  it('takeOver 标记手动接管；loadCurrentVersion 读取 app.getVersion', async () => {
    const u = useUpdater();
    u.check(false);
    u.takeOver();
    expect(u.manual.value).toBe(true);

    await u.loadCurrentVersion();
    expect(mocks.getVersion).toHaveBeenCalled();
    expect(u.currentVersion.value).toBe('0.5.0');
  });

  it('bindUpdateEvents 幂等：重复调用只订阅一次', () => {
    const u = useUpdater();
    u.bindUpdateEvents();
    u.bindUpdateEvents();
    expect(mocks.onMessage).toHaveBeenCalledTimes(1);
  });
});
