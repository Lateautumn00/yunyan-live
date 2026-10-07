import amqp from 'amqplib';
import type { PersistRowInput } from './bullet';

/** 方案 §4.2 资源清单（与 persist.ts 共用同一常量源） */
export const EXCHANGE = 'chat.persist';
export const RK_WORK = 'chat.work';
export const RK_DLQ = 'chat.dlq';

/** extra 定死结构上限（方案 §4.1：超 1024 字符视为毒数据丢弃） */
export const MAX_EXTRA_JSON_LENGTH = 1024;

export interface PublisherStats {
  /** 累计丢弃（confirm 失败 / 同步 throw / 通道未就绪 / extra 超限） */
  dropped: number;
  /** 本窗口丢弃（60s 汇总日志用） */
  droppedWindow: number;
  /** mandatory unroutable 退回计数 */
  returned: number;
}

export interface Publisher {
  /** 永不同步抛、永不 reject；失败仅计数（方案 §4.2 publish 契约） */
  publish(row: PersistRowInput): void;
  stats(): PublisherStats;
  isReady(): boolean;
  close(): Promise<void>;
}

export interface PublisherDeps {
  /** 测试注入；默认 amqp.connect */
  connect?: (url: string) => Promise<amqp.ChannelModel>;
  /** 60s 汇总日志间隔（ms），测试可调小 */
  summaryIntervalMs?: number;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 持久化 publisher（连接退避 1s→30s 封顶，事件监听必挂——EventEmitter 无人监听的 error = 进程崩溃）。
 */
export function createPublisher(url: string, deps: PublisherDeps = {}): Publisher {
  const connect = deps.connect ?? ((u: string) => amqp.connect(u));
  const summaryIntervalMs = deps.summaryIntervalMs ?? 60_000;

  let conn: amqp.ChannelModel | null = null;
  let channel: amqp.ConfirmChannel | null = null;
  let closed = false;
  let attempt = 0;
  let everDisconnected = false;
  let reconnectTimer: NodeJS.Timeout | null = null;
  const stats: PublisherStats = { dropped: 0, droppedWindow: 0, returned: 0 };

  const summaryTimer = setInterval(() => {
    if (stats.droppedWindow > 0) {
      console.error(
        `[ChatWS][MQ] publish_failed dropped_total=${stats.dropped} window=${stats.droppedWindow} returned=${stats.returned}`
      );
      stats.droppedWindow = 0;
    }
  }, summaryIntervalMs);
  summaryTimer.unref?.();

  function drop(reason: string) {
    stats.dropped += 1;
    stats.droppedWindow += 1;
    if (stats.droppedWindow === 1) {
      // 首条即打点，避免仅靠 60s 汇总埋没
      console.error(`[ChatWS][MQ] publish_failed reason=${reason} (will summarize every 60s)`);
    }
  }

  function scheduleReconnect() {
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
    if (closed) return;
    try {
      const c = await connect(url);
      c.on('error', (err: unknown) => {
        console.error(`[ChatWS][MQ] state=error: ${errorMessage(err)}`);
      });
      c.on('close', () => {
        if (closed) return;
        console.error('[ChatWS][MQ] state=disconnected');
        everDisconnected = true;
        channel = null;
        conn = null;
        scheduleReconnect();
      });
      const ch = await c.createConfirmChannel();
      ch.on('error', (err: unknown) => {
        console.error(`[ChatWS][MQ] channel error: ${errorMessage(err)}`);
      });
      // mandatory + return：exchange 绑定漂移时 confirm ack 却 unroutable 的静默丢防护
      ch.on('return', () => {
        stats.returned += 1;
      });
      await ch.assertExchange(EXCHANGE, 'direct', { durable: true });
      conn = c;
      channel = ch;
      attempt = 0;
      console.log(
        everDisconnected ? '[ChatWS][MQ] state=reconnected' : '[ChatWS][MQ] state=connected'
      );
    } catch (err) {
      console.error(`[ChatWS][MQ] state=connect_failed: ${errorMessage(err)}`);
      scheduleReconnect();
    }
  }

  void start();

  function publish(row: PersistRowInput): void {
    if (closed) {
      drop('closed');
      return;
    }
    let extraJson: string;
    try {
      extraJson = JSON.stringify(row.extra);
    } catch {
      drop('extra_serialize');
      return;
    }
    if (extraJson.length > MAX_EXTRA_JSON_LENGTH) {
      drop('extra_too_large');
      return;
    }
    const ch = channel;
    if (!ch) {
      drop('not_connected');
      return;
    }
    let buf: Buffer;
    try {
      buf = Buffer.from(JSON.stringify(row));
    } catch {
      drop('serialize');
      return;
    }
    try {
      ch.publish(EXCHANGE, RK_WORK, buf, { persistent: true, mandatory: true }, err => {
        if (err) drop('confirm_failed');
      });
    } catch (err) {
      // channel 关闭时 invalidateSend 同步 throw——吞掉，绝不阻断广播
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
