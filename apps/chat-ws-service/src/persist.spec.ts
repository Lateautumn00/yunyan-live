import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  assertTopology,
  BATCH_MAX,
  buildInsertSql,
  createConsumer,
  QUEUE_DLQ,
  QUEUE_RETRY,
  QUEUE_WORK,
  RK_RETRY,
  rowParams,
  type ConsumerDeps
} from './persist';
import { EXCHANGE, RK_DLQ, RK_WORK } from './queue';
import type { PersistRowInput } from './bullet';

function makeRow(overrides: Partial<PersistRowInput> = {}): PersistRowInput {
  return {
    msgId: `00000000-0000-4000-8000-${String(Math.random()).slice(2).padEnd(12, '0')}`,
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

function delivery(tag: number, row: PersistRowInput, headers: Record<string, unknown> = {}) {
  return {
    fields: { deliveryTag: tag },
    properties: { headers },
    content: Buffer.from(JSON.stringify(row))
  };
}

describe('createConsumer（方案 §4.4 批插与失败分流）', () => {
  let conn: FakeConn;
  let pool: { query: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> };
  let handle: ReturnType<typeof createConsumer>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    conn = new FakeConn();
    pool = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), on: vi.fn() };
  });

  afterEach(async () => {
    await handle.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function start() {
    const connect = vi.fn(async () => conn) as unknown as ConsumerDeps['connect'];
    handle = createConsumer('amqp://test', pool as unknown as Pool, { connect });
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.isReady()).toBe(true);
    return conn.channel;
  }

  it('拓扑断言与方案 §4.2 资源清单逐项一致', async () => {
    const ch = await start();
    expect(ch.assertExchange).toHaveBeenCalledWith(EXCHANGE, 'direct', { durable: true });
    expect(ch.queueAsserts).toEqual([
      {
        queue: QUEUE_WORK,
        opts: {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': EXCHANGE,
            'x-dead-letter-routing-key': RK_DLQ
          }
        }
      },
      {
        queue: QUEUE_RETRY[0],
        opts: {
          durable: true,
          arguments: {
            'x-message-ttl': 5000,
            'x-dead-letter-exchange': EXCHANGE,
            'x-dead-letter-routing-key': RK_WORK
          }
        }
      },
      {
        queue: QUEUE_RETRY[1],
        opts: {
          durable: true,
          arguments: {
            'x-message-ttl': 30000,
            'x-dead-letter-exchange': EXCHANGE,
            'x-dead-letter-routing-key': RK_WORK
          }
        }
      },
      {
        queue: QUEUE_RETRY[2],
        opts: {
          durable: true,
          arguments: {
            'x-message-ttl': 120000,
            'x-dead-letter-exchange': EXCHANGE,
            'x-dead-letter-routing-key': RK_WORK
          }
        }
      },
      { queue: QUEUE_DLQ, opts: { durable: true } }
    ]);
    expect(ch.binds).toEqual([
      { queue: QUEUE_WORK, exchange: EXCHANGE, rk: RK_WORK },
      { queue: QUEUE_RETRY[0], exchange: EXCHANGE, rk: RK_RETRY[0] },
      { queue: QUEUE_RETRY[1], exchange: EXCHANGE, rk: RK_RETRY[1] },
      { queue: QUEUE_RETRY[2], exchange: EXCHANGE, rk: RK_RETRY[2] },
      { queue: QUEUE_DLQ, exchange: EXCHANGE, rk: RK_DLQ }
    ]);
    expect(ch.prefetch).toHaveBeenCalledWith(BATCH_MAX);
    expect(ch.consumed).toEqual({ queue: QUEUE_WORK, opts: { noAck: false } });
  });

  it('单条投递 → 200ms 固定窗口后单次批插，confirm 后 ack(multiple, lastTag)', async () => {
    const ch = await start();
    const row = makeRow();
    ch.consumeCb!(delivery(1, row));
    await vi.advanceTimersByTimeAsync(199);
    expect(pool.query).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toBe(buildInsertSql(1));
    expect(params).toEqual(rowParams(row));
    expect(ch.acked).toEqual([{ tag: 1, multiple: true }]);
  });

  it('攒满 BATCH_MAX 立即插批，不等窗口', async () => {
    const ch = await start();
    for (let i = 1; i <= BATCH_MAX; i += 1)
      ch.consumeCb!(delivery(i, makeRow({ content: `m${i}` })));
    await vi.advanceTimersByTimeAsync(0);
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toBe(buildInsertSql(BATCH_MAX));
    expect(params).toHaveLength(BATCH_MAX * 10);
    expect(ch.acked).toEqual([{ tag: BATCH_MAX, multiple: true }]);
  });

  it('固定窗口自批内第一条起算（非 debounce：第二条不重置窗口）', async () => {
    const ch = await start();
    ch.consumeCb!(delivery(1, makeRow()));
    await vi.advanceTimersByTimeAsync(150);
    ch.consumeCb!(delivery(2, makeRow()));
    await vi.advanceTimersByTimeAsync(49); // 距第一条 199ms
    expect(pool.query).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); // 第一条后 200ms
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(ch.acked).toEqual([{ tag: 2, multiple: true }]);
  });

  it('confirm-before-ack：republish 未收到 confirm 前绝不 ack（C5）', async () => {
    const ch = await start();
    let heldCb: ((err?: Error | null) => void) | undefined;
    ch.publish = vi.fn(
      (
        exchange: string,
        rk: string,
        content: Buffer,
        opts: PublishCall['opts'],
        cb?: (err?: Error | null) => void
      ) => {
        ch.publishes.push({ exchange, rk, content, opts, cb });
        heldCb = cb;
        return true;
      }
    );
    pool.query.mockRejectedValueOnce(
      Object.assign(new Error('conn refused'), { code: 'ECONNREFUSED' })
    );
    ch.consumeCb!(delivery(7, makeRow(), {}));
    await vi.advanceTimersByTimeAsync(200);
    expect(ch.publishes).toHaveLength(1);
    expect(ch.acked).toHaveLength(0); // republish 未 confirm → 绝不 ack
    expect(ch.nacked).toHaveLength(0);
    heldCb?.(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(ch.acked).toEqual([{ tag: 7, multiple: true }]);
  });

  it('瞬时错误 → 按 x-retry 选级重投（0→retry1,1→retry2,2→retry3,≥3→DLQ），confirm 后 ack', async () => {
    const ch = await start();
    const transient = () => {
      pool.query.mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    };

    transient();
    ch.consumeCb!(delivery(1, makeRow(), {}));
    await vi.advanceTimersByTimeAsync(200);
    expect(ch.publishes.at(-1)).toMatchObject({
      exchange: EXCHANGE,
      rk: 'chat.retry1',
      opts: { headers: { 'x-retry': 1 } }
    });

    transient();
    ch.consumeCb!(delivery(2, makeRow(), { 'x-retry': 1 }));
    await vi.advanceTimersByTimeAsync(200);
    expect(ch.publishes.at(-1)).toMatchObject({
      rk: 'chat.retry2',
      opts: { headers: { 'x-retry': 2 } }
    });

    transient();
    ch.consumeCb!(delivery(3, makeRow(), { 'x-retry': 2 }));
    await vi.advanceTimersByTimeAsync(200);
    expect(ch.publishes.at(-1)).toMatchObject({
      rk: 'chat.retry3',
      opts: { headers: { 'x-retry': 3 } }
    });

    transient();
    ch.consumeCb!(delivery(4, makeRow(), { 'x-retry': 3 }));
    await vi.advanceTimersByTimeAsync(200);
    expect(ch.publishes.at(-1)).toMatchObject({
      rk: RK_DLQ,
      opts: { headers: { 'x-retry': 4 } }
    });
    expect(ch.acked).toHaveLength(4);
  });

  it('republish confirm 失败 → nack(tag,false,true) 重投，不 ack', async () => {
    const ch = await start();
    pool.query.mockRejectedValueOnce(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));
    ch.confirmError = new Error('publish nack');
    ch.consumeCb!(delivery(1, makeRow(), {}));
    await vi.advanceTimersByTimeAsync(200);
    expect(ch.acked).toHaveLength(0);
    expect(ch.nacked).toEqual([{ tag: 1, all: false, requeue: true }]);
  });

  it('毒行（22xxx）→ 批插失败后逐行隔离：毒行进 DLQ，好行落库，全批 ack', async () => {
    const ch = await start();
    const poison = makeRow({ msgId: 'poison-1' });
    const good = makeRow({ msgId: 'good-1' });
    // 批插失败（毒行拖累）
    pool.query.mockRejectedValueOnce(Object.assign(new Error('bad escape'), { code: '22P02' }));
    // 隔离逐行：第一行（毒行）仍失败 → 进 DLQ；第二行成功
    pool.query
      .mockRejectedValueOnce(Object.assign(new Error('bad escape'), { code: '22P02' }))
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    ch.consumeCb!(delivery(1, poison, {}));
    ch.consumeCb!(delivery(2, good, {}));
    await vi.advanceTimersByTimeAsync(200);

    expect(pool.query).toHaveBeenCalledTimes(3); // 批 + 两次单行
    expect(pool.query.mock.calls[1][0]).toBe(buildInsertSql(1));
    expect(pool.query.mock.calls[1][1]).toEqual(rowParams(poison));
    expect(ch.publishes.at(-1)).toMatchObject({
      rk: RK_DLQ,
      opts: { headers: { 'x-retry': 3 } }
    });
    expect(ch.acked).toEqual([{ tag: 2, multiple: true }]);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('poison_row msg_id=poison-1 code=22P02')
    );
  });

  it('约束冲突（23xxx）同样按毒行处理', async () => {
    const ch = await start();
    pool.query
      .mockRejectedValueOnce(Object.assign(new Error('fk violation'), { code: '23503' }))
      .mockRejectedValueOnce(Object.assign(new Error('fk violation'), { code: '23503' }))
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    ch.consumeCb!(delivery(1, makeRow(), {}));
    ch.consumeCb!(delivery(2, makeRow(), {}));
    await vi.advanceTimersByTimeAsync(200);
    expect(ch.publishes.at(-1)).toMatchObject({ rk: RK_DLQ });
    expect(ch.acked).toHaveLength(1);
  });

  it('隔离途中遇非毒错误 → 整批 requeue（已插行靠 ON CONFLICT 幂等）', async () => {
    const ch = await start();
    pool.query
      .mockRejectedValueOnce(Object.assign(new Error('x'), { code: '22P02' }))
      .mockRejectedValueOnce(Object.assign(new Error('x'), { code: '22P02' }))
      .mockRejectedValueOnce(Object.assign(new Error('conn dropped'), { code: 'ECONNRESET' }));
    ch.consumeCb!(delivery(1, makeRow(), {}));
    ch.consumeCb!(delivery(2, makeRow(), {}));
    await vi.advanceTimersByTimeAsync(200);
    expect(ch.nacked).toEqual([{ tag: 2, all: false, requeue: true }]);
    expect(ch.acked).toHaveLength(0);
  });

  it('内容体非法 JSON → 原样进 DLQ + ack，不参与重试', async () => {
    const ch = await start();
    ch.consumeCb!({
      fields: { deliveryTag: 1 },
      properties: { headers: {} },
      content: Buffer.from('{broken')
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(ch.publishes.at(-1)).toMatchObject({
      rk: RK_DLQ,
      opts: { headers: { 'x-retry': 3 } }
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(ch.acked).toEqual([{ tag: 1, multiple: true }]);
  });

  it('连接断开 → 清缓冲（陈旧 deliveryTag 不复用）并按退避重连', async () => {
    const ch = await start();
    ch.consumeCb!(delivery(1, makeRow()));
    conn.handlers.get('close')!();
    expect(handle.isReady()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(handle.isReady()).toBe(true);
    expect(pool.query).not.toHaveBeenCalled(); // 断开前缓冲已清，窗口不触发
  });

  it('stop：basicCancel 消费者，未就绪不再重连', async () => {
    const ch = await start();
    await handle.stop();
    expect(ch.cancels).toEqual(['tag-1']);
    expect(handle.isReady()).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(handle.isReady()).toBe(false);
  });

  it('depths：passive 查 work/dlq 深度；未就绪返回 null', async () => {
    const ch = await start();
    expect(await handle.depths()).toEqual({ work: 7, dlq: 7 });
    await handle.stop();
    expect(await handle.depths()).toBeNull();
    expect(ch.checkQueue).toHaveBeenCalledWith(QUEUE_WORK);
    expect(ch.checkQueue).toHaveBeenCalledWith(QUEUE_DLQ);
  });

  it('stats 暴露缓冲与 flush 中状态', async () => {
    const ch = await start();
    ch.consumeCb!(delivery(1, makeRow()));
    expect(handle.stats()).toMatchObject({ buffered: 1, flushing: false });
  });
});

describe('assertTopology 独立导出可复用', () => {
  it('直接对裸通道调用即完成全部断言', async () => {
    const conn = new FakeConn();
    await assertTopology(conn.channel as never);
    expect(conn.channel.queueAsserts).toHaveLength(5);
    expect(conn.channel.binds).toHaveLength(5);
  });
});

describe('insert SQL 构造（单行/批插共用占位符序列）', () => {
  it('批插占位符连续编号且时间列走 to_timestamp 毫秒写', () => {
    const sql = buildInsertSql(3);
    expect(sql).toContain('ON CONFLICT (msg_id) DO NOTHING');
    expect(sql).toContain('$10::double precision / 1000');
    expect(sql).toContain('$30::double precision / 1000');
    expect(sql.match(/\$\d+/g)).toHaveLength(30);
  });

  it('mentions 序列化为 JSON 字符串，null 保持 null', () => {
    const params = rowParams(makeRow({ mentions: [{ userId: 'u2', userName: 'x' }] }));
    expect(params[7]).toBe('[{"userId":"u2","userName":"x"}]');
    expect(rowParams(makeRow({ mentions: null }))[7]).toBeNull();
    expect(rowParams(makeRow({ mentions: null }))[9]).toBe(1770000000000);
  });
});
