import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIT_BATCH_MAX,
  AUDIT_MAX_RETRY,
  AUDIT_QUEUE_DLQ,
  AUDIT_QUEUE_RETRY,
  AUDIT_QUEUE_WORK,
  AUDIT_RK_RETRY,
  assertAuditTopology,
  auditRowParams,
  buildAuditInsertSql,
  createAuditConsumer,
  isAuditPoisonCode,
  parseWireEvent,
  type AuditConsumerDeps,
  type AuditQueryable
} from './consumer';
import {
  AUDIT_EXCHANGE,
  AUDIT_RK_DLQ,
  AUDIT_RK_WORK,
  type AuditWireEvent
} from '@yunyan-live/nest-shared';

function makeEvent(overrides: Partial<AuditWireEvent> = {}): AuditWireEvent {
  return {
    eventId: '00000000-0000-4000-8000-000000000001',
    occurredAtMs: 1770000000000,
    actor: 'u1',
    action: 'auth.login.ok',
    targetType: 'user',
    targetId: 'u1',
    requestId: 'r1',
    ip: '10.0.0.1',
    detail: { reason: 'ok' },
    ...overrides
  };
}

describe('buildAuditInsertSql / auditRowParams（S12 幂等批插）', () => {
  it('列序 + 无目标 ON CONFLICT（event_id 幂等，分区键转换兼容）', () => {
    const sql = buildAuditInsertSql(1);
    expect(sql).toContain(
      'INSERT INTO audit_logs (event_id, occurred_at, actor, action, target_type, target_id, request_id, ip, detail)'
    );
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(sql).toContain('to_timestamp($2::double precision / 1000)');
    expect(sql).not.toContain('ON CONFLICT (');
  });

  it('多行参数基址按 9 递增', () => {
    const sql = buildAuditInsertSql(3);
    expect(sql).toContain('$27::jsonb');
    const params = [
      ...auditRowParams(makeEvent()),
      ...auditRowParams(makeEvent()),
      ...auditRowParams(makeEvent())
    ];
    expect(params).toHaveLength(27);
  });

  it('detail 序列化为 JSON 字符串，空值落 null', () => {
    const params = auditRowParams(makeEvent({ targetType: null, detail: {} }));
    expect(params[4]).toBeNull();
    expect(params[8]).toBe('{}');
  });
});

describe('parseWireEvent', () => {
  it('合法报文回填可选字段为 null/{}', () => {
    const buf = Buffer.from(JSON.stringify(makeEvent({ targetType: undefined })));
    const parsed = parseWireEvent(buf);
    expect(parsed?.targetType).toBeNull();
    expect(parsed?.action).toBe('auth.login.ok');
  });

  it('缺 actor/action/eventId/occurredAtMs → null', () => {
    expect(parseWireEvent(Buffer.from('{"action":"x"}'))).toBeNull();
    expect(parseWireEvent(Buffer.from('{"eventId":"e"}'))).toBeNull();
    expect(parseWireEvent(Buffer.from('{"eventId":"e","actor":"a","action":"x"}'))).toBeNull();
    expect(parseWireEvent(Buffer.from('not json'))).toBeNull();
    expect(parseWireEvent(Buffer.from('[1,2]'))).toBeNull();
  });

  it('detail 非对象收敛为 {}', () => {
    const buf = Buffer.from(
      JSON.stringify(makeEvent({ detail: 'nope' as unknown as Record<string, unknown> }))
    );
    expect(parseWireEvent(buf)?.detail).toEqual({});
  });
});

describe('isAuditPoisonCode', () => {
  it('22xxx/23xxx 毒行，其余瞬时', () => {
    expect(isAuditPoisonCode('22003')).toBe(true);
    expect(isAuditPoisonCode('23505')).toBe(true);
    expect(isAuditPoisonCode('40001')).toBe(false);
    expect(isAuditPoisonCode('57014')).toBe(false);
  });
});

type ConsumeCb = (msg: unknown) => void;
type PublishCall = {
  exchange: string;
  rk: string;
  content: Buffer;
  opts: { headers?: Record<string, unknown> };
  cb?: (err?: Error | null) => void;
};

class FakeChannel {
  handlers = new Map<string, (...args: unknown[]) => void>();
  queueAsserts: Array<{ queue: string; opts: Record<string, unknown> }> = [];
  binds: Array<{ queue: string; exchange: string; rk: string }> = [];
  consumeCb: ConsumeCb | null = null;
  consumed: { queue: string; opts: Record<string, unknown> } | null = null;
  acked: Array<{ tag: number; multiple: boolean }> = [];
  nacked: Array<{ tag: number; all: boolean; requeue: boolean }> = [];
  cancels: string[] = [];
  publishes: PublishCall[] = [];
  prefetchN = -1;
  confirmError: Error | null = null;

  on(event: string, fn: (...args: unknown[]) => void) {
    this.handlers.set(event, fn);
    return this;
  }
  assertExchange = vi.fn(async () => ({}));
  assertQueue = vi.fn(async (queue: string, opts: Record<string, unknown>) => {
    this.queueAsserts.push({ queue, opts });
    return { queue, messageCount: 0, consumerCount: 0 };
  });
  bindQueue = vi.fn(async (queue: string, exchange: string, rk: string) => {
    this.binds.push({ queue, exchange, rk });
    return {};
  });
  prefetch = vi.fn(async (n: number) => {
    this.prefetchN = n;
    return {};
  });
  consume = vi.fn(async (queue: string, cb: ConsumeCb, opts: Record<string, unknown>) => {
    this.consumeCb = cb;
    this.consumed = { queue, opts };
    return { consumerTag: 'tag-1' };
  });
  cancel = vi.fn(async (tag: string) => {
    this.cancels.push(tag);
    return {};
  });
  checkQueue = vi.fn(async (queue: string) => ({ queue, messageCount: 7, consumerCount: 1 }));
  ack = vi.fn((msg: { fields: { deliveryTag: number } }, all?: boolean) => {
    this.acked.push({ tag: msg.fields.deliveryTag, multiple: all === true });
  });
  nack = vi.fn((msg: { fields: { deliveryTag: number } }, all?: boolean, requeue?: boolean) => {
    this.nacked.push({ tag: msg.fields.deliveryTag, all: all === true, requeue: requeue === true });
  });
  publish = vi.fn(
    (
      exchange: string,
      rk: string,
      content: Buffer,
      opts: PublishCall['opts'],
      cb?: (err?: Error | null) => void
    ) => {
      this.publishes.push({ exchange, rk, content, opts, cb });
      cb?.(this.confirmError);
      return true;
    }
  );
}

class FakeConn {
  channel = new FakeChannel();
  handlers = new Map<string, (...args: unknown[]) => void>();
  on(event: string, fn: (...args: unknown[]) => void) {
    this.handlers.set(event, fn);
    return this;
  }
  async createConfirmChannel() {
    return this.channel;
  }
  close = vi.fn(async () => undefined);
}

function delivery(
  tag: number,
  event: Partial<AuditWireEvent> | string,
  headers: Record<string, unknown> = {}
) {
  const content = typeof event === 'string' ? event : JSON.stringify({ ...makeEvent(), ...event });
  return {
    fields: { deliveryTag: tag },
    properties: { headers },
    content: Buffer.from(content)
  };
}

describe('assertAuditTopology（与 chat 隔离的 exchange + 重试阶梯）', () => {
  it('work/retry×3/dlq 五个队列与绑定齐全，work 带死信参数', async () => {
    const ch = new FakeChannel();
    await assertAuditTopology(ch as never);
    expect(ch.queueAsserts.map(q => q.queue)).toEqual([
      AUDIT_QUEUE_WORK,
      ...AUDIT_QUEUE_RETRY,
      AUDIT_QUEUE_DLQ
    ]);
    expect(ch.binds).toContainEqual({
      queue: AUDIT_QUEUE_WORK,
      exchange: AUDIT_EXCHANGE,
      rk: AUDIT_RK_WORK
    });
    for (let i = 0; i < 3; i += 1) {
      expect(ch.binds).toContainEqual({
        queue: AUDIT_QUEUE_RETRY[i],
        exchange: AUDIT_EXCHANGE,
        rk: AUDIT_RK_RETRY[i]
      });
    }
    expect(ch.binds).toContainEqual({
      queue: AUDIT_QUEUE_DLQ,
      exchange: AUDIT_EXCHANGE,
      rk: AUDIT_RK_DLQ
    });
    expect(ch.queueAsserts[0]?.opts).toMatchObject({
      arguments: { 'x-dead-letter-routing-key': AUDIT_RK_DLQ }
    });
  });
});

describe('createAuditConsumer（攒批/失败分流/DLQ）', () => {
  let conn: FakeConn;
  let db: { query: ReturnType<typeof vi.fn> };
  let handle: ReturnType<typeof createAuditConsumer>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    conn = new FakeConn();
    db = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) };
  });

  afterEach(async () => {
    await handle.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function start() {
    const connect = vi.fn(async () => conn) as unknown as AuditConsumerDeps['connect'];
    handle = createAuditConsumer('amqp://test', db as unknown as AuditQueryable, { connect });
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.isReady()).toBe(true);
    return conn.channel;
  }

  it('消费 work 队列并 prefetch=batch 上限', async () => {
    const ch = await start();
    expect(ch.consumed?.queue).toBe(AUDIT_QUEUE_WORK);
    expect(ch.prefetchN).toBe(AUDIT_BATCH_MAX);
  });

  it('单条事件窗口 200ms 批插 + multiple ack', async () => {
    const ch = await start();
    ch.consumeCb?.(delivery(1, {}));
    expect(db.query).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO audit_logs');
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(params).toHaveLength(9);
    expect(params[0]).toBe('00000000-0000-4000-8000-000000000001');
    expect(ch.acked).toEqual([{ tag: 1, multiple: true }]);
  });

  it('攒满 100 条立即 flush（不等窗口）', async () => {
    const ch = await start();
    for (let i = 1; i <= AUDIT_BATCH_MAX; i += 1) ch.consumeCb?.(delivery(i, {}));
    await vi.advanceTimersByTimeAsync(0);
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql.split('$27').length).toBeGreaterThan(1);
    expect(params).toHaveLength(AUDIT_BATCH_MAX * 9);
    expect(ch.acked.at(-1)).toEqual({ tag: AUDIT_BATCH_MAX, multiple: true });
  });

  it('毒行（22xxx）逐行隔离进 DLQ（x-retry=MAX）', async () => {
    const ch = await start();
    db.query.mockRejectedValue(Object.assign(new Error('numeric overflow'), { code: '22003' }));
    ch.consumeCb?.(delivery(1, {}));
    await vi.advanceTimersByTimeAsync(200);
    // 首次批插失败 + isolate 逐行复插仍失败 → 判毒
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(ch.publishes).toHaveLength(1);
    expect(ch.publishes[0]?.rk).toBe(AUDIT_RK_DLQ);
    expect(ch.publishes[0]?.opts.headers).toMatchObject({ 'x-retry': AUDIT_MAX_RETRY });
    expect(ch.acked).toEqual([{ tag: 1, multiple: true }]);
  });

  it('瞬时错误按阶梯重投 retry1 + x-retry 递增', async () => {
    const ch = await start();
    db.query.mockRejectedValueOnce(
      Object.assign(new Error('serialization failure'), { code: '40001' })
    );
    ch.consumeCb?.(delivery(1, {}));
    await vi.advanceTimersByTimeAsync(200);
    expect(ch.publishes[0]?.rk).toBe(AUDIT_RK_RETRY[0]);
    expect(ch.publishes[0]?.opts.headers).toMatchObject({ 'x-retry': 1 });
    expect(ch.acked).toEqual([{ tag: 1, multiple: true }]);
  });

  it('报文损坏不重试，直接 DLQ', async () => {
    const ch = await start();
    ch.consumeCb?.(delivery(1, 'not-json'));
    await vi.advanceTimersByTimeAsync(0);
    expect(db.query).not.toHaveBeenCalled();
    expect(ch.publishes).toHaveLength(1);
    expect(ch.publishes[0]?.rk).toBe(AUDIT_RK_DLQ);
    expect(ch.acked).toEqual([{ tag: 1, multiple: true }]);
  });

  it('depths 上报 work/dlq 深度', async () => {
    const ch = await start();
    expect(await handle.depths()).toEqual({ work: 7, dlq: 7 });
    expect(ch.checkQueue).toHaveBeenCalledTimes(2);
  });

  it('stop 取消订阅并关连接', async () => {
    const ch = await start();
    await handle.stop();
    expect(ch.cancels).toEqual(['tag-1']);
    expect(conn.close).toHaveBeenCalled();
    expect(handle.isReady()).toBe(false);
  });
});
