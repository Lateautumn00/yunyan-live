import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPublisher,
  EXCHANGE,
  MAX_EXTRA_JSON_LENGTH,
  RK_WORK,
  type PublisherDeps
} from './queue';
import type { PersistRowInput } from './bullet';

function makeRow(overrides: Partial<PersistRowInput> = {}): PersistRowInput {
  return {
    msgId: '00000000-0000-4000-8000-000000000001',
    roomId: 'r1',
    senderId: 'u1',
    senderName: '小明',
    isTeacher: false,
    content: 'hi',
    msgType: 1,
    mentions: null,
    extra: { liveUserId: 'u1' },
    createdAtMs: 1770000000000,
    ...overrides
  };
}

type PublishCall = {
  exchange: string;
  rk: string;
  content: Buffer;
  opts: { persistent?: boolean; mandatory?: boolean; headers?: Record<string, unknown> };
  cb?: (err?: Error | null) => void;
};

class FakeChannel {
  calls: PublishCall[] = [];
  handlers = new Map<string, (...args: unknown[]) => void>();
  confirmError: Error | null = null;
  publishError: Error | null = null;

  on(event: string, fn: (...args: unknown[]) => void) {
    this.handlers.set(event, fn);
    return this;
  }

  assertExchange = vi.fn(async () => ({}));

  publish(
    exchange: string,
    rk: string,
    content: Buffer,
    opts: PublishCall['opts'],
    cb?: (err?: Error | null) => void
  ) {
    if (this.publishError) throw this.publishError;
    this.calls.push({ exchange, rk, content, opts, cb });
    cb?.(this.confirmError);
    return true;
  }
}

class FakeConnection {
  channel = new FakeChannel();
  handlers = new Map<string, (...args: unknown[]) => void>();
  on(event: string, fn: (...args: unknown[]) => void) {
    this.handlers.set(event, fn);
    return this;
  }
  async createConfirmChannel(): Promise<FakeChannel> {
    return this.channel;
  }
  close = vi.fn(async () => undefined);
}

describe('createPublisher（方案 §4.2 发布契约：永不阻断广播）', () => {
  let conn: FakeConnection;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    conn = new FakeConnection();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function ready(connect?: PublisherDeps['connect']) {
    const deps = {
      connect: connect ?? (vi.fn(async () => conn) as unknown as PublisherDeps['connect']),
      summaryIntervalMs: 100
    };
    const p = createPublisher('amqp://test', deps);
    await vi.advanceTimersByTimeAsync(0);
    return p;
  }

  it('publish → exchange/rk/persistent/mandatory 全对，confirm 成功计数为 0', async () => {
    const p = await ready();
    p.publish(makeRow());
    expect(conn.channel.calls).toHaveLength(1);
    const call = conn.channel.calls[0];
    expect(call.exchange).toBe(EXCHANGE);
    expect(call.rk).toBe(RK_WORK);
    expect(call.opts.persistent).toBe(true);
    expect(call.opts.mandatory).toBe(true);
    expect(p.stats().dropped).toBe(0);
    await p.close();
  });

  it('消息体为 PersistRow 的 JSON，含 msgId 与 extra 结构', async () => {
    const p = await ready();
    p.publish(makeRow());
    const body = JSON.parse(conn.channel.calls[0].content.toString()) as PersistRowInput;
    expect(body.msgId).toBe('00000000-0000-4000-8000-000000000001');
    expect(body.extra).toEqual({ liveUserId: 'u1' });
    await p.close();
  });

  it('confirm 失败 → 仅计数，不同步抛', async () => {
    const p = await ready();
    conn.channel.confirmError = new Error('confirm nack');
    expect(() => p.publish(makeRow())).not.toThrow();
    expect(p.stats().dropped).toBe(1);
    await p.close();
  });

  it('channel.publish 同步 throw → 吞掉并计数（不中断广播）', async () => {
    const p = await ready();
    conn.channel.publishError = new Error('channel closed');
    expect(() => p.publish(makeRow())).not.toThrow();
    expect(p.stats().dropped).toBe(1);
    await p.close();
  });

  it('未连接（connect 未完成）→ 丢弃计数，不抛', async () => {
    const p = createPublisher('amqp://test', { connect: () => new Promise(() => undefined) });
    expect(() => p.publish(makeRow())).not.toThrow();
    expect(p.stats().dropped).toBe(1);
    expect(p.isReady()).toBe(false);
    await p.close();
  });

  it('extra 序列化后超 1024 字符 → 丢弃且不调用 publish', async () => {
    const p = await ready();
    p.publish(makeRow({ extra: { liveUserId: 'x'.repeat(MAX_EXTRA_JSON_LENGTH) } }));
    expect(conn.channel.calls).toHaveLength(0);
    expect(p.stats().dropped).toBe(1);
    await p.close();
  });

  it('extra 含循环引用（序列化抛） → 丢弃不抛', async () => {
    const p = await ready();
    const cyclic: Record<string, unknown> = { liveUserId: 'u1' };
    cyclic.self = cyclic;
    expect(() => p.publish(makeRow({ extra: cyclic as PersistRowInput['extra'] }))).not.toThrow();
    expect(conn.channel.calls).toHaveLength(0);
    expect(p.stats().dropped).toBe(1);
    await p.close();
  });

  it('mandatory return（unroutable 退回）→ returned 计数', async () => {
    const p = await ready();
    const onReturn = conn.channel.handlers.get('return');
    expect(onReturn).toBeDefined();
    onReturn!([]);
    expect(p.stats().returned).toBe(1);
    await p.close();
  });

  it('60s 窗口汇总：首条即打点，窗口到期输出 dropped_total 汇总', async () => {
    const p = await ready();
    conn.channel.confirmError = new Error('nack');
    p.publish(makeRow());
    p.publish(makeRow());
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('publish_failed reason=confirm_failed')
    );
    await vi.advanceTimersByTimeAsync(100); // summaryIntervalMs=100
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('publish_failed dropped_total=2 window=2')
    );
    expect(p.stats().droppedWindow).toBe(0);
    await p.close();
  });

  it('连接失败 → 1s 退避后重连成功（1s→30s 封顶退避）', async () => {
    const connect = vi.fn().mockRejectedValueOnce(new Error('refused')).mockResolvedValue(conn);
    const p = createPublisher('amqp://test', { connect });
    await vi.advanceTimersByTimeAsync(0);
    expect(p.isReady()).toBe(false);
    await vi.advanceTimersByTimeAsync(999);
    expect(connect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(p.isReady()).toBe(true);
    await p.close();
  });

  it('close 后 publish → 丢弃，不再重连', async () => {
    const p = await ready();
    await p.close();
    expect(() => p.publish(makeRow())).not.toThrow();
    expect(p.stats().dropped).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(p.isReady()).toBe(false);
  });

  it('连接 close 事件 → 标记断开并按退避重连（重连成功日志 state=reconnected）', async () => {
    const p = await ready();
    expect(p.isReady()).toBe(true);
    expect(console.log).toHaveBeenCalledWith('[ChatWS][MQ] state=connected');
    conn.handlers.get('close')!();
    expect(p.isReady()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(p.isReady()).toBe(true);
    expect(console.log).toHaveBeenCalledWith('[ChatWS][MQ] state=reconnected');
    await p.close();
  });
});
