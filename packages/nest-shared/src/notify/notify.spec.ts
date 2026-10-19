import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_NOTIFY_PAYLOAD_LENGTH,
  NOTIFY_EXCHANGE,
  NOTIFY_KINDS,
  NOTIFY_RK_WORK,
  createNotifyPublisher,
  normalizeNotifyEvent,
  type NotifyEventInput,
  type NotifyPublisherDeps
} from './index';

describe('normalizeNotifyEvent（F9 报文规范化）', () => {
  const base: NotifyEventInput = {
    kind: 'class_reminder',
    to: 'student@example.com',
    scope: 'room-1',
    payload: { title: '数学课', startTime: '2026-10-20T10:00:00.000Z' }
  };

  it('合法输入 → dedupeKey = kind:scope:to，eventId/occurredAtMs 缺省生成', () => {
    const out = normalizeNotifyEvent(base);
    expect(out).not.toBeNull();
    expect(out!.kind).toBe('class_reminder');
    expect(out!.dedupeKey).toBe('class_reminder:room-1:student@example.com');
    expect(typeof out!.eventId).toBe('string');
    expect(typeof out!.occurredAtMs).toBe('number');
    expect(out!.payload).toEqual(base.payload);
  });

  it('非法 kind / 空邮箱 / 缺 scope → null', () => {
    expect(normalizeNotifyEvent({ ...base, kind: 'marketing' as never })).toBeNull();
    expect(normalizeNotifyEvent({ ...base, to: '' })).toBeNull();
    expect(normalizeNotifyEvent({ ...base, to: 'not-an-email' })).toBeNull();
    expect(normalizeNotifyEvent({ ...base, scope: '' })).toBeNull();
  });

  it('三种 kind 白名单全通过', () => {
    for (const kind of NOTIFY_KINDS) {
      expect(normalizeNotifyEvent({ ...base, kind })).not.toBeNull();
    }
  });

  it('payload 超限裁剪为 _truncated；非对象 payload 置空', () => {
    const big = { blob: 'x'.repeat(MAX_NOTIFY_PAYLOAD_LENGTH + 100) };
    expect(normalizeNotifyEvent({ ...base, payload: big })!.payload).toEqual({
      _truncated: true
    });
    expect(normalizeNotifyEvent({ ...base, payload: ['array'] as never })!.payload).toEqual({});
  });

  it('非法 eventId 重生成 uuid，合法保留', () => {
    const good = '8f1a5a4e-0d2e-4f6a-9c8b-1a2b3c4d5e6f';
    expect(normalizeNotifyEvent({ ...base, eventId: good })!.eventId).toBe(good);
    expect(normalizeNotifyEvent({ ...base, eventId: 'nope' })!.eventId).not.toBe('nope');
  });
});

type PublishCall = {
  exchange: string;
  rk: string;
  content: Buffer;
  opts: { persistent?: boolean; mandatory?: boolean };
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

describe('createNotifyPublisher（F9：通知打点永不阻断业务）', () => {
  let conn: FakeConnection;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    conn = new FakeConnection();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function start(url: string | null = 'amqp://test') {
    const connect = vi.fn(async () => conn) as unknown as NotifyPublisherDeps['connect'];
    const publisher = createNotifyPublisher(url, { connect, summaryIntervalMs: 60_000 });
    await vi.advanceTimersByTimeAsync(0);
    return { publisher, channel: conn.channel };
  }

  it('publish 路由到 mail.notify/notify.work，persistent+mandatory', async () => {
    const { publisher, channel } = await start();
    publisher.publish({ kind: 'recording_ready', to: 't@example.com', scope: 'rec-1' });
    expect(channel.calls).toHaveLength(1);
    const call = channel.calls[0]!;
    expect(call.exchange).toBe(NOTIFY_EXCHANGE);
    expect(call.rk).toBe(NOTIFY_RK_WORK);
    expect(call.opts.persistent).toBe(true);
    expect(call.opts.mandatory).toBe(true);
    const body = JSON.parse(call.content.toString());
    expect(body.kind).toBe('recording_ready');
    expect(body.dedupeKey).toBe('recording_ready:rec-1:t@example.com');
    expect(publisher.stats().dropped).toBe(0);
    await publisher.close();
  });

  it('confirm 失败计数丢弃，不抛', async () => {
    const { publisher, channel } = await start();
    channel.confirmError = new Error('nack');
    publisher.publish({ kind: 'checkin_ended', to: 't@example.com', scope: 's1' });
    expect(publisher.stats().dropped).toBe(1);
    await publisher.close();
  });

  it('非法事件丢弃（invalid_event），不发报文', async () => {
    const { publisher, channel } = await start();
    publisher.publish({ kind: 'class_reminder', to: 'bad', scope: 'r1' });
    expect(publisher.stats().dropped).toBe(1);
    expect(channel.calls).toHaveLength(0);
    await publisher.close();
  });

  it('url 为空 → disabled：恒丢弃 not_configured 且仅告警一次', async () => {
    const { publisher } = await start(null);
    publisher.publish({ kind: 'class_reminder', to: 'a@example.com', scope: 'r1' });
    publisher.publish({ kind: 'class_reminder', to: 'a@example.com', scope: 'r1' });
    expect(publisher.stats().dropped).toBe(2);
    expect(publisher.isReady()).toBe(false);
    const warnCalls = vi
      .spyOn(console, 'error')
      .mock.calls.filter(args => String(args[0]).includes('RABBITMQ_URL not set'));
    expect(warnCalls).toHaveLength(1);
    await publisher.close();
  });

  it('close 后 publish 丢弃 closed', async () => {
    const { publisher } = await start();
    await publisher.close();
    publisher.publish({ kind: 'class_reminder', to: 'a@example.com', scope: 'r1' });
    expect(publisher.stats().dropped).toBe(1);
  });

  it('60s 窗口汇总打印丢弃', async () => {
    const { publisher, channel } = await start();
    channel.confirmError = new Error('nack');
    publisher.publish({ kind: 'class_reminder', to: 'a@example.com', scope: 'r1' });
    vi.advanceTimersByTime(60_000);
    const summary = vi
      .spyOn(console, 'error')
      .mock.calls.filter(args => String(args[0]).includes('publish_failed dropped_total=1'));
    expect(summary).toHaveLength(1);
    await publisher.close();
  });
});
