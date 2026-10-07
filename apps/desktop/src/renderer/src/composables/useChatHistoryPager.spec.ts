import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  HISTORY_TIMEOUT_MS,
  TOP_THRESHOLD_PX,
  useChatHistoryPager,
  type ScrollMetrics
} from './useChatHistoryPager';

type FetchHistory = (cursor: string | null, signal: AbortSignal) => void;

function metrics(overrides: Partial<ScrollMetrics> = {}): ScrollMetrics {
  return { scrollTop: 0, scrollHeight: 900, clientHeight: 400, ...overrides };
}

describe('useChatHistoryPager', () => {
  let fetchHistory: Mock<FetchHistory>;
  let pager: ReturnType<typeof useChatHistoryPager>;

  beforeEach(() => {
    fetchHistory = vi.fn<FetchHistory>();
    pager = useChatHistoryPager({ fetchHistory, timeoutMs: 50 });
  });

  afterEach(() => {
    pager.dispose();
    vi.useRealTimers();
  });

  it('scrollTop=0 且内容溢出 → 发请求（cursor=null 首页）', () => {
    expect(pager.pageRequest(metrics())).toBe(true);
    expect(fetchHistory).toHaveBeenCalledTimes(1);
    expect(fetchHistory).toHaveBeenCalledWith(null, expect.any(AbortSignal));
    expect(pager.loading.value).toBe(true);
  });

  it('scrollTop=31（超阈值）→ 不发', () => {
    expect(pager.pageRequest(metrics({ scrollTop: TOP_THRESHOLD_PX + 1 }))).toBe(false);
    expect(fetchHistory).not.toHaveBeenCalled();
  });

  it('内容不足一屏（scrollHeight<=clientHeight）→ 不发', () => {
    expect(pager.pageRequest(metrics({ scrollHeight: 400, clientHeight: 400 }))).toBe(false);
    expect(pager.pageRequest(metrics({ scrollHeight: 200, clientHeight: 400 }))).toBe(false);
    expect(fetchHistory).not.toHaveBeenCalled();
  });

  it('单飞：5 连滚恰 1 请求', () => {
    for (let i = 0; i < 5; i += 1) pager.pageRequest(metrics());
    expect(fetchHistory).toHaveBeenCalledTimes(1);
  });

  it('响应后 loading 释放，可再次发页且携带新 cursor', () => {
    pager.pageRequest(metrics());
    const got = pager.ingest('historyPage', {
      messages: [{ msgId: 'a' }],
      nextCursor: '1770000000000|42'
    });
    expect(got?.messages).toHaveLength(1);
    expect(pager.loading.value).toBe(false);
    expect(pager.hasMore.value).toBe(true);
    pager.pageRequest(metrics());
    expect(fetchHistory).toHaveBeenLastCalledWith('1770000000000|42', expect.any(AbortSignal));
  });

  it('乱序/迟到响应（非请求期的 historyPage）→ 丢弃不回载荷（不重复 prepend）', () => {
    pager.pageRequest(metrics());
    pager.ingest('historyPage', { messages: [{ msgId: 'a' }], nextCursor: 'c1' });
    const late = pager.ingest('historyPage', { messages: [{ msgId: 'a' }], nextCursor: 'c1' });
    expect(late).toBeNull();
  });

  it('nextCursor:null → hasMore=false 终止翻页', () => {
    pager.pageRequest(metrics());
    pager.ingest('historyPage', { messages: [], nextCursor: null });
    expect(pager.hasMore.value).toBe(false);
    expect(pager.pageRequest(metrics())).toBe(false);
    expect(fetchHistory).toHaveBeenCalledTimes(1);
  });

  it('进场 history 帧（非请求期）→ 接受并初始化游标', () => {
    const got = pager.ingest('history', {
      messages: [{ msgId: 'x' }, { msgId: 'y' }],
      nextCursor: 'c9'
    });
    expect(got?.messages).toHaveLength(2);
    expect(pager.nextCursor.value).toBe('c9');
    expect(pager.hasMore.value).toBe(true);
  });

  it('畸形帧不 crash、不伪造"到底"：缺 messages / null / 非对象', () => {
    pager.pageRequest(metrics());
    expect(pager.ingest('historyPage', { nextCursor: null })).toBeNull();
    expect(pager.hasMore.value).toBe(true); // 不伪造终态
    expect(pager.loading.value).toBe(false); // 请求态已清，可重试

    pager.pageRequest(metrics());
    expect(pager.ingest('historyPage', { messages: null })).toBeNull();
    expect(pager.hasMore.value).toBe(true);

    expect(pager.ingest('historyPage', undefined)).toBeNull();
    expect(pager.ingest('historyPage', 'garbage')).toBeNull();
    expect(pager.hasMore.value).toBe(true);
  });

  it('historyError 终态 reason → hasMore=false；unavailable → 保持不变可重试', () => {
    pager.ingest('historyError', { reason: 'invalid_cursor' });
    expect(pager.hasMore.value).toBe(false);

    const p2 = useChatHistoryPager({ fetchHistory, timeoutMs: 50 });
    expect(p2.hasMore.value).toBe(true);
    p2.ingest('historyError', { reason: 'persistence_disabled' });
    expect(p2.hasMore.value).toBe(false);
    p2.dispose();

    // unavailable：请求被打断但 hasMore 不变 → 可再触发
    const p3 = useChatHistoryPager({ fetchHistory, timeoutMs: 50 });
    p3.pageRequest(metrics());
    p3.ingest('historyError', { reason: 'unavailable' });
    expect(p3.hasMore.value).toBe(true);
    expect(p3.loading.value).toBe(false);
    expect(p3.pageRequest(metrics())).toBe(true);
    expect(fetchHistory).toHaveBeenCalledTimes(2);
    p3.dispose();
  });

  it('3s 超时（混跑旧服务端无帧）→ hasMore=false、signal aborted、迟到帧被丢弃', () => {
    vi.useFakeTimers();
    let aborted = false;
    const withAbort = vi.fn((_c: string | null, signal: AbortSignal) => {
      signal.addEventListener('abort', () => {
        aborted = true;
      });
    });
    const p = useChatHistoryPager({ fetchHistory: withAbort, timeoutMs: HISTORY_TIMEOUT_MS });
    p.pageRequest(metrics());
    expect(p.loading.value).toBe(true);
    vi.advanceTimersByTime(HISTORY_TIMEOUT_MS);
    expect(aborted).toBe(true);
    expect(p.hasMore.value).toBe(false);
    expect(p.loading.value).toBe(false);
    // 迟到的 page 帧：loading=false → 丢弃
    expect(p.ingest('historyPage', { messages: [{ msgId: 'late' }] })).toBeNull();
    p.dispose();
  });

  it('卸载 dispose：进行中请求 abort，之后 ingest 全部静默（无悬挂 setState）', () => {
    let aborted = false;
    const withAbort = vi.fn((_c: string | null, signal: AbortSignal) => {
      signal.addEventListener('abort', () => {
        aborted = true;
      });
    });
    const p = useChatHistoryPager({ fetchHistory: withAbort, timeoutMs: 10_000 });
    p.pageRequest(metrics());
    p.dispose();
    expect(aborted).toBe(true);
    expect(p.loading.value).toBe(false);
    expect(p.ingest('historyPage', { messages: [{ msgId: 'x' }] })).toBeNull();
    expect(p.ingest('historyError', { reason: 'unavailable' })).toBeNull();
    expect(p.pageRequest(metrics())).toBe(false);
  });

  it('fetchHistory 同步抛（发送失败）→ 释放 loading 不悬挂', () => {
    const p = useChatHistoryPager({
      fetchHistory: () => {
        throw new Error('socket closed');
      },
      timeoutMs: 50
    });
    expect(p.pageRequest(metrics())).toBe(false);
    expect(p.loading.value).toBe(false);
    p.dispose();
  });
});
