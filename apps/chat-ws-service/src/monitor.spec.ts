import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  DEPTH_INTERVAL_MS,
  DLQ_CRITICAL,
  startDepthMonitor,
  WORK_CRITICAL,
  WORK_WARNING
} from './monitor';

describe('startDepthMonitor（§4.8 日志级阈值告警）', () => {
  let warn: Mock<(message: string) => void>;
  let stop: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    warn = vi.fn<(message: string) => void>();
  });

  afterEach(() => {
    stop?.();
    stop = null;
    vi.useRealTimers();
  });

  function start(depths: { work: number; dlq: number } | null, intervalMs = DEPTH_INTERVAL_MS) {
    stop = startDepthMonitor({ depths: async () => depths, intervalMs, warn });
    return stop;
  }

  it('dlq=1 → 输出 [ChatWS][DLQ] depth=1（不带 critical）', async () => {
    start({ work: 0, dlq: 1 });
    await vi.advanceTimersByTimeAsync(DEPTH_INTERVAL_MS);
    expect(warn).toHaveBeenCalledWith('[ChatWS][DLQ] depth=1');
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('critical'));
  });

  it('dlq>100 → 追加 level=critical', async () => {
    start({ work: 0, dlq: DLQ_CRITICAL + 1 });
    await vi.advanceTimersByTimeAsync(DEPTH_INTERVAL_MS);
    expect(warn).toHaveBeenCalledWith(`[ChatWS][DLQ] depth=${DLQ_CRITICAL + 1} level=critical`);
  });

  it('work>10000 → [ChatWS][QUEUE] work=N；>100000 → critical', async () => {
    start({ work: WORK_WARNING + 1, dlq: 0 });
    await vi.advanceTimersByTimeAsync(DEPTH_INTERVAL_MS);
    expect(warn).toHaveBeenCalledWith(`[ChatWS][QUEUE] work=${WORK_WARNING + 1}`);

    warn.mockClear();
    stop?.();
    start({ work: WORK_CRITICAL + 1, dlq: 0 });
    await vi.advanceTimersByTimeAsync(DEPTH_INTERVAL_MS);
    expect(warn).toHaveBeenCalledWith(`[ChatWS][QUEUE] work=${WORK_CRITICAL + 1} level=critical`);
  });

  it('双零 → 静默（每轮重复检查不产生噪声）', async () => {
    start({ work: 0, dlq: 0 });
    await vi.advanceTimersByTimeAsync(DEPTH_INTERVAL_MS * 3);
    expect(warn).not.toHaveBeenCalled();
  });

  it('depths 返回 null（consumer 未就绪）→ 静默不抛', async () => {
    start(null);
    await vi.advanceTimersByTimeAsync(DEPTH_INTERVAL_MS);
    expect(warn).not.toHaveBeenCalled();
  });

  it('30s 轮询：持续 >0 每轮重复告警（1min 内必有输出）', async () => {
    start({ work: 0, dlq: 2 }, 30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(warn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('depths 抛错 → depth_check_failed 日志，轮询不中断', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stop = startDepthMonitor({
      depths: async () => {
        throw new Error('mq gone');
      },
      intervalMs: 1000,
      warn
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(errSpy).toHaveBeenCalledWith('[ChatWS][DLQ] depth_check_failed:', 'mq gone');
    await vi.advanceTimersByTimeAsync(1000);
    expect(errSpy).toHaveBeenCalledTimes(2);
    errSpy.mockRestore();
  });

  it('stop 后不再触发', async () => {
    const s = start({ work: 0, dlq: 1 });
    await vi.advanceTimersByTimeAsync(DEPTH_INTERVAL_MS);
    expect(warn).toHaveBeenCalledTimes(1);
    s();
    stop = null;
    await vi.advanceTimersByTimeAsync(DEPTH_INTERVAL_MS * 2);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
