import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIT_EXCHANGE,
  AUDIT_RK_WORK,
  MAX_DETAIL_JSON_LENGTH,
  REQUEST_ID_HEADER,
  createAuditPublisher,
  isSensitiveDetailKey,
  normalizeAuditEvent,
  requestIdMiddleware,
  sanitizeAuditDetail,
  type AuditPublisherDeps
} from './index';

describe('sanitizeAuditDetail（S12 detail 白名单漏斗）', () => {
  it('缺省 detail → 空对象', () => {
    expect(sanitizeAuditDetail(undefined)).toEqual({});
  });

  it('allowedKeys 只保留指定顶层键', () => {
    const out = sanitizeAuditDetail({ keep: 1, drop: 2 }, ['keep']);
    expect(out).toEqual({ keep: 1 });
  });

  it('任意深度剥离敏感键（token/密码/验证码/sid），保留中性字段', () => {
    const out = sanitizeAuditDetail({
      reason: 'rejected',
      status: 401,
      token: 't',
      password: 'p',
      oldSid: 'sid-full',
      nested: { accessToken: 'x', smsCode: '123456', ok: 'v' },
      list: [{ inviteCode: 'c', id: 'i' }]
    });
    expect(out).toEqual({
      reason: 'rejected',
      status: 401,
      nested: { ok: 'v' },
      list: [{ id: 'i' }]
    });
    expect(isSensitiveDetailKey('access-token')).toBe(true);
    expect(isSensitiveDetailKey('reason')).toBe(false);
  });

  it('序列化超长收敛为 { _truncated: true }', () => {
    const out = sanitizeAuditDetail({ blob: 'x'.repeat(MAX_DETAIL_JSON_LENGTH) });
    expect(out).toEqual({ _truncated: true });
  });
});

describe('requestIdMiddleware（O7 桥接字段）', () => {
  function harness(headers: Record<string, string | string[] | undefined>) {
    const req = { headers, requestId: undefined as string | undefined };
    const res = { setHeader: vi.fn() };
    let nextCalls = 0;
    requestIdMiddleware(req, res, () => {
      nextCalls += 1;
    });
    return { req, res, nextCalls };
  }

  it('无入站头时生成 uuid 并回写响应头', () => {
    const { req, res, nextCalls } = harness({});
    expect(req.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.requestId);
    expect(nextCalls).toBe(1);
  });

  it('复用入站 x-request-id（去空白 + 64 截断）', () => {
    const { req } = harness({ 'x-request-id': `  ${'a'.repeat(100)}  ` });
    expect(req.requestId).toBe('a'.repeat(64));
  });

  it('数组头取首个元素', () => {
    const { req } = harness({ 'x-request-id': ['first', 'second'] });
    expect(req.requestId).toBe('first');
  });
});

describe('normalizeAuditEvent', () => {
  const base = { actor: 'u1', action: 'auth.login.ok' };

  it('缺必填字段 → null', () => {
    expect(normalizeAuditEvent({ ...base, actor: '' })).toBeNull();
    expect(normalizeAuditEvent({ ...base, action: '' })).toBeNull();
  });

  it('非法 eventId 重生成 uuid，合法保留', () => {
    const regen = normalizeAuditEvent({ ...base, eventId: 'not-a-uuid' });
    expect(regen?.eventId).toMatch(/^[0-9a-f-]{36}$/);
    const keep = '00000000-0000-4000-8000-00000000000a';
    expect(normalizeAuditEvent({ ...base, eventId: keep })?.eventId).toBe(keep);
  });

  it('occurredAtMs 缺省为当前时间，非法值回落', () => {
    const before = Date.now();
    const now = normalizeAuditEvent(base);
    expect(now?.occurredAtMs).toBeGreaterThanOrEqual(before);
    expect(
      normalizeAuditEvent({ ...base, occurredAtMs: Number.NaN })?.occurredAtMs
    ).toBeGreaterThanOrEqual(before);
  });

  it('列宽截断 + detail 过脱敏', () => {
    const out = normalizeAuditEvent({
      ...base,
      actor: 'x'.repeat(200),
      detail: { token: 'leak', reason: 'ok' }
    });
    expect(out?.actor).toHaveLength(100);
    expect(out?.detail).toEqual({ reason: 'ok' });
    expect(out?.targetType).toBeNull();
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

describe('createAuditPublisher（S12：打点永不阻断业务）', () => {
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
    const connect = vi.fn(async () => conn) as unknown as AuditPublisherDeps['connect'];
    const publisher = createAuditPublisher(url, { connect, summaryIntervalMs: 60_000 });
    await vi.advanceTimersByTimeAsync(0);
    return { publisher, channel: conn.channel };
  }

  it('publish 路由到 audit.persist/audit.work，persistent+mandatory', async () => {
    const { publisher, channel } = await start();
    publisher.publish({ actor: 'u1', action: 'auth.login.ok', requestId: 'r1', ip: '10.0.0.1' });
    expect(channel.calls).toHaveLength(1);
    const call = channel.calls[0]!;
    expect(call.exchange).toBe(AUDIT_EXCHANGE);
    expect(call.rk).toBe(AUDIT_RK_WORK);
    expect(call.opts.persistent).toBe(true);
    expect(call.opts.mandatory).toBe(true);
    const body = JSON.parse(call.content.toString());
    expect(body.actor).toBe('u1');
    expect(body.action).toBe('auth.login.ok');
    expect(typeof body.eventId).toBe('string');
    expect(typeof body.occurredAtMs).toBe('number');
    expect(publisher.stats().dropped).toBe(0);
    await publisher.close();
  });

  it('confirm 失败计数丢弃，不抛', async () => {
    const { publisher, channel } = await start();
    channel.confirmError = new Error('nack');
    publisher.publish({ actor: 'u1', action: 'auth.login.ok' });
    expect(publisher.stats().dropped).toBe(1);
    await publisher.close();
  });

  it('空 actor 丢弃（invalid_event）', async () => {
    const { publisher, channel } = await start();
    publisher.publish({ actor: '', action: 'auth.login.ok' });
    expect(publisher.stats().dropped).toBe(1);
    expect(channel.calls).toHaveLength(0);
    await publisher.close();
  });

  it('url 为空 → disabled：恒丢弃 not_configured 且仅告警一次', async () => {
    const { publisher } = await start(null);
    publisher.publish({ actor: 'u1', action: 'auth.login.ok' });
    publisher.publish({ actor: 'u1', action: 'auth.login.ok' });
    publisher.publish({ actor: 'u1', action: 'auth.login.ok' });
    expect(publisher.stats().dropped).toBe(3);
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
    publisher.publish({ actor: 'u1', action: 'auth.login.ok' });
    expect(publisher.stats().dropped).toBe(1);
  });

  it('60s 窗口汇总打印丢弃', async () => {
    const { publisher, channel } = await start();
    channel.confirmError = new Error('nack');
    publisher.publish({ actor: 'u1', action: 'auth.login.ok' });
    vi.advanceTimersByTime(60_000);
    const summary = vi
      .spyOn(console, 'error')
      .mock.calls.filter(args => String(args[0]).includes('publish_failed dropped_total=1'));
    expect(summary).toHaveLength(1);
    await publisher.close();
  });
});
