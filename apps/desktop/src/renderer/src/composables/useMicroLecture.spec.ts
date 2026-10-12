import { describe, expect, it, vi } from 'vitest';
import { useMicroLecture, type MicroLectureDeps } from '@/composables/useMicroLecture';

function makeFake(opts?: {
  sources?: { id: string; name: string }[];
  denyMedia?: boolean;
  deferredSave?: boolean;
}) {
  const calls: string[] = [];
  const notifies: Array<{ level: string; message: string }> = [];
  const saves: Array<{
    defaultName: string;
    filters?: { name: string; extensions: string[] }[];
    byteLength: number;
  }> = [];
  let dataHandler: ((e: { data?: Blob }) => void) | null = null;
  let stopHandler: (() => void) | null = null;
  let resolveSave: ((r: { success: boolean; error?: string }) => void) | null = null;
  let trackStops = 0;

  const deps: MicroLectureDeps = {
    getSources: vi.fn(async () => {
      calls.push('getSources');
      return opts?.sources ?? [{ id: 'screen:0', name: '屏幕 1' }];
    }),
    getUserMedia: vi.fn(async () => {
      calls.push('getUserMedia');
      if (opts?.denyMedia) throw new Error('NotAllowedError: 屏幕录制权限被拒绝');
      return { getTracks: () => [{ stop: () => (trackStops += 1) }] };
    }),
    createRecorder: vi.fn((_stream: unknown, o?: Record<string, unknown>) => {
      calls.push(`createRecorder:${String(o?.mimeType ?? '')}`);
      return {
        start: (t?: number) => calls.push(`start:${t}`),
        pause: () => calls.push('pause'),
        resume: () => calls.push('resume'),
        stop: () => calls.push('stop'),
        addEventListener: (type: string, cb: (e?: unknown) => void) => {
          if (type === 'dataavailable') dataHandler = cb as (e: { data?: Blob }) => void;
          if (type === 'stop') stopHandler = cb as () => void;
        }
      };
    }),
    saveBlob: vi.fn(async a => {
      saves.push({
        defaultName: a.defaultName,
        filters: a.filters,
        byteLength: a.buffer.byteLength
      });
      if (opts?.deferredSave) {
        return await new Promise<{ success: boolean; error?: string }>(r => {
          resolveSave = r;
        });
      }
      return { success: true, filePath: 'C:/tmp/micro.webm' };
    }),
    notify: (level, message) => notifies.push({ level, message })
  };

  return {
    calls,
    notifies,
    saves,
    deps,
    trackStops: () => trackStops,
    fireData: () => dataHandler?.({ data: new Blob([new Uint8Array([1, 2, 3])]) }),
    fireStop: () => stopHandler?.(),
    resolveSave: (r: { success: boolean; error?: string } = { success: true }) => resolveSave?.(r)
  };
}

describe('useMicroLecture（F6.5 微课录制状态机）', () => {
  it('正向：开始/暂停/继续/停止状态机与 IPC 序列，保存 filters 显式 webm', async () => {
    const f = makeFake();
    const m = useMicroLecture(f.deps);
    expect(m.state.value).toBe('idle');

    const p = m.start();
    // 同步进入 starting（重复 start 的防抖窗口在首个 await 前即生效）
    expect(m.state.value).toBe('starting');
    expect(await p).toBe(true);
    expect(m.state.value).toBe('recording');

    expect(m.pause()).toBe(true);
    expect(m.state.value).toBe('paused');
    expect(m.resume()).toBe(true);
    expect(m.state.value).toBe('recording');

    expect(await m.stop()).toBe(true);
    // 停止即入 saving：文件未就绪的等待态（save 完成前不回 idle）
    expect(m.state.value).toBe('saving');
    f.fireData();
    f.fireStop();
    await vi.waitFor(() => expect(m.state.value).toBe('idle'));

    expect(f.calls).toEqual([
      'getSources',
      'getUserMedia',
      'createRecorder:video/webm',
      'start:1000',
      'pause',
      'resume',
      'stop'
    ]);
    expect(f.saves).toHaveLength(1);
    expect(f.saves[0]!.filters).toEqual([{ name: 'WebM Video', extensions: ['webm'] }]);
    expect(f.saves[0]!.defaultName.endsWith('.webm')).toBe(true);
    expect(f.saves[0]!.byteLength).toBe(3);
    // 采集轨在停止后释放
    expect(f.trackStops()).toBe(1);
    expect(f.notifies.some(n => n.level === 'success')).toBe(true);
  });

  it('负向：权限拒绝回 idle 并提示；重复启动防抖（采集只取一次源）', async () => {
    const f = makeFake({ denyMedia: true });
    const m = useMicroLecture(f.deps);
    expect(await m.start()).toBe(false);
    expect(m.state.value).toBe('idle');
    expect(m.errorMessage.value).toContain('权限');
    expect(f.notifies.some(n => n.level === 'error')).toBe(true);

    // 防抖：starting 态重复 start 直接拒绝，源只取一次
    const f2 = makeFake();
    const m2 = useMicroLecture(f2.deps);
    const first = m2.start();
    const second = await m2.start();
    expect(second).toBe(false);
    await first;
    expect(m2.state.value).toBe('recording');
    expect(f2.calls.filter(c => c === 'getSources')).toHaveLength(1);

    await m2.stop();
    f2.fireData();
    f2.fireStop();
    await vi.waitFor(() => expect(m2.state.value).toBe('idle'));
  });

  it('负向：停止入 saving 等待（保存未就绪停留），落盘后才回 idle', async () => {
    const f = makeFake({ deferredSave: true });
    const m = useMicroLecture(f.deps);
    await m.start();
    await m.stop();
    expect(m.state.value).toBe('saving');
    f.fireData();
    f.fireStop();
    await new Promise(r => setTimeout(r, 0));
    // 保存 promise 未 resolve → 一直停在等待态
    expect(m.state.value).toBe('saving');
    expect(f.saves).toHaveLength(1);

    f.resolveSave({ success: false, error: '用户取消了保存' });
    await vi.waitFor(() => expect(m.state.value).toBe('idle'));
    expect(m.errorMessage.value).toBe('用户取消了保存');
  });
});
