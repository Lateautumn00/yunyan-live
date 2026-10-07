import amqp from 'amqplib';
import type { Pool } from 'pg';
import type { PersistRowInput } from './bullet';
import { EXCHANGE, RK_DLQ, RK_WORK } from './queue';

/** 方案 §4.2 资源清单（rk 与队列一一对应） */
export const RK_RETRY = ['chat.retry1', 'chat.retry2', 'chat.retry3'] as const;
export const QUEUE_WORK = 'chat.persist.work';
export const QUEUE_RETRY = [
  'chat.persist.retry1',
  'chat.persist.retry2',
  'chat.persist.retry3'
] as const;
export const QUEUE_DLQ = 'chat.persist.dlq';

/** 攒批参数（方案 §4.4）：100 条或 200ms 固定窗口（自批内第一条起算，非 debounce） */
export const BATCH_MAX = 100;
export const BATCH_WINDOW_MS = 200;
/** x-retry ≥3 → DLQ（唯一计数口径，x-death 仅审计参考） */
export const MAX_RETRY = 3;

const INSERT_COLUMNS =
  'msg_id, room_id, sender_id, sender_name, is_teacher, content, msg_type, mentions, extra, created_at';

export function buildInsertSql(rowCount: number): string {
  const values: string[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    const base = i * 10;
    const p = (n: number) => `$${base + n}`;
    values.push(
      `(${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)}, ${p(8)}, ${p(9)}, to_timestamp(${p(10)}::double precision / 1000))`
    );
  }
  return (
    `INSERT INTO chat_messages (${INSERT_COLUMNS}) VALUES ${values.join(', ')} ` +
    'ON CONFLICT (msg_id) DO NOTHING'
  );
}

export function rowParams(row: PersistRowInput): unknown[] {
  return [
    row.msgId,
    row.roomId,
    row.senderId,
    row.senderName,
    row.isTeacher,
    row.content,
    row.msgType,
    row.mentions === null ? null : JSON.stringify(row.mentions),
    JSON.stringify(row.extra),
    row.createdAtMs
  ];
}

/** 拓扑断言（queue.spec 对照方案 §4.2 表逐项核验） */
export async function assertTopology(ch: amqp.ConfirmChannel): Promise<void> {
  await ch.assertExchange(EXCHANGE, 'direct', { durable: true });
  await ch.assertQueue(QUEUE_WORK, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': EXCHANGE,
      'x-dead-letter-routing-key': RK_DLQ
    }
  });
  await ch.bindQueue(QUEUE_WORK, EXCHANGE, RK_WORK);
  const ttls = [5000, 30000, 120000];
  for (let i = 0; i < 3; i += 1) {
    await ch.assertQueue(QUEUE_RETRY[i], {
      durable: true,
      arguments: {
        'x-message-ttl': ttls[i],
        'x-dead-letter-exchange': EXCHANGE,
        'x-dead-letter-routing-key': RK_WORK
      }
    });
    await ch.bindQueue(QUEUE_RETRY[i], EXCHANGE, RK_RETRY[i]);
  }
  await ch.assertQueue(QUEUE_DLQ, { durable: true });
  await ch.bindQueue(QUEUE_DLQ, EXCHANGE, RK_DLQ);
}

export interface Delivery {
  tag: number;
  row: PersistRowInput;
  headers: Record<string, unknown>;
  content: Buffer;
}

export interface ConsumerStats {
  buffered: number;
  flushing: boolean;
  /** 最近一次批插失败的重试计数（结构化日志用） */
  lastRetry: number;
}

export interface ConsumerHandle {
  isReady(): boolean;
  stats(): ConsumerStats;
  /** passive checkQueue 深度（healthz 用）；未就绪返回 null */
  depths(): Promise<{ work: number; dlq: number } | null>;
  /** basicCancel → 等在途批落库 → 关连接（缓冲未 ack 由 broker 红elivery，幂等兜底） */
  stop(): Promise<void>;
}

export interface ConsumerDeps {
  /** 测试注入；默认 amqp.connect */
  connect?: (url: string) => Promise<amqp.ChannelModel>;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function errorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : '';
}

/** 毒行判据：PG 值/约束类错误 22xxx/23xxx（方案 §4.4 失败分流） */
export function isPoisonCode(code: string): boolean {
  return code.startsWith('22') || code.startsWith('23');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createConsumer(url: string, pool: Pool, deps: ConsumerDeps = {}): ConsumerHandle {
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
  let buffer: Delivery[] = [];

  const now = () => Date.now();

  function log(level: 'error' | 'log', msg: string) {
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

  /** confirm 发布（返回是否收到 confirm；永不 reject） */
  function publishConfirm(
    ch: amqp.ConfirmChannel,
    content: Buffer,
    rk: string,
    headers: Record<string, unknown>
  ): Promise<boolean> {
    return new Promise(resolve => {
      try {
        ch.publish(EXCHANGE, rk, content, { persistent: true, mandatory: true, headers }, err => {
          resolve(!err);
        });
      } catch (err) {
        log('error', `[ChatWS][MQ] republish_sync_throw rk=${rk}: ${errorMessage(err)}`);
        resolve(false);
      }
    });
  }

  function ack(ch: amqp.ConfirmChannel, batch: Delivery[]): void {
    const last = batch[batch.length - 1];
    if (!last) return;
    try {
      ch.ack({ fields: { deliveryTag: last.tag } } as amqp.Message, true);
    } catch (err) {
      log('error', `[ChatWS][MQ] ack_failed: ${errorMessage(err)}`);
    }
  }

  function nackRequeue(ch: amqp.ConfirmChannel, batch: Delivery[]): void {
    const last = batch[batch.length - 1];
    if (!last) return;
    try {
      ch.nack({ fields: { deliveryTag: last.tag } } as amqp.Message, false, true);
    } catch (err) {
      log('error', `[ChatWS][MQ] nack_failed: ${errorMessage(err)}`);
    }
  }

  /** 逐行重插：好行落库；毒行单独进 DLQ（confirm 后才认账）；任一行未安顿 → 整批 requeue（幂等兜底） */
  async function isolatePoison(ch: amqp.ConfirmChannel, batch: Delivery[]): Promise<void> {
    for (const item of batch) {
      try {
        await pool.query(buildInsertSql(1), rowParams(item.row));
        continue;
      } catch (err) {
        const code = errorCode(err);
        if (isPoisonCode(code)) {
          const ok = await publishConfirm(ch, item.content, RK_DLQ, {
            ...item.headers,
            'x-retry': MAX_RETRY
          });
          if (!ok) {
            nackRequeue(ch, batch);
            return;
          }
          log('error', `[ChatWS][PG] poison_row msg_id=${item.row.msgId} code=${code}`);
          continue;
        }
        // 隔离途中遇瞬时错误 → 整批 requeue（已插入行由 ON CONFLICT 幂等跳过）
        log('error', `[ChatWS][PG] insert_failed retry=${lastRetry} reason=${errorMessage(err)}`);
        nackRequeue(ch, batch);
        return;
      }
    }
    ack(ch, batch);
  }

  /** 瞬时失败：按 x-retry 选级重投（0→5s,1→30s,2→120s,≥3→DLQ），confirm-before-ack */
  async function republishBatch(ch: amqp.ConfirmChannel, batch: Delivery[]): Promise<void> {
    for (const item of batch) {
      const r = Number(item.headers['x-retry'] ?? 0) || 0;
      const rk = r >= MAX_RETRY ? RK_DLQ : RK_RETRY[Math.min(r, 2)];
      const ok = await publishConfirm(ch, item.content, rk, { ...item.headers, 'x-retry': r + 1 });
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
      await pool.query(
        buildInsertSql(batch.length),
        batch.flatMap(item => rowParams(item.row))
      );
      ack(ch, batch);
    } catch (err) {
      const code = errorCode(err);
      const first = batch[0];
      lastRetry = first ? Number(first.headers['x-retry'] ?? 0) || 0 : 0;
      if (isPoisonCode(code)) {
        await isolatePoison(ch, batch);
      } else {
        log('error', `[ChatWS][PG] insert_failed retry=${lastRetry} reason=${errorMessage(err)}`);
        await republishBatch(ch, batch);
      }
    } finally {
      flushing = false;
      if (buffer.length > 0) scheduleFlush();
    }
  }

  function onDelivery(msg: amqp.ConsumeMessage | null): void {
    if (!msg || !channel) return;
    let row: PersistRowInput;
    try {
      const parsed = JSON.parse(msg.content.toString()) as PersistRowInput;
      if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
      row = parsed;
    } catch {
      // 队列体损坏（不应发生）→ 原样进 DLQ，不参与重试
      void publishConfirm(channel, msg.content, RK_DLQ, { 'x-retry': MAX_RETRY }).then(ok => {
        if (ok && channel) ack(channel, [{ tag: msg.fields.deliveryTag } as Delivery]);
      });
      return;
    }
    if (buffer.length === 0) deadline = now() + BATCH_WINDOW_MS;
    buffer.push({
      tag: msg.fields.deliveryTag,
      row,
      headers: { ...(msg.properties.headers ?? {}) },
      content: msg.content
    });
    if (buffer.length >= BATCH_MAX) {
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
        log('error', `[ChatWS][PG] consumer connection error: ${errorMessage(err)}`);
      });
      c.on('close', () => {
        if (closed) return;
        log('error', '[ChatWS][MQ] consumer state=disconnected');
        channel = null;
        conn = null;
        consumerTag = null;
        // 连接断开 → 未 ack 消息由 broker 红elivery；丢弃持有陈旧 deliveryTag 的缓冲，避免新通道 ack 未知 tag
        buffer = [];
        if (windowTimer) {
          clearTimeout(windowTimer);
          windowTimer = null;
        }
        scheduleReconnect();
      });
      const ch = await c.createConfirmChannel();
      ch.on('error', (err: unknown) => {
        log('error', `[ChatWS][MQ] consumer channel error: ${errorMessage(err)}`);
      });
      await assertTopology(ch);
      await ch.prefetch(BATCH_MAX);
      conn = c;
      channel = ch;
      attempt = 0;
      const reply = await ch.consume(QUEUE_WORK, msg => onDelivery(msg), { noAck: false });
      consumerTag = reply.consumerTag;
      log('log', '[ChatWS][MQ] consumer state=connected');
    } catch (err) {
      log('error', `[ChatWS][MQ] consumer state=connect_failed: ${errorMessage(err)}`);
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
        const work = await ch.checkQueue(QUEUE_WORK);
        const dlq = await ch.checkQueue(QUEUE_DLQ);
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
          log('error', `[ChatWS][MQ] consumer cancel failed: ${errorMessage(err)}`);
        }
      }
      // 等在途批落库（statement_timeout 5s 上限 + 余量）
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
