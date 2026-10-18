import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportToolUsage } from './toolUsage';

const track = vi.fn().mockResolvedValue({});
vi.mock('@/api/backstage', () => ({
  default: {
    track_tool_usage: (p: unknown) => track(p)
  }
}));

describe('reportToolUsage（F1 白板埋点，F12 数据源）', () => {
  beforeEach(() => {
    track.mockClear();
    track.mockResolvedValue(undefined);
    vi.useRealTimers();
  });

  it('上报 roomId + tool', () => {
    reportToolUsage('r1', 'mindmap');
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith({ roomId: 'r1', tool: 'mindmap' });
  });

  it('上报失败静默（埋点不阻塞画板）', async () => {
    track.mockRejectedValueOnce(new Error('net down'));
    expect(() => reportToolUsage('r1', 'pen')).not.toThrow();
    await Promise.resolve();
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('同工具 <1s 连点去抖，跨秒/换工具照常上报', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1700000000000);
    reportToolUsage('r1', 'line');
    reportToolUsage('r1', 'line');
    expect(track).toHaveBeenCalledTimes(1);
    vi.setSystemTime(1700000001000);
    reportToolUsage('r1', 'line');
    expect(track).toHaveBeenCalledTimes(2);
    reportToolUsage('r1', 'eraser');
    expect(track).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('空 roomId/tool 直接丢弃', () => {
    reportToolUsage('', 'pen');
    reportToolUsage('r1', '');
    expect(track).not.toHaveBeenCalled();
  });
});
