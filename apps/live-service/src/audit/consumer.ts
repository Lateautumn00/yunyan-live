import amqp from 'amqplib';
import {
  AUDIT_EXCHANGE,
  AUDIT_RK_DLQ,
  AUDIT_RK_WORK,
  type AuditWireEvent
} from '@yunyan-live/nest-shared';

/** S12 拓扑（与 chat 隔离的 exchange；重试阶梯同 chat 口径 5s/30s/120s） */
export const AUDIT_QUEUE_WORK = 'audit.persist.work';
export const AUDIT_RK_RETRY = ['audit.retry1', 'audit.retry2', 'audit.retry3'] as const;
export const AUDIT_QUEUE_RETRY = [
  'audit.persist.retry1',
  'audit.persist.retry2',
  'audit.persist.retry3'
] as const;
export const AUDIT_QUEUE_DLQ = 'audit.persist.dlq';

/** 攒批参数：100 条或 200ms 固定窗口（自批内第一条起算，非 debounce） */
export const AUDIT_BATCH_MAX = 100;
export const AUDIT_BATCH_WINDOW_MS = 200;
/** x-retry ≥3 → DLQ */
export const AUDIT_MAX_RETRY = 3;

const INSERT_COLUMNS =
  'event_id, occurred_at, actor, action, target_type, target_id, request_id, ip, detail';

/**
 * 幂等批插：event_id 唯一索引 + 无目标 ON CONFLICT（与分区键预留转换兼容，
 * 消费侧不依赖具体冲突目标——迁移 0003 注释口径）。
 */
export function buildAuditInsertSql(rowCount: number): string {
  const values: string[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    const base = i * 9;
    const p = (n: number) => `$${base + n}`;
    values.push(
      `(${p(1)}, to_timestamp(${p(2)}::double precision / 1000), ${p(3)}, ${p(4)}, ` +
        `${p(5)}, ${p(6)}, ${p(7)}, ${p(8)}, ${p(9)}::jsonb)`
    );
  }
  return (
    `INSERT INTO audit_logs (${INSERT_COLUMNS}) VALUES ${values.join(', ')} ` +
    'ON CONFLICT DO NOTHING'
  );
}

export function auditRowParams(event: AuditWireEvent): unknown[] {
  return [
    event.eventId,
    event.occurredAtMs,
    event.actor,
    event.action,
    event.targetType,
    event.targetId,
    event.requestId,
    event.ip,
    JSON.stringify(event.detail ?? {})
  ];
}

/** 报文形状校验：缺必填/类型不符 → null（调用侧走 DLQ，不参与重试）。 */
export function parseWireEvent(content: Buffer): AuditWireEvent | null {
  try {
    const parsed: unknown = JSON.parse(content.toString());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const e = parsed as Partial<AuditWireEvent>;
    if (typeof e.eventId !== 'string' || !e.eventId) return null;
    if (typeof e.actor !== 'string' || !e.actor) return null;
    if (typeof e.action !== 'string' || !e.action) return null;
    if (typeof e.occurredAtMs !== 'number' || !Number.isFinite(e.occurredAtMs)) return null;
    return {
      eventId: e.eventId,
      occurredAtMs: e.occurredAtMs,
      actor: e.actor,
      action: e.action,
      targetType: typeof e.targetType === 'string' ? e.targetType : null,
      targetId: typeof e.targetId === 'string' ? e.targetId : null,
      requestId: typeof e.requestId === 'string' ? e.requestId : null,
      ip: typeof e.ip === 'string' ? e.ip : null,
      detail: e.detail && typeof e.detail === 'object' && !Array.isArray(e.detail) ? e.detail : {}
    };
  } catch {
    return null;
  }
}

/** 拓扑断言（consumer 启动时唯一权威；publisher 只 assert exchange）。 */
export async function assertAuditTopology(ch: amqp.ConfirmChannel): Promise<void> {
  await ch.assertExchange(AUDIT_EXCHANGE, 'direct', { durable: true });
  await ch.assertQueue(AUDIT_QUEUE_WORK, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': AUDIT_EXCHANGE,
      'x-dead-letter-routing-key': AUDIT_RK_DLQ
    }
  });
  await ch.bindQueue(AUDIT_QUEUE_WORK, AUDIT_EXCHANGE, AUDIT_RK_WORK);
  const ttls = [5000, 30000, 120000];
  for (let i = 0; i < 3; i += 1) {
    await ch.assertQueue(AUDIT_QUEUE_RETRY[i], {
      durable: true,
      arguments: {
        'x-message-ttl': ttls[i],
        'x-dead-letter-exchange': AUDIT_EXCHANGE,
        'x-dead-letter-routing-key': AUDIT_RK_WORK
      }
    });
    await ch.bindQueue(AUDIT_QUEUE_RETRY[i], AUDIT_EXCHANGE, AUDIT_RK_RETRY[i]);
  }
  await ch.assertQueue(AUDIT_QUEUE_DLQ, { durable: true });
  await ch.bindQueue(AUDIT_QUEUE_DLQ, AUDIT_EXCHANGE, AUDIT_RK_DLQ);
}

/** 最小查询面（TypeORM DataSource 满足；测试注入伪对象）。 */
export interface AuditQueryable {
  query<T = unknown>(text: string, params?: unknown[]): Promise<T>;
}

export interface AuditDelivery {
  tag: number;
  event: AuditWireEvent;
  headers: Record<string, unknown>;
  content: Buffer;
}

export interface AuditConsumerStats {
  buffered: number;
  flushing: boolean;
  lastRetry: number;
}

export interface AuditConsumerHandle {
  isReady(): boolean;
  stats(): AuditConsumerStats;
  depths(): Promise<{ work: number; dlq: number } | null>;
  stop(): Promise<void>;
}

export interface AuditConsumerDeps {
  connect?: (url: string) => Promise<amqp.ChannelModel>;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function errorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : '';
}

/** 毒行判据：PG 值/约束类错误 22xxx/23xxx → DLQ（与 chat 同口径）。 */
export function isAuditPoisonCode(code: string): boolean {
  return code.startsWith('22') || code.startsWith('23');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createAuditConsumer(
  url: string,
  db: AuditQueryable,
  deps: AuditConsumerDeps = {}
): AuditConsumerHandle {
  const connect = deps.connect ?? ((u: string) => amqp.connect(u));

  let conn: amqp.ChannelModel | null = null;
  let channel: amqp.ConfirmChannel | null = null;
  let consumerTag: string | null = null;
  let closed = false;
  let stopping = false;
  let attempt = 0;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let windowTimer: NodeJS.Timeout | null = null;
  let deadline = 0;
  let flushing = false;
  let lastRetry = 0;
  let buffer: AuditDelivery[] = [];

  const now = () => Date.now();

  function log(level: 'error' | 'log', msg: string): void {
    console[level](msg);
  }

  function scheduleFlush(): void {
    if (windowTimer || flushing || buffer.length === 0) return;
    const wait = Math.max(0, deadline - now());
    windowTimer = setTimeout(() => {
      windowTimer = null;
      void flush();
    }, wait);
    windowTimer.unref?.();
  }

  function publishConfirm(
    ch: amqp.ConfirmChannel,
    content: Buffer,
    rk: string,
    headers: Record<string, unknown>
  ): Promise<boolean> {
    return new Promise(resolve => {
      try {
        ch.publish(
          AUDIT_EXCHANGE,
          rk,
          content,
          { persistent: true, mandatory: true, headers },
          err => resolve(!err)
        );
      } catch (err) {
        log('error', `[AuditMQ] republish_sync_throw rk=${rk}: ${errorMessage(err)}`);
        resolve(false);
      }
    });
  }

  function ack(ch: amqp.ConfirmChannel, batch: AuditDelivery[]): void {
    const last = batch[batch.length - 1];
    if (!last) return;
    try {
      ch.ack({ fields: { deliveryTag: last.tag } } as amqp.Message, true);
    } catch (err) {
      log('error', `[AuditMQ] ack_failed: ${errorMessage(err)}`);
    }
  }

  function nackRequeue(ch: amqp.ConfirmChannel, batch: AuditDelivery[]): void {
    const last = batch[batch.length - 1];
    if (!last) return;
    try {
      ch.nack({ fields: { deliveryTag: last.tag } } as amqp.Message, false, true);
    } catch (err) {
      log('error', `[AuditMQ] nack_failed: ${errorMessage(err)}`);
    }
  }

  /** 逐行重插：好行落库；毒行单独进 DLQ；任一行未安顿 → 整批 requeue（event_id 幂等兜底）。 */
  async function isolatePoison(ch: amqp.ConfirmChannel, batch: AuditDelivery[]): Promise<void> {
    for (const item of batch) {
      try {
        await db.query(buildAuditInsertSql(1), auditRowParams(item.event));
        continue;
      } catch (err) {
        const code = errorCode(err);
        if (isAuditPoisonCode(code)) {
          const ok = await publishConfirm(ch, item.content, AUDIT_RK_DLQ, {
            ...item.headers,
            'x-retry': AUDIT_MAX_RETRY
          });
          if (!ok) {
            nackRequeue(ch, batch);
            return;
          }
          log('error', `[AuditMQ] poison_row event_id=${item.event.eventId} code=${code}`);
          continue;
        }
        log('error', `[AuditMQ] insert_failed retry=${lastRetry} reason=${errorMessage(err)}`);
        nackRequeue(ch, batch);
        return;
      }
    }
    ack(ch, batch);
  }

  /** 瞬时失败：按 x-retry 选级重投（0→5s,1→30s,2→120s,≥3→DLQ），confirm-before-ack。 */
  async function republishBatch(ch: amqp.ConfirmChannel, batch: AuditDelivery[]): Promise<void> {
    for (const item of batch) {
      const r = Number(item.headers['x-retry'] ?? 0) || 0;
      const rk = r >= AUDIT_MAX_RETRY ? AUDIT_RK_DLQ : AUDIT_RK_RETRY[Math.min(r, 2)];
      const ok = await publishConfirm(ch, item.content, rk, {
        ...item.headers,
        'x-retry': r + 1
      });
      if (!ok) {
        nackRequeue(ch, batch);
        return;
      }
    }
    ack(ch, batch);
  }

  async function flush(): Promise<void> {
    if (windowTimer) {
      clearTimeout(windowTimer);
      windowTimer = null;
    }
    if (flushing || buffer.length === 0 || !channel) return;
    flushing = true;
    const batch = buffer;
    buffer = [];
    const ch = channel;
    try {
      await db.query(
        buildAuditInsertSql(batch.length),
        batch.flatMap(item => auditRowParams(item.event))
      );
      ack(ch, batch);
    } catch (err) {
      const code = errorCode(err);
      const first = batch[0];
      lastRetry = first ? Number(first.headers['x-retry'] ?? 0) || 0 : 0;
      if (isAuditPoisonCode(code)) {
        await isolatePoison(ch, batch);
      } else {
        log('error', `[AuditMQ] insert_failed retry=${lastRetry} reason=${errorMessage(err)}`);
        await republishBatch(ch, batch);
      }
    } finally {
      flushing = false;
      if (buffer.length > 0) scheduleFlush();
    }
  }

  function onDelivery(msg: amqp.ConsumeMessage | null): void {
    if (!msg || !channel) return;
    const event = parseWireEvent(msg.content);
    if (!event) {
      // 报文损坏/缺必填 → 原样进 DLQ，不参与重试
      void publishConfirm(channel, msg.content, AUDIT_RK_DLQ, {
        'x-retry': AUDIT_MAX_RETRY
      }).then(ok => {
        if (ok && channel) ack(channel, [{ tag: msg.fields.deliveryTag } as AuditDelivery]);
      });
      return;
    }
    if (buffer.length === 0) deadline = now() + AUDIT_BATCH_WINDOW_MS;
    buffer.push({
      tag: msg.fields.deliveryTag,
      event,
      headers: { ...(msg.properties.headers ?? {}) },
      content: msg.content
    });
    if (buffer.length >= AUDIT_BATCH_MAX) {
      void flush();
    } else {
      scheduleFlush();
    }
  }

  function scheduleReconnect(): void {
    if (closed || reconnectTimer) return;
    const delay = Math.min(30_000, 1000 * 2 ** attempt);
    attempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void start();
    }, delay);
    reconnectTimer.unref?.();
  }

  async function start(): Promise<void> {
    if (closed || stopping) return;
    try {
      const c = await connect(url);
      c.on('error', (err: unknown) => {
        log('error', `[AuditMQ] consumer connection error: ${errorMessage(err)}`);
      });
      c.on('close', () => {
        if (closed) return;
        log('error', '[AuditMQ] consumer state=disconnected');
        channel = null;
        conn = null;
        consumerTag = null;
        buffer = [];
        if (windowTimer) {
          clearTimeout(windowTimer);
          windowTimer = null;
        }
        scheduleReconnect();
      });
      const ch = await c.createConfirmChannel();
      ch.on('error', (err: unknown) => {
        log('error', `[AuditMQ] consumer channel error: ${errorMessage(err)}`);
      });
      await assertAuditTopology(ch);
      await ch.prefetch(AUDIT_BATCH_MAX);
      conn = c;
      channel = ch;
      attempt = 0;
      const reply = await ch.consume(AUDIT_QUEUE_WORK, msg => onDelivery(msg), { noAck: false });
      consumerTag = reply.consumerTag;
      log('log', '[AuditMQ] consumer state=connected');
    } catch (err) {
      log('error', `[AuditMQ] consumer state=connect_failed: ${errorMessage(err)}`);
      scheduleReconnect();
    }
  }

  void start();

  return {
    isReady: () => channel !== null && consumerTag !== null,
    stats: () => ({ buffered: buffer.length, flushing, lastRetry }),
    async depths() {
      const ch = channel;
      if (!ch) return null;
      try {
        const work = await ch.checkQueue(AUDIT_QUEUE_WORK);
        const dlq = await ch.checkQueue(AUDIT_QUEUE_DLQ);
        return { work: work.messageCount, dlq: dlq.messageCount };
      } catch {
        return null;
      }
    },
    async stop() {
      stopping = true;
      closed = true;
      if (windowTimer) {
        clearTimeout(windowTimer);
        windowTimer = null;
      }
      const ch = channel;
      const tag = consumerTag;
      channel = null;
      consumerTag = null;
      if (ch && tag) {
        try {
          await ch.cancel(tag);
        } catch (err) {
          log('error', `[AuditMQ] consumer cancel failed: ${errorMessage(err)}`);
        }
      }
      const giveUp = now() + 15_000;
      while (flushing && now() < giveUp) await sleep(50);
      const c = conn;
      conn = null;
      if (c) {
        try {
          await c.close();
        } catch {
          /* 连接可能已断 */
        }
      }
    }
  };
}
