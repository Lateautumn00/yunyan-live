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
  subscribeCheckin,
  subscribeForbid,
  subscribeKick,
  subscribeModeration,
  subscribeRecall,
  readForbid,
  validateSession,
  verifyToken,
  createServiceMetrics
} from '@yunyan-live/nest-shared';
import { buildBullet, sanitizeName } from './bullet';
import {
  applyModeration,
  collectExpired,
  dropRoom,
  ensureRoom,
  isMuted,
  loadModeration,
  sweepExpiredModeration,
  type ModerationState
} from './moderation';
import { DEFAULT_BANNED_WORDS } from './wordfilter';
import { loadPersistenceConfig, requireDatabaseUrl, requireRabbitUrl } from './config';
import { createPublisher, type Publisher } from './queue';
import { createConsumer, type ConsumerHandle } from './persist';
import { startDepthMonitor } from './monitor';
import { createHistoryStore, decodeCursor, type HistoryStore } from './history';

dotenv.config();

const metrics = createServiceMetrics('chat-ws-service');

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
/** 房间禁言态缓存（0=禁言 1=可发言）：连接建立时 readForbid 回填、订阅推送时更新 */
const roomForbid = new Map<string, number>();
/** F3 单用户管控缓存（authUserId 维度）：订阅推送更新、握手 PG 回填、房间空丢弃 */
const moderationState: ModerationState = new Map();

const JWT_SECRET = requireJwtSecret();

// —— 持久化（方案 §4.7：单布尔开关、同启同停；半配置 = 配置错误按关闭处理） ——
const persistence = loadPersistenceConfig();
let pool: Pool | null = null;
let publisher: Publisher | null = null;
let consumer: ConsumerHandle | null = null;
let historyStore: HistoryStore | null = null;
let stopDepthMonitor: (() => void) | null = null;

if (persistence.enabled) {
  pool = new Pool({ connectionString: requireDatabaseUrl(), max: 5 });
  pool.on('error', err => {
    console.error('[ChatWS][PG] pool error:', err instanceof Error ? err.message : String(err));
  });
  historyStore = createHistoryStore(pool, persistence.historyTimeoutMs);
  publisher = createPublisher(requireRabbitUrl());
  consumer = createConsumer(requireRabbitUrl(), pool);
  stopDepthMonitor = startDepthMonitor({
    depths: () => consumer?.depths() ?? Promise.resolve(null),
    onDepth: depths => {
      metrics.chatQueueDepth.set({ queue: 'work' }, depths.work);
      metrics.chatQueueDepth.set({ queue: 'dlq' }, depths.dlq);
    }
  });
  console.log('[ChatWS] persistence: enabled');
} else {
  console.error(
    `[ChatWS] persistence: disabled (${persistence.disabledReason})` +
      (persistence.disabledReason === 'half_configured'
        ? ' — DATABASE_URL and RABBITMQ_URL must both be set'
        : '')
  );
}

// F3 管控读库：与 history 开关解耦——持久化开则复用同一池，否则有 DATABASE_URL 单开小池
// （握手 kick/mute 回填 + 到期扫尾）；无 DATABASE_URL → null，读路径 fail-open。
let moderationPool: Pool | null = null;
let ownsModerationPool = false;
if (persistence.enabled && pool) {
  moderationPool = pool;
} else if (process.env.DATABASE_URL) {
  moderationPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  moderationPool.on('error', err => {
    console.error(
      '[ChatWS][PG] moderation pool error:',
      err instanceof Error ? err.message : String(err)
    );
  });
  ownsModerationPool = true;
}
if (!moderationPool) {
  console.error('[ChatWS] moderation: no DATABASE_URL → fail-open (kick 不可拒入)');
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

// F3 单用户禁言/踢出（网关 live/push/mute|kick|release 经 gRPC 落库后 publish live:moderation）
subscribeModeration(
  redis,
  payload => {
    applyModeration(moderationState, payload);
    broadcast(
      payload.roomId,
      JSON.stringify({
        type: 'moderation',
        userId: payload.userId,
        kind: payload.kind,
        op: payload.op,
        ...(payload.untilMs !== undefined ? { untilMs: payload.untilMs } : {})
      })
    );
    if (payload.kind === 'kick' && payload.op === 'set') {
      const clients = rooms.get(payload.roomId);
      if (clients) {
        for (const client of clients.values()) {
          if (client.authUserId === payload.userId) {
            client.ws.close(WsClose.MODERATION_KICKED, 'Removed by teacher');
          }
        }
      }
    }
  },
  (err, stage) => {
    console.error(
      `[ChatWS] moderation ${stage}:`,
      err instanceof Error ? err.message : String(err)
    );
  }
);

// F4 撤回（网关 live/push/recall 经 gRPC 落库后 publish live:recall）→ 转播 recall 帧；
// 按 msgId 定位，客户端把已渲染消息替换为 RECALLED_PLACEHOLDER（历史读侧同源占位）
subscribeRecall(
  redis,
  payload => {
    broadcast(payload.roomId, JSON.stringify({ type: 'recall', data: { msgId: payload.msgId } }));
  },
  (err, stage) => {
    console.error(`[ChatWS] recall ${stage}:`, err instanceof Error ? err.message : String(err));
  }
);

// 签到事件（网关 live/checkin publish）→ 广播 {type:'checkin', data:{roomId,action,sessionId,deadlineAt?,signedCount?}}
subscribeCheckin(
  redis,
  payload => {
    broadcast(payload.roomId, JSON.stringify({ type: 'checkin', data: payload }));
  },
  (err, stage) => {
    console.error(`[ChatWS] checkin ${stage}:`, err instanceof Error ? err.message : String(err));
  }
);

// F3 到期轮询（15s）：缓存过期 → 广播 expire 帧；PG 全局扫尾置 active=false（留痕 expired）。
// 单实例语义（GAP-F14 同边界）：多实例间 expire 广播不互通，但读路径惰性过期仍正确。
const moderationPoll = setInterval(() => {
  for (const { roomId, userId } of collectExpired(moderationState)) {
    broadcast(roomId, JSON.stringify({ type: 'moderation', userId, kind: 'mute', op: 'expire' }));
  }
  if (moderationPool) {
    sweepExpiredModeration(moderationPool).catch((err: unknown) => {
      console.error(
        '[ChatWS][PG] moderation sweep failed:',
        err instanceof Error ? err.message : String(err)
      );
    });
  }
}, 15_000);
moderationPoll.unref?.();

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

/** 房间成员名册快照（按 liveUserId 去重；senderId=JWT sub，供前端把禁言/踢出并回成员列表） */
function rosterMembers(roomId: string) {
  const clients = rooms.get(roomId);
  const members: Array<{
    senderId: string;
    liveUserId: string;
    nickName: string;
    isTeacher: boolean;
  }> = [];
  const seen = new Set<string>();
  for (const client of clients?.values() ?? []) {
    if (seen.has(client.userId)) continue;
    seen.add(client.userId);
    members.push({
      senderId: client.authUserId ?? '',
      liveUserId: client.userId,
      nickName: client.nickName,
      isTeacher: client.isTeacher
    });
  }
  return members;
}

function broadcastRoster(roomId: string) {
  broadcast(roomId, JSON.stringify({ type: 'roster', data: { members: rosterMembers(roomId) } }));
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
        // F3：单用户禁言先于全房禁言（台账"单用户优先"）；教师豁免
        if (!sender.isTeacher && isMuted(moderationState, roomId, sender.authUserId)) {
          sendTo(client, { type: 'bullet_rejected', reason: 'muted' });
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
          bannedWords: DEFAULT_BANNED_WORDS,
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
  // client's first message is not dropped.
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

  // F3 握手回填：活跃 kick → 拒入本场（4005）；活跃 mute → 缓存供 bullet 判定
  const moderation = await loadModeration(moderationPool, roomId, payload.sub);
  if (moderation?.kicked) {
    connection.close(WsClose.MODERATION_KICKED, 'Removed by teacher');
    return;
  }
  if (moderation?.muteUntilMs !== undefined) {
    const roomModeration = ensureRoom(moderationState, roomId);
    const entry = roomModeration.get(payload.sub) ?? {};
    entry.muteUntilMs = moderation.muteUntilMs;
    roomModeration.set(payload.sub, entry);
  }
  if (connection.readyState !== WebSocket.OPEN) return;

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

  broadcastRoster(roomId);

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
          dropRoom(moderationState, rid);
        } else {
          broadcastRoster(rid);
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
  if (ctx.path === '/metrics') {
    // O5：在线数实时求和（纯内存）；队列深度由 depth monitor 采样写入 gauge
    let online = 0;
    for (const clients of rooms.values()) online += clients.size;
    metrics.chatOnlineConnections.set(online);
    ctx.set('Content-Type', metrics.registry.contentType);
    ctx.body = await metrics.registry.metrics();
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
  clearInterval(moderationPoll);
  wss.clients.forEach(client => client.close(1001, 'Server shutting down'));
  stopDepthMonitor?.();
  void (async () => {
    try {
      await consumer?.stop(); // cancel → 等在途批 → 关连接
    } catch (err) {
      console.error('[ChatWS] consumer stop error:', err);
    }
    try {
      await publisher?.close();
    } catch (err) {
      console.error('[ChatWS] publisher stop error:', err);
    }
    try {
      await pool?.end();
    } catch (err) {
      console.error('[ChatWS] pool stop error:', err);
    }
    if (ownsModerationPool && moderationPool && moderationPool !== pool) {
      try {
        await moderationPool.end();
      } catch (err) {
        console.error('[ChatWS] moderation pool stop error:', err);
      }
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref?.();
  })();
});

export { server, wss };
