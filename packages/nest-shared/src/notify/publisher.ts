import amqp from 'amqplib';
import { MAX_NOTIFY_BODY_LENGTH, NOTIFY_EXCHANGE, NOTIFY_RK_WORK } from './constants';
import { normalizeNotifyEvent, type NotifyEventInput } from './event';

/** 60s 汇总日志窗口（与 audit/chat-ws publisher 同口径） */
export const NOTIFY_SUMMARY_INTERVAL_MS = 60_000;

export interface NotifyPublisherStats {
  /** 累计丢弃（未配置 / confirm 失败 / 同步 throw / 通道未就绪 / 校验失败 / 超长） */
  dropped: number;
  droppedWindow: number;
  returned: number;
}

export interface NotifyPublisher {
  /** 永不同步抛、永不 reject；失败仅计数（F9：通知打点绝不阻断业务响应） */
  publish(event: NotifyEventInput): void;
  stats(): NotifyPublisherStats;
  isReady(): boolean;
  close(): Promise<void>;
}

export interface NotifyPublisherDeps {
  /** 测试注入；默认 amqp.connect */
  connect?: (url: string) => Promise<amqp.ChannelModel>;
  /** 测试可调小汇总窗口 */
  summaryIntervalMs?: number;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * F9 通知 publisher（audit publisher 同构：连接退避 1s→30s 封顶、事件监听必挂、
 * confirm+mandatory 防 unroutable 静默丢、60s 丢弃汇总）。
 * url 为空 → disabled 形态：恒丢弃计数 + 单次告警（未配 RABBITMQ_URL 不崩）。
 */
export function createNotifyPublisher(
  url: string | null,
  deps: NotifyPublisherDeps = {}
): NotifyPublisher {
  const connect = deps.connect ?? ((u: string) => amqp.connect(u));
  const summaryIntervalMs = deps.summaryIntervalMs ?? NOTIFY_SUMMARY_INTERVAL_MS;
  const disabled = !url;

  let conn: amqp.ChannelModel | null = null;
  let channel: amqp.ConfirmChannel | null = null;
  let closed = false;
  let attempt = 0;
  let everDisconnected = false;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let disabledWarned = false;
  const stats: NotifyPublisherStats = { dropped: 0, droppedWindow: 0, returned: 0 };

  const summaryTimer = setInterval(() => {
    if (stats.droppedWindow > 0) {
      console.error(
        `[NotifyMQ] publish_failed dropped_total=${stats.dropped} window=${stats.droppedWindow} returned=${stats.returned}`
      );
      stats.droppedWindow = 0;
    }
  }, summaryIntervalMs);
  summaryTimer.unref?.();

  function drop(reason: string) {
    stats.dropped += 1;
    stats.droppedWindow += 1;
    if (reason === 'not_configured') {
      if (!disabledWarned) {
        disabledWarned = true;
        console.error(
          '[NotifyMQ] RABBITMQ_URL not set — notify events are dropped (will not repeat)'
        );
      }
      return;
    }
    if (stats.droppedWindow === 1) {
      console.error(`[NotifyMQ] publish_failed reason=${reason} (will summarize every 60s)`);
    }
  }

  function scheduleReconnect() {
    if (closed || disabled || reconnectTimer) return;
    const delay = Math.min(30_000, 1000 * 2 ** attempt);
    attempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void start();
    }, delay);
    reconnectTimer.unref?.();
  }

  async function start(): Promise<void> {
    if (closed || disabled || !url) return;
    try {
      const c = await connect(url);
      c.on('error', (err: unknown) => {
        console.error(`[NotifyMQ] state=error: ${errorMessage(err)}`);
      });
      c.on('close', () => {
        if (closed) return;
        console.error('[NotifyMQ] state=disconnected');
        everDisconnected = true;
        channel = null;
        conn = null;
        scheduleReconnect();
      });
      const ch = await c.createConfirmChannel();
      ch.on('error', (err: unknown) => {
        console.error(`[NotifyMQ] channel error: ${errorMessage(err)}`);
      });
      ch.on('return', () => {
        stats.returned += 1;
      });
      // publisher 只 assert exchange；队列拓扑由 mail-service consumer 断言（audit 同口径）
      await ch.assertExchange(NOTIFY_EXCHANGE, 'direct', { durable: true });
      conn = c;
      channel = ch;
      attempt = 0;
      console.log(everDisconnected ? '[NotifyMQ] state=reconnected' : '[NotifyMQ] state=connected');
    } catch (err) {
      console.error(`[NotifyMQ] state=connect_failed: ${errorMessage(err)}`);
      scheduleReconnect();
    }
  }

  void start();

  function publish(input: NotifyEventInput): void {
    if (closed) {
      drop('closed');
      return;
    }
    if (disabled) {
      drop('not_configured');
      return;
    }
    const event = normalizeNotifyEvent(input);
    if (!event) {
      drop('invalid_event');
      return;
    }
    let body: string;
    try {
      body = JSON.stringify(event);
    } catch {
      drop('serialize');
      return;
    }
    if (body.length > MAX_NOTIFY_BODY_LENGTH) {
      drop('body_too_large');
      return;
    }
    const ch = channel;
    if (!ch) {
      drop('not_connected');
      return;
    }
    try {
      ch.publish(
        NOTIFY_EXCHANGE,
        NOTIFY_RK_WORK,
        Buffer.from(body),
        { persistent: true, mandatory: true },
        err => {
          if (err) drop('confirm_failed');
        }
      );
    } catch (err) {
      drop(`sync_throw:${errorMessage(err)}`);
    }
  }

  return {
    publish,
    stats: () => ({ ...stats }),
    isReady: () => channel !== null,
    async close() {
      closed = true;
      clearInterval(summaryTimer);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      const c = conn;
      conn = null;
      channel = null;
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
