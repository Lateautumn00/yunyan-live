import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOTIFY_EXCHANGE,
  NOTIFY_QUEUE_DLQ,
  NOTIFY_QUEUE_WORK,
  NOTIFY_RK_DLQ,
  NOTIFY_RK_RETRY,
  NOTIFY_RK_WORK
} from '@yunyan-live/nest-shared';
import {
  assertNotifyTopology,
  createNotifyConsumer,
  nextRetryRoute,
  parseNotifyEvent,
  type NotifySendOutcome
} from './notify-consumer';

describe('parseNotifyEvent（报文校验 → null 走 DLQ）', () => {
  const valid = {
    eventId: '8f1a5a4e-0d2e-4f6a-9c8b-1a2b3c4d5e6f',
    occurredAtMs: 1760000000000,
    kind: 'recording_ready',
    to: 'teacher@example.com',
    scope: 'rec-1',
    dedupeKey: 'recording_ready:rec-1:teacher@example.com',
    payload: { recordingId: 'abc' }
  };

  it('合法 JSON → 归一化事件', () => {
    const out = parseNotifyEvent(Buffer.from(JSON.stringify(valid)));
    expect(out).not.toBeNull();
    expect(out!.kind).toBe('recording_ready');
    expect(out!.dedupeKey).toBe('recording_ready:rec-1:teacher@example.com');
  });

  it('损坏 JSON / 非对象 / 非法 kind / 非法邮箱 → null', () => {
    expect(parseNotifyEvent(Buffer.from('{oops'))).toBeNull();
    expect(parseNotifyEvent(Buffer.from('"str"'))).toBeNull();
    expect(parseNotifyEvent(Buffer.from('[1,2]'))).toBeNull();
    expect(parseNotifyEvent(Buffer.from(JSON.stringify({ ...valid, kind: 'spam' })))).toBeNull();
    expect(parseNotifyEvent(Buffer.from(JSON.stringify({ ...valid, to: 'x' })))).toBeNull();
  });
});

describe('nextRetryRoute（重试阶梯 5s/30s/120s → DLQ）', () => {
  it('x-retry 0/1/2 → 第 1/2/3 级重试队列，nextRetry +1', () => {
    expect(nextRetryRoute(0)).toEqual({ rk: NOTIFY_RK_RETRY[0], nextRetry: 1 });
    expect(nextRetryRoute(1)).toEqual({ rk: NOTIFY_RK_RETRY[1], nextRetry: 2 });
    expect(nextRetryRoute(2)).toEqual({ rk: NOTIFY_RK_RETRY[2], nextRetry: 3 });
  });

  it('x-retry ≥3 → DLQ', () => {
    expect(nextRetryRoute(3)).toEqual({ rk: NOTIFY_RK_DLQ, nextRetry: 3 });
    expect(nextRetryRoute(9)).toEqual({ rk: NOTIFY_RK_DLQ, nextRetry: 3 });
  });
});

describe('assertNotifyTopology（F9 拓扑与 chat/audit 隔离）', () => {
  it('断言 1 exchange + 5 队列并全部绑定', async () => {
    const bindQueue = vi.fn(async () => undefined);
    const assertExchange = vi.fn(async () => ({}));
    const assertQueue = vi.fn(async () => ({}));
    const ch = { assertExchange, assertQueue, bindQueue } as unknown as Parameters<
      typeof assertNotifyTopology
    >[0];
    await assertNotifyTopology(ch);
    expect(assertExchange).toHaveBeenCalledWith(NOTIFY_EXCHANGE, 'direct', { durable: true });
    expect(assertQueue).toHaveBeenCalledTimes(5);
    expect(assertQueue).toHaveBeenCalledWith(NOTIFY_QUEUE_WORK, expect.anything());
    expect(assertQueue).toHaveBeenCalledWith(NOTIFY_QUEUE_DLQ, { durable: true });
    expect(bindQueue).toHaveBeenCalledTimes(5);
    expect(bindQueue).toHaveBeenCalledWith(NOTIFY_QUEUE_WORK, NOTIFY_EXCHANGE, NOTIFY_RK_WORK);
    expect(bindQueue).toHaveBeenCalledWith(NOTIFY_QUEUE_DLQ, NOTIFY_EXCHANGE, NOTIFY_RK_DLQ);
  });
});

type ConsumeCb = (msg: unknown) => void;
type PublishCall = {
  exchange: string;
  rk: string;
  content: Buffer;
  opts: { persistent?: boolean; mandatory?: boolean; headers?: Record<string, unknown> };
  cb?: (err?: Error | null) => void;
};

class FakeChannel {
  publishes: PublishCall[] = [];
  acks: unknown[] = [];
  nacks: unknown[] = [];
  consumeCb: ConsumeCb | null = null;
  handlers = new Map<string, (...args: unknown[]) => void>();
  on(event: string, fn: (...args: unknown[]) => void) {
    this.handlers.set(event, fn);
    return this;
  }
  assertExchange = vi.fn(async () => ({}));
  assertQueue = vi.fn(async () => ({}));
  bindQueue = vi.fn(async () => undefined);
  prefetch = vi.fn(async () => undefined);
  consume = vi.fn(async (_q: string, cb: ConsumeCb) => {
    this.consumeCb = cb;
    return { consumerTag: 'tag-1' };
  });
  cancel = vi.fn(async () => undefined);
  checkQueue = vi.fn(async () => ({ messageCount: 0, consumerCount: 1 }));
  publish(
    exchange: string,
    rk: string,
    content: Buffer,
    opts: PublishCall['opts'],
    cb?: (err?: Error | null) => void
  ) {
    this.publishes.push({ exchange, rk, content, opts, cb });
    cb?.(null);
    return true;
  }
  ack(msg: unknown) {
    this.acks.push(msg);
  }
  nack(msg: unknown) {
    this.nacks.push(msg);
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

function wireEvent(overrides: Record<string, unknown> = {}) {
  return Buffer.from(
    JSON.stringify({
      eventId: '8f1a5a4e-0d2e-4f6a-9c8b-1a2b3c4d5e6f',
      occurredAtMs: 1760000000000,
      kind: 'checkin_ended',
      to: 'teacher@example.com',
      scope: 'room-1',
      dedupeKey: 'checkin_ended:room-1:teacher@example.com',
      payload: { roomId: 'room-1', signedCount: 12 },
      ...overrides
    })
  );
}

function makeMsg(content: Buffer, headers: Record<string, unknown> = {}) {
  return { content, properties: { headers } } as never;
}

describe('createNotifyConsumer（投递流：ack / 阶梯重试 / 损坏走 DLQ）', () => {
  let conn: FakeConnection;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    conn = new FakeConnection();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function start(send: (e: never) => Promise<NotifySendOutcome>) {
    const outcomes: Array<[string, string]> = [];
    const consumer = createNotifyConsumer('amqp://test', send as never, {
      connect: vi.fn(async () => conn) as never,
      onOutcome: (kind, result) => outcomes.push([kind, result])
    });
    await vi.advanceTimersByTimeAsync(0);
    return { consumer, channel: conn.channel, outcomes };
  }

  it('连接即断言拓扑并消费 work 队列；发送成功 → ack + outcome=sent', async () => {
    const send = vi.fn(async () => 'sent' as const);
    const { consumer, channel, outcomes } = await start(send);
    expect(consumer.isReady()).toBe(true);
    expect(channel.assertQueue).toHaveBeenCalledTimes(5);

    channel.consumeCb!(makeMsg(wireEvent()));
    await vi.advanceTimersByTimeAsync(0);

    expect(send).toHaveBeenCalledTimes(1);
    expect(channel.acks).toHaveLength(1);
    expect(outcomes).toEqual([['checkin_ended', 'sent']]);
    expect(consumer.stats()).toEqual({ sent: 1, skipped: 0, failed: 0 });
    await consumer.stop();
  });

  it('频控/去重跳过 → ack 不重试', async () => {
    const send = vi.fn(async () => 'skipped_rate' as const);
    const { consumer, channel, outcomes } = await start(send);
    channel.consumeCb!(makeMsg(wireEvent()));
    await vi.advanceTimersByTimeAsync(0);
    expect(channel.acks).toHaveLength(1);
    expect(outcomes).toEqual([['checkin_ended', 'skipped_rate']]);
    expect(consumer.stats()).toEqual({ sent: 0, skipped: 1, failed: 0 });
    await consumer.stop();
  });

  it('SMTP 失败（x-retry=0）→ 原文重发 retry1 带 x-retry=1 后 ack，outcome=failed', async () => {
    const send = vi.fn(async () => {
      throw new Error('smtp down');
    });
    const { consumer, channel, outcomes } = await start(send);
    channel.consumeCb!(makeMsg(wireEvent()));
    await vi.advanceTimersByTimeAsync(0);

    expect(channel.publishes).toHaveLength(1);
    const republished = channel.publishes[0]!;
    expect(republished.exchange).toBe(NOTIFY_EXCHANGE);
    expect(republished.rk).toBe(NOTIFY_RK_RETRY[0]);
    expect(republished.opts.persistent).toBe(true);
    expect(republished.opts.mandatory).toBe(true);
    expect(republished.opts.headers?.['x-retry']).toBe(1);
    expect(channel.acks).toHaveLength(1);
    expect(outcomes).toEqual([['checkin_ended', 'failed']]);
    expect(consumer.stats()).toEqual({ sent: 0, skipped: 0, failed: 1 });
    await consumer.stop();
  });

  it('x-retry=3 的失败投递 → DLQ（不进重试队列）', async () => {
    const send = vi.fn(async () => {
      throw new Error('smtp down');
    });
    const { consumer, channel } = await start(send);
    channel.consumeCb!(makeMsg(wireEvent(), { 'x-retry': 3 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(channel.publishes[0]!.rk).toBe(NOTIFY_RK_DLQ);
    expect(channel.acks).toHaveLength(1);
    await consumer.stop();
  });

  it('损坏报文 → 直接 DLQ（x-retry=MAX）且不调用 send', async () => {
    const send = vi.fn(async () => 'sent' as const);
    const { consumer, channel } = await start(send);
    channel.consumeCb!(makeMsg(Buffer.from('{broken')));
    await vi.advanceTimersByTimeAsync(0);
    expect(send).not.toHaveBeenCalled();
    expect(channel.publishes).toHaveLength(1);
    expect(channel.publishes[0]!.rk).toBe(NOTIFY_RK_DLQ);
    expect(channel.publishes[0]!.opts.headers?.['x-retry']).toBe(3);
    expect(channel.acks).toHaveLength(1);
    expect(consumer.stats()).toEqual({ sent: 0, skipped: 0, failed: 0 });
    await consumer.stop();
  });

  it('stop：取消消费并关闭连接，不再重连', async () => {
    const send = vi.fn(async () => 'sent' as const);
    const { consumer, channel } = await start(send);
    await consumer.stop();
    expect(channel.cancel).toHaveBeenCalledWith('tag-1');
    expect(conn.close).toHaveBeenCalled();
    expect(consumer.isReady()).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(channel.consume).toHaveBeenCalledTimes(1);
  });

  it('depths：未连接 → null；已连接 → work/dlq 计数', async () => {
    const send = vi.fn(async () => 'sent' as const);
    const { consumer, channel } = await start(send);
    channel.checkQueue.mockResolvedValueOnce({ messageCount: 7, consumerCount: 1 } as never);
    channel.checkQueue.mockResolvedValueOnce({ messageCount: 1, consumerCount: 0 } as never);
    await expect(consumer.depths()).resolves.toEqual({ work: 7, dlq: 1 });
    await consumer.stop();
  });
});
