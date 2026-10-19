import amqp from 'amqplib';
import {
  NOTIFY_EXCHANGE,
  NOTIFY_MAX_RETRY,
  NOTIFY_QUEUE_DLQ,
  NOTIFY_QUEUE_RETRY,
  NOTIFY_QUEUE_WORK,
  NOTIFY_RETRY_TTLS,
  NOTIFY_RK_DLQ,
  NOTIFY_RK_RETRY,
  NOTIFY_RK_WORK,
  normalizeNotifyEvent,
  type NotifyEventInput,
  type NotifyWireEvent
} from '@yunyan-live/nest-shared';
import type { ServiceMetrics } from '@yunyan-live/nest-shared';

/** F9 拓扑（与 chat/audit 隔离的 exchange；重试阶梯 5s/30s/120s 同 audit 口径） */
export async function assertNotifyTopology(ch: amqp.ConfirmChannel): Promise<void> {
  await ch.assertExchange(NOTIFY_EXCHANGE, 'direct', { durable: true });
  await ch.assertQueue(NOTIFY_QUEUE_WORK, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': NOTIFY_EXCHANGE,
      'x-dead-letter-routing-key': NOTIFY_RK_DLQ
    }
  });
  await ch.bindQueue(NOTIFY_QUEUE_WORK, NOTIFY_EXCHANGE, NOTIFY_RK_WORK);
  for (let i = 0; i < 3; i += 1) {
    await ch.assertQueue(NOTIFY_QUEUE_RETRY[i]!, {
      durable: true,
      arguments: {
        'x-message-ttl': NOTIFY_RETRY_TTLS[i],
        'x-dead-letter-exchange': NOTIFY_EXCHANGE,
        'x-dead-letter-routing-key': NOTIFY_RK_WORK
      }
    });
    await ch.bindQueue(NOTIFY_QUEUE_RETRY[i]!, NOTIFY_EXCHANGE, NOTIFY_RK_RETRY[i]!);
  }
  await ch.assertQueue(NOTIFY_QUEUE_DLQ, { durable: true });
  await ch.bindQueue(NOTIFY_QUEUE_DLQ, NOTIFY_EXCHANGE, NOTIFY_RK_DLQ);
}

/** 报文校验：JSON + normalize（kind 白名单/邮箱形/scope）；损坏 → null 走 DLQ。 */
export function parseNotifyEvent(content: Buffer): NotifyWireEvent | null {
  try {
    const parsed: unknown = JSON.parse(content.toString());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return normalizeNotifyEvent(parsed as NotifyEventInput);
  } catch {
    return null;
  }
}

/** 失败路由：x-retry ≥3 → DLQ，否则进第 retry+1 级重试队列（TTL 到期回 work）。 */
export function nextRetryRoute(retryCount: number): { rk: string; nextRetry: number } {
  if (retryCount >= NOTIFY_MAX_RETRY) return { rk: NOTIFY_RK_DLQ, nextRetry: NOTIFY_MAX_RETRY };
  return { rk: NOTIFY_RK_RETRY[retryCount]!, nextRetry: retryCount + 1 };
}

export type NotifySendOutcome = 'sent' | 'skipped_dedupe' | 'skipped_rate';

export interface NotifyConsumerStats {
  sent: number;
  skipped: number;
  failed: number;
}

export interface NotifyConsumerHandle {
  isReady(): boolean;
  stats(): NotifyConsumerStats;
  depths(): Promise<{ work: number; dlq: number } | null>;
  stop(): Promise<void>;
}

export interface NotifyConsumerDeps {
  /** 测试注入；默认 amqp.connect */
  connect?: (url: string) => Promise<amqp.ChannelModel>;
  /** 结果计数钩子（metrics.notifyTotal） */
  onOutcome?: (kind: string, result: 'sent' | NotifySendOutcome | 'failed') => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * F9 通知 consumer（audit consumer 同构骨架：重连退避 1s→30s、confirm+mandatory、
 * stop 取消消费）。逐条投递（无攒批）：成功/频控跳过 → ack；SMTP 失败 → 重试阶梯；
 * 报文损坏 → DLQ 不重试。
 */
export function createNotifyConsumer(
  url: string,
  send: (event: NotifyWireEvent) => Promise<NotifySendOutcome>,
  deps: NotifyConsumerDeps = {}
): NotifyConsumerHandle {
  const connect = deps.connect ?? ((u: string) => amqp.connect(u));
  const onOutcome = deps.onOutcome;

  let conn: amqp.ChannelModel | null = null;
  let channel: amqp.ConfirmChannel | null = null;
  let consumerTag: string | null = null;
  let closed = false;
  let stopping = false;
  let attempt = 0;
  let reconnectTimer: NodeJS.Timeout | null = null;
  const stats: NotifyConsumerStats = { sent: 0, skipped: 0, failed: 0 };

  function log(level: 'error' | 'log', msg: string): void {
    console[level](msg);
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
          NOTIFY_EXCHANGE,
          rk,
          content,
          { persistent: true, mandatory: true, headers },
          err => resolve(!err)
        );
      } catch (err) {
        log('error', `[NotifyMQ] republish_sync_throw rk=${rk}: ${errorMessage(err)}`);
        resolve(false);
      }
    });
  }

  function ack(ch: amqp.ConfirmChannel, msg: amqp.ConsumeMessage): void {
    try {
      ch.ack(msg);
    } catch (err) {
      log('error', `[NotifyMQ] ack_failed: ${errorMessage(err)}`);
    }
  }

  function nackRequeue(ch: amqp.ConfirmChannel, msg: amqp.ConsumeMessage): void {
    try {
      ch.nack(msg, false, true);
    } catch (err) {
      log('error', `[NotifyMQ] nack_failed: ${errorMessage(err)}`);
    }
  }

  async function handle(ch: amqp.ConfirmChannel, msg: amqp.ConsumeMessage, event: NotifyWireEvent) {
    try {
      const outcome = await send(event);
      if (outcome === 'sent') stats.sent += 1;
      else stats.skipped += 1;
      onOutcome?.(event.kind, outcome);
      ack(ch, msg);
    } catch (err) {
      stats.failed += 1;
      onOutcome?.(event.kind, 'failed');
      const retry = Number(msg.properties.headers?.['x-retry'] ?? 0) || 0;
      const route = nextRetryRoute(retry);
      log(
        'error',
        `[NotifyMQ] send_failed kind=${event.kind} retry=${retry}: ${errorMessage(err)}`
      );
      const ok = await publishConfirm(ch, msg.content, route.rk, {
        ...(msg.properties.headers ?? {}),
        'x-retry': route.nextRetry
      });
      if (ok) ack(ch, msg);
      else nackRequeue(ch, msg);
    }
  }

  function onDelivery(msg: amqp.ConsumeMessage | null): void {
    if (!msg || !channel) return;
    const ch = channel;
    const event = parseNotifyEvent(msg.content);
    if (!event) {
      // 报文损坏/校验失败 → 原样进 DLQ，不参与重试（audit 同口径）
      void publishConfirm(ch, msg.content, NOTIFY_RK_DLQ, {
        'x-retry': NOTIFY_MAX_RETRY
      }).then(ok => {
        if (ok) ack(ch, msg);
      });
      return;
    }
    void handle(ch, msg, event);
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
        log('error', `[NotifyMQ] consumer connection error: ${errorMessage(err)}`);
      });
      c.on('close', () => {
        if (closed) return;
        log('error', '[NotifyMQ] consumer state=disconnected');
        channel = null;
        conn = null;
        consumerTag = null;
        scheduleReconnect();
      });
      const ch = await c.createConfirmChannel();
      ch.on('error', (err: unknown) => {
        log('error', `[NotifyMQ] consumer channel error: ${errorMessage(err)}`);
      });
      await assertNotifyTopology(ch);
      await ch.prefetch(5);
      conn = c;
      channel = ch;
      attempt = 0;
      const reply = await ch.consume(NOTIFY_QUEUE_WORK, m => onDelivery(m), { noAck: false });
      consumerTag = reply.consumerTag;
      log('log', '[NotifyMQ] consumer state=connected');
    } catch (err) {
      log('error', `[NotifyMQ] consumer state=connect_failed: ${errorMessage(err)}`);
      scheduleReconnect();
    }
  }

  void start();

  return {
    isReady: () => channel !== null && consumerTag !== null,
    stats: () => ({ ...stats }),
    async depths() {
      const ch = channel;
      if (!ch) return null;
      try {
        const work = await ch.checkQueue(NOTIFY_QUEUE_WORK);
        const dlq = await ch.checkQueue(NOTIFY_QUEUE_DLQ);
        return { work: work.messageCount, dlq: dlq.messageCount };
      } catch {
        return null;
      }
    },
    async stop() {
      stopping = true;
      closed = true;
      const ch = channel;
      const tag = consumerTag;
      channel = null;
      consumerTag = null;
      if (ch && tag) {
        try {
          await ch.cancel(tag);
        } catch (err) {
          log('error', `[NotifyMQ] consumer cancel failed: ${errorMessage(err)}`);
        }
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      const c = conn;
      conn = null;
      if (c) {
        try {
          await c.close();
        } catch (err) {
          log('error', `[NotifyMQ] consumer close failed: ${errorMessage(err)}`);
        }
      }
    }
  };
}

/** main.ts 接线（与 live-service startAuditConsumer 同构）：缺 RABBITMQ_URL 不启动。 */
export function startNotifyConsumer(
  metrics: ServiceMetrics,
  send: (event: NotifyWireEvent) => Promise<NotifySendOutcome>
): void {
  const url = process.env.RABBITMQ_URL || '';
  if (!url) {
    console.log('[NotifyMQ] RABBITMQ_URL not set — notify consumer disabled');
    return;
  }
  const consumer = createNotifyConsumer(url, send, {
    onOutcome: (kind, result) => metrics.notifyTotal.inc({ kind, result })
  });
  const poller = setInterval(() => {
    void consumer.depths().then(depths => {
      if (!depths) return;
      metrics.notifyQueueDepth.set({ queue: 'work' }, depths.work);
      metrics.notifyQueueDepth.set({ queue: 'dlq' }, depths.dlq);
      if (depths.dlq > 0) {
        console.error(`[NotifyMQ] dlq_depth=${depths.dlq}`);
      }
    });
  }, 30_000);
  poller.unref?.();
  process.once('SIGTERM', () => {
    clearInterval(poller);
    void consumer.stop();
  });
}
