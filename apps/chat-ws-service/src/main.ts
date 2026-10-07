import Koa from 'koa';
import http from 'http';
import { randomUUID } from 'crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { URL } from 'url';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { WsClose, CHAT_HISTORY_PAGE_SIZE, type BulletRejectReason } from '@yunyan-live/types';
import {
  requireJwtSecret,
  subscribeForbid,
  subscribeKick,
  readForbid,
  validateSession,
  verifyToken
} from '@yunyan-live/nest-shared';
import { buildBullet, sanitizeName } from './bullet';
import { loadPersistenceConfig, requireDatabaseUrl, requireRabbitUrl } from './config';
import { createPublisher, type Publisher } from './queue';
import { createConsumer, type ConsumerHandle } from './persist';
import { createHistoryStore, decodeCursor, type HistoryStore } from './history';

dotenv.config();

interface WsClient {
  ws: WebSocket;
  userId: string;
  nickName: string;
  roomId: string;
  authUserId?: string;
  sid?: string;
  /** JWT 重建的权威角色（payload.role === 1 为教师） */
  isTeacher: boolean;
  /** 令牌桶（方案 §4.6：5 条/s、容量 10，仅计 bullet） */
  tokens: number;
  lastRefill: number;
}

interface LiveMessage {
  type: string;
  data?: object;
  /** 拒发回执（bullet_rejected）原因 */
  reason?: BulletRejectReason;
}

const rooms = new Map<string, Map<string, WsClient>>();
const clientIds = new WeakMap<WebSocket, string>();
const whiteboardStates = new Map<string, string>();
/** 房间禁言态缓存（0=禁言 1=可发言）：连接建立时 readForbid 回填、订阅推送时更新 */
const roomForbid = new Map<string, number>();

const JWT_SECRET = requireJwtSecret();

// —— 持久化（方案 §4.7：单布尔开关、同启同停；半配置 = 配置错误按关闭处理） ——
const persistence = loadPersistenceConfig();
let pool: Pool | null = null;
let publisher: Publisher | null = null;
let consumer: ConsumerHandle | null = null;
let historyStore: HistoryStore | null = null;

if (persistence.enabled) {
  pool = new Pool({ connectionString: requireDatabaseUrl(), max: 5 });
  pool.on('error', err => {
    console.error('[ChatWS][PG] pool error:', err instanceof Error ? err.message : String(err));
  });
  historyStore = createHistoryStore(pool, persistence.historyTimeoutMs);
  publisher = createPublisher(requireRabbitUrl());
  consumer = createConsumer(requireRabbitUrl(), pool);
  console.log('[ChatWS] persistence: enabled');
} else {
  console.error(
    `[ChatWS] persistence: disabled (${persistence.disabledReason})` +
      (persistence.disabledReason === 'half_configured'
        ? ' — DATABASE_URL and RABBITMQ_URL must both be set'
        : '')
  );
}

/** 令牌桶：5 条/s、容量 10（突发后匀速）；仅 bullet 计数 */
const BULLET_RATE_PER_MS = 5 / 1000;
const BULLET_BURST = 10;

function allowBullet(client: WsClient, at = Date.now()): boolean {
  const elapsed = Math.max(0, at - client.lastRefill);
  client.tokens = Math.min(BULLET_BURST, client.tokens + elapsed * BULLET_RATE_PER_MS);
  client.lastRefill = at;
  if (client.tokens < 1) return false;
  client.tokens -= 1;
  return true;
}

/** 连接级 getHistory 单飞（并发重复静默忽略，不回帧） */
const historyInflight = new WeakSet<WebSocket>();

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1
});
redis.on('error', (err: unknown) => {
  console.error('[ChatWS] Redis error:', err instanceof Error ? err.message : String(err));
});

function kickSessionClients(guid: string, oldSid: string) {
  for (const [rid, clients] of rooms) {
    for (const [cid, client] of clients) {
      if (
        client.authUserId === guid &&
        client.sid === oldSid &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.close(WsClose.SESSION_KICKED, 'Session replaced by another login');
        console.log(`[ChatWS] Kicked: roomId=${rid}, id=${cid}`);
      }
    }
  }
}

subscribeKick(
  redis,
  (guid, oldSid) => kickSessionClients(guid, oldSid),
  (err, stage) => {
    if (stage === 'connection') {
      console.error(
        '[ChatWS] Redis subscriber error:',
        err instanceof Error ? err.message : String(err)
      );
    } else if (stage === 'subscribe') {
      console.error(
        '[ChatWS] subscribe failed, retrying:',
        err instanceof Error ? err.message : String(err)
      );
    } else {
      console.error('[ChatWS] bad kick payload:', err);
    }
  }
);

// 禁言状态变更（网关 live/push/updateForbid 写入并 publish）→ 更新缓存并广播给房间内所有客户端
subscribeForbid(
  redis,
  (roomId, status) => {
    roomForbid.set(roomId, status);
    broadcast(roomId, JSON.stringify({ type: 'updateForbid', status }));
  },
  (err, stage) => {
    console.error(`[ChatWS] forbid ${stage}:`, err instanceof Error ? err.message : String(err));
  }
);

function sendTo(client: WebSocket, data: LiveMessage) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(data));
  }
}

function broadcast(roomId: string, raw: string, excludeId?: string) {
  const clients = rooms.get(roomId);
  if (!clients) return;
  for (const [id, { ws }] of clients) {
    if (id !== excludeId && ws.readyState === WebSocket.OPEN) {
      ws.send(raw);
    }
  }
}

function registerClient(
  client: WebSocket,
  roomId: string,
  userId: string,
  nickName: string,
  authUserId?: string,
  sid?: string,
  isTeacher = false
): string {
  const clientId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  clientIds.set(client, clientId);
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }
  rooms.get(roomId)!.set(clientId, {
    ws: client,
    userId,
    nickName,
    roomId,
    authUserId,
    sid,
    isTeacher,
    tokens: BULLET_BURST,
    lastRefill: Date.now()
  });
  return clientId;
}

function handleMessage(client: WebSocket, raw: string) {
  try {
    const msg: LiveMessage = JSON.parse(raw);
    const clientId = clientIds.get(client);

    let roomId = '';
    for (const [rid, clients] of rooms) {
      if (clientId && clients.has(clientId)) {
        roomId = rid;
        break;
      }
    }
    if (!roomId) return;
    const sender = clientId ? rooms.get(roomId)?.get(clientId) : undefined;

    switch (msg.type) {
      case 'ping':
        sendTo(client, { type: 'pong' });
        break;
      case 'msg':
        // 异步回填：若在途期间订阅推送了更新值，旧读可能短暂覆盖新值；下一轮 msg 轮询（客户端心跳周期性触发）自愈，接受该窗口。
        void readForbid(redis, roomId).then(forbid => {
          roomForbid.set(roomId, forbid);
          sendTo(client, {
            type: 'msg',
            data: { liveMsg: { liveNums: rooms.get(roomId)?.size ?? 0, forbid } }
          });
        });
        break;
      case 'bullet': {
        if (!sender) {
          sendTo(client, { type: 'bullet_rejected', reason: 'not_joined' });
          break;
        }
        if (!allowBullet(sender)) {
          sendTo(client, { type: 'bullet_rejected', reason: 'rate_limited' });
          break;
        }
        const result = buildBullet(raw, {
          roomId,
          nickName: sender.nickName,
          liveUserId: sender.userId,
          isTeacher: sender.isTeacher,
          forbid: roomForbid.get(roomId),
          msgId: randomUUID(),
          senderId: sender.authUserId ?? ''
        });
        if (result.ok) {
          // ① 先入持久化链路（fire-forget，confirm 异步，永不阻断广播）
          if (publisher && result.entry) publisher.publish(result.entry);
          // ② 再广播（行为与现状一致）
          broadcast(roomId, result.payload);
        } else sendTo(client, { type: 'bullet_rejected', reason: result.reason });
        break;
      }
      case 'getHistory': {
        if (!sender) break;
        if (!persistence.enabled || !historyStore) {
          sendTo(client, { type: 'historyError', data: { reason: 'persistence_disabled' } });
          break;
        }
        if (historyInflight.has(client)) break; // 单飞：并发重复静默忽略
        historyInflight.add(client);
        const rawCursor = (msg.data as { cursor?: unknown } | undefined)?.cursor;
        const cursor = rawCursor === undefined ? null : decodeCursor(rawCursor);
        if (rawCursor !== undefined && cursor === null) {
          historyInflight.delete(client);
          sendTo(client, { type: 'historyError', data: { reason: 'invalid_cursor' } });
          break;
        }
        historyStore
          .page(roomId, cursor, CHAT_HISTORY_PAGE_SIZE)
          .then(page => {
            if (client.readyState === WebSocket.OPEN) {
              sendTo(client, { type: 'historyPage', data: page });
            }
          })
          .catch((err: unknown) => {
            console.error(
              '[ChatWS][PG] history_page_failed:',
              err instanceof Error ? err.message : String(err)
            );
            if (client.readyState === WebSocket.OPEN) {
              sendTo(client, { type: 'historyError', data: { reason: 'unavailable' } });
            }
          })
          .finally(() => historyInflight.delete(client));
        break;
      }
      case 'whiteBoard': {
        const wbMsg = JSON.parse(raw);
        if (wbMsg.data?.liveMsg?.msg) {
          whiteboardStates.set(roomId, wbMsg.data.liveMsg.msg);
        }
        broadcast(roomId, raw, clientId);
        break;
      }
      case 'getwhiteBoard': {
        const storedMsg = whiteboardStates.get(roomId) || null;
        sendTo(client, {
          type: 'getWhiteBoard',
          data: { liveMsg: { msg: storedMsg } }
        });
        break;
      }
      case 'live_started':
        broadcast(roomId, raw);
        break;
      default:
        break;
    }
  } catch (error) {
    console.error('[ChatWS] Message parse error:', error);
  }
}

async function handleConnection(connection: WebSocket, req: http.IncomingMessage) {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  if (!token) {
    connection.close(WsClose.UNAUTHORIZED, 'Token required');
    return;
  }

  const payload = verifyToken(token, JWT_SECRET);
  if (!payload) {
    connection.close(WsClose.UNAUTHORIZED, 'Invalid token');
    return;
  }

  // Buffer frames that arrive while the async session check is in flight, so the
  // client's first message (e.g. getwhiteBoard) is not dropped.
  const pending: string[] = [];
  let registered = false;
  connection.on('message', (raw: Buffer | string) => {
    const text = raw.toString();
    if (!registered) {
      pending.push(text);
      return;
    }
    handleMessage(connection, text);
  });

  const sessionState = await validateSession(redis, payload.sub, payload.sid, err =>
    console.error(
      '[ChatWS] session check fail-open:',
      err instanceof Error ? err.message : String(err)
    )
  );
  if (sessionState === 'kicked') {
    connection.close(WsClose.SESSION_KICKED, 'Session replaced by another login');
    return;
  }
  if (sessionState === 'expired') {
    connection.close(WsClose.UNAUTHORIZED, 'Session expired');
    return;
  }
  if (connection.readyState !== WebSocket.OPEN) return;

  const roomId = url.searchParams.get('roomId') || 'default';
  if (roomId.length < 1 || roomId.length > 50) {
    connection.close(WsClose.UNAUTHORIZED, 'Invalid roomId');
    return;
  }
  const userId = url.searchParams.get('liveUserId') || 'anonymous';
  const nickName = sanitizeName(url.searchParams.get('nickName') || '');

  const clientId = registerClient(
    connection,
    roomId,
    userId,
    nickName,
    payload.sub,
    payload.sid,
    payload.role === 1
  );

  sendTo(connection, { type: 'pong' });
  const forbid = await readForbid(redis, roomId);
  roomForbid.set(roomId, forbid);
  sendTo(connection, {
    type: 'msg',
    data: { liveMsg: { liveNums: rooms.get(roomId)!.size, forbid } }
  });

  // 进场历史（方案 §4.5：最近 50 条 ASC 推 history 帧；失败不推帧——严禁空 history 覆盖前端状态）
  if (historyStore) {
    const page = await historyStore.recent(roomId, CHAT_HISTORY_PAGE_SIZE);
    if (page && connection.readyState === WebSocket.OPEN) {
      sendTo(connection, { type: 'history', data: page });
    }
  }

  console.log(`[ChatWS] Connected: roomId=${roomId}, userId=${userId}, id=${clientId}`);

  registered = true;
  for (const text of pending) handleMessage(connection, text);

  connection.on('close', () => {
    const cid = clientIds.get(connection);
    if (!cid) return;
    for (const [rid, clients] of rooms) {
      if (clients.has(cid)) {
        clients.delete(cid);
        if (clients.size === 0) {
          rooms.delete(rid);
          roomForbid.delete(rid);
        }
        console.log(`[ChatWS] Disconnected: roomId=${rid}, id=${cid}`);
        break;
      }
    }
  });
}

const app = new Koa();
const server = http.createServer(app.callback());
// 单条帧上限 256KB：正常弹幕/白板帧远小于此值，防巨帧耗尽内存（默认 100MB）
const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 });

// /healthz 早于 catch-all（方案 §4.7：mq+pg 双探活、60s 缓存、深度 passive 查询）
let healthCache: { at: number; body: Record<string, unknown> } | null = null;

async function healthzBody(): Promise<Record<string, unknown>> {
  if (!persistence.enabled) {
    return { status: 'disabled', mq: 0, pg: 0, queueDepth: null, dlqDepth: null };
  }
  if (healthCache && Date.now() - healthCache.at < 60_000) return healthCache.body;
  const mq = publisher?.isReady() ? 1 : 0;
  let pg = 0;
  const probe = pool!.query('SELECT 1');
  let probeTimer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      probe,
      new Promise((_, reject) => {
        probeTimer = setTimeout(() => reject(new Error('pg probe timeout')), 1000);
      })
    ]);
    pg = 1;
  } catch {
    // 保持 0
  } finally {
    clearTimeout(probeTimer);
    probe.catch(() => undefined); // race 先超时后查询才 reject → 防 unhandled
  }
  const depths = consumer ? await consumer.depths() : null;
  const body: Record<string, unknown> = {
    status: mq && pg ? 'ok' : 'degraded',
    mq,
    pg,
    queueDepth: depths?.work ?? null,
    dlqDepth: depths?.dlq ?? null
  };
  healthCache = { at: Date.now(), body };
  return body;
}

app.use(async (ctx, next) => {
  if (ctx.path === '/healthz') {
    ctx.body = await healthzBody();
    return;
  }
  await next();
});

app.use(async ctx => {
  ctx.body = { status: 'ok', service: 'chat-ws' };
});

wss.on('connection', (connection, req) => {
  handleConnection(connection, req);
});

const port = Number(process.env.CHAT_WS_PORT) || 50054;
server.listen(port, '0.0.0.0', () => {
  console.log(`Chat WS service on port ${port}`);
});

process.on('SIGTERM', () => {
  console.log('[ChatWS] Shutting down...');
  wss.clients.forEach(client => client.close(1001, 'Server shutting down'));
  void (async () => {
    try {
      await consumer?.stop(); // cancel → 等在途批 → 关连接
    } catch (err) {
      console.error('[ChatWS] consumer stop error:', err);
    }
    try {
      await publisher?.close();
    } catch (err) {
      console.error('[ChatWS] publisher close error:', err);
    }
    try {
      await pool?.end();
    } catch (err) {
      console.error('[ChatWS] pool end error:', err);
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref?.();
  })();
});

export { server, wss };
