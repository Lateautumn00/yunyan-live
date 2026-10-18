import amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import { AUDIT_COLUMN_LIMITS, AUDIT_EXCHANGE, AUDIT_RK_WORK } from './constants';
import { sanitizeAuditDetail } from './detail';
import type { AuditEventInput, AuditWireEvent } from './event';

/** 报文整体硬顶（detail 已收敛 4096，128KB 只防畸形调用）；超限丢弃保事件语义完整 */
export const MAX_AUDIT_BODY_LENGTH = 131_072;
/** 60s 汇总日志窗口（与 chat-ws publisher 同口径） */
export const AUDIT_SUMMARY_INTERVAL_MS = 60_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuditPublisherStats {
  /** 累计丢弃（未配置 / confirm 失败 / 同步 throw / 通道未就绪 / 校验失败 / 超长） */
  dropped: number;
  droppedWindow: number;
  returned: number;
}

export interface AuditPublisher {
  /** 永不同步抛、永不 reject；失败仅计数（S12：审计打点绝不阻断业务响应） */
  publish(event: AuditEventInput): void;
  stats(): AuditPublisherStats;
  isReady(): boolean;
  close(): Promise<void>;
}

export interface AuditPublisherDeps {
  /** 测试注入；默认 amqp.connect */
  connect?: (url: string) => Promise<amqp.ChannelModel>;
  /** 测试可调小汇总窗口 */
  summaryIntervalMs?: number;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

export function normalizeAuditEvent(input: AuditEventInput): AuditWireEvent | null {
  if (typeof input.actor !== 'string' || !input.actor) return null;
  if (typeof input.action !== 'string' || !input.action) return null;
  const eventId =
    typeof input.eventId === 'string' && UUID_RE.test(input.eventId) ? input.eventId : randomUUID();
  const occurredAtMs =
    typeof input.occurredAtMs === 'number' && Number.isFinite(input.occurredAtMs)
      ? input.occurredAtMs
      : Date.now();
  const opt = (v: unknown, max: number): string | null => {
    if (typeof v !== 'string' || !v) return null;
    return truncate(v, max);
  };
  return {
    eventId,
    occurredAtMs,
    actor: truncate(input.actor, AUDIT_COLUMN_LIMITS.actor),
    action: truncate(input.action, AUDIT_COLUMN_LIMITS.action),
    targetType: opt(input.targetType, AUDIT_COLUMN_LIMITS.targetType),
    targetId: opt(input.targetId, AUDIT_COLUMN_LIMITS.targetId),
    requestId: opt(input.requestId, AUDIT_COLUMN_LIMITS.requestId),
    ip: opt(input.ip, AUDIT_COLUMN_LIMITS.ip),
    detail: sanitizeAuditDetail(input.detail)
  };
}

/**
 * S12 审计 publisher（chat-ws queue.ts 同构：连接退避 1s→30s 封顶、事件监听必挂、
 * confirm+mandatory 防 unroutable 静默丢、60s 丢弃汇总）。
 * url 为空 → disabled 形态：恒丢弃计数 + 单次告警（gateway 未配 RABBITMQ_URL 不崩）。
 */
export function createAuditPublisher(
  url: string | null,
  deps: AuditPublisherDeps = {}
): AuditPublisher {
  const connect = deps.connect ?? ((u: string) => amqp.connect(u));
  const summaryIntervalMs = deps.summaryIntervalMs ?? AUDIT_SUMMARY_INTERVAL_MS;
  const disabled = !url;

  let conn: amqp.ChannelModel | null = null;
  let channel: amqp.ConfirmChannel | null = null;
  let closed = false;
  let attempt = 0;
  let everDisconnected = false;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let disabledWarned = false;
  const stats: AuditPublisherStats = { dropped: 0, droppedWindow: 0, returned: 0 };

  const summaryTimer = setInterval(() => {
    if (stats.droppedWindow > 0) {
      console.error(
        `[AuditMQ] publish_failed dropped_total=${stats.dropped} window=${stats.droppedWindow} returned=${stats.returned}`
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
          '[AuditMQ] RABBITMQ_URL not set — audit events are dropped (will not repeat)'
        );
      }
      return;
    }
    if (stats.droppedWindow === 1) {
      console.error(`[AuditMQ] publish_failed reason=${reason} (will summarize every 60s)`);
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
        console.error(`[AuditMQ] state=error: ${errorMessage(err)}`);
      });
      c.on('close', () => {
        if (closed) return;
        console.error('[AuditMQ] state=disconnected');
        everDisconnected = true;
        channel = null;
        conn = null;
        scheduleReconnect();
      });
      const ch = await c.createConfirmChannel();
      ch.on('error', (err: unknown) => {
        console.error(`[AuditMQ] channel error: ${errorMessage(err)}`);
      });
      ch.on('return', () => {
        stats.returned += 1;
      });
      await ch.assertExchange(AUDIT_EXCHANGE, 'direct', { durable: true });
      conn = c;
      channel = ch;
      attempt = 0;
      console.log(everDisconnected ? '[AuditMQ] state=reconnected' : '[AuditMQ] state=connected');
    } catch (err) {
      console.error(`[AuditMQ] state=connect_failed: ${errorMessage(err)}`);
      scheduleReconnect();
    }
  }

  void start();

  function publish(input: AuditEventInput): void {
    if (closed) {
      drop('closed');
      return;
    }
    if (disabled) {
      drop('not_configured');
      return;
    }
    const event = normalizeAuditEvent(input);
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
    if (body.length > MAX_AUDIT_BODY_LENGTH) {
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
        AUDIT_EXCHANGE,
        AUDIT_RK_WORK,
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
