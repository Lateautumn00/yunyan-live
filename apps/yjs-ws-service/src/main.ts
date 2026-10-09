/* eslint-disable @typescript-eslint/no-explicit-any */
import Koa from 'koa';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { URL } from 'url';
import * as Y from 'yjs';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import { YjsClose } from '@yunyan-live/types';
import {
  requireJwtSecret,
  subscribeKick,
  validateSession,
  verifyToken
} from '@yunyan-live/nest-shared';
import { loadLatestSnapshot, saveSnapshot } from './snapshot';
import { checkRoomAccess } from './access';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

dotenv.config();

const messageSync = 0;
const messageAwareness = 1;
/** 自定义状态帧：服务端 → 教师端推送快照落库状态（客户端 provider 注册 handler 消费） */
const messageSnapshotStatus = 4;

/** 与网关口径一致：1 = 教师、2 = 学生（packages/types UserInfo.role） */
const TEACHER_ROLE = 1;
const STUDENT_ROLE = 2;

/** y-protocols sync 子类型：0=syncStep1（状态向量请求）、1=syncStep2、2=update */
const SYNC_STEP1 = 0;

const SNAPSHOT_INTERVAL_MS = Math.max(1000, Number(process.env.SNAPSHOT_INTERVAL_MS) || 300000);
const SNAPSHOT_EMPTY_GRACE_MS = Math.max(0, Number(process.env.SNAPSHOT_EMPTY_GRACE_MS) || 60000);
const SNAPSHOT_FAIL_RETRY_MS = Math.max(1000, Number(process.env.SNAPSHOT_FAIL_RETRY_MS) || 10000);

const JWT_SECRET = requireJwtSecret();

// y-websocket stops reconnecting on close codes 4400-4499 and emits a terminal
// `closed` event, so every unrecoverable auth failure must use YjsClose (44xx).

interface ConnMeta {
  docName: string;
  authUserId?: string;
  sid?: string;
  /** 房间内有效角色（房间校验可用时为房间角色，否则回退 JWT role） */
  role?: number;
  /** D8 写权限：仅房间教师可写 syncStep2/update（syncStep1 与 awareness 不受限） */
  canWrite: boolean;
}

interface RoomMeta {
  dirty: boolean;
  /** 快照加载成功才允许 flush（加载失败的房间禁止写入，避免空文档覆盖新快照） */
  hydrated: boolean;
  failCount: number;
  flushing: boolean;
  interval: ReturnType<typeof setInterval>;
  graceTimer?: ReturnType<typeof setTimeout>;
  retryTimer?: ReturnType<typeof setTimeout>;
}

const docs = new Map<string, Y.Doc>();
const connMeta = new WeakMap<WebSocket, ConnMeta>();
const roomMeta = new Map<string, RoomMeta>();
const loadingDocs = new Map<string, Promise<Y.Doc>>();

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1
});
redis.on('error', (err: unknown) => {
  console.error('[YjsWS] Redis error:', err instanceof Error ? err.message : String(err));
});

function findKickConns(guid: string, oldSid: string): WebSocket[] {
  const targets: WebSocket[] = [];
  for (const doc of docs.values()) {
    const conns = (doc as any).conns as Map<WebSocket, Set<unknown>> | undefined;
    if (!conns) continue;
    for (const conn of conns.keys()) {
      const meta = connMeta.get(conn);
      if (meta?.authUserId === guid && meta.sid === oldSid) {
        targets.push(conn);
      }
    }
  }
  return targets;
}

subscribeKick(
  redis,
  (guid, oldSid) => {
    for (const conn of findKickConns(guid, oldSid)) {
      if (conn.readyState === WebSocket.OPEN) {
        conn.close(YjsClose.SESSION_KICKED, 'Session replaced by another login');
      }
      const meta = connMeta.get(conn);
      if (meta) {
        const doc = docs.get(meta.docName);
        if (doc) closeConn(doc, conn);
      }
      console.log(`[YjsWS] Kicked conn for guid=${guid}`);
    }
  },
  (err, stage) => {
    if (stage === 'connection') {
      console.error(
        '[YjsWS] Redis subscriber error:',
        err instanceof Error ? err.message : String(err)
      );
    } else if (stage === 'subscribe') {
      console.error(
        '[YjsWS] subscribe failed, retrying:',
        err instanceof Error ? err.message : String(err)
      );
    } else {
      console.error('[YjsWS] bad kick payload:', err);
    }
  }
);

function broadcast(doc: Y.Doc, msg: Uint8Array, origin: WebSocket | null = null) {
  const conns = (doc as any).conns as Map<WebSocket, Set<any>> | undefined;
  if (!conns) return;
  for (const [conn] of conns) {
    if (conn !== origin && conn.readyState === 1) {
      send(doc, conn, msg);
    }
  }
}

function initDoc(docName: string, doc: Y.Doc): void {
  (doc as any).awareness = new awarenessProtocol.Awareness(doc);

  const d = doc;
  d.on('update', (update: Uint8Array, origin: any) => {
    const meta = roomMeta.get(docName);
    if (meta) meta.dirty = true;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    broadcast(d, encoding.toUint8Array(encoder), origin);
  });

  const awareness = (d as any).awareness;
  awareness.on(
    'update',
    (changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const conns = (d as any).conns as Map<WebSocket, Set<number>> | undefined;
      if (conns && origin instanceof WebSocket) {
        const controlled = conns.get(origin);
        if (controlled) {
          for (const id of changes.added) controlled.add(id);
          for (const id of changes.updated) controlled.add(id);
          for (const id of changes.removed) controlled.delete(id);
        }
      }
      const clients = [...changes.added, ...changes.updated, ...changes.removed];
      if (clients.length > 0) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageAwareness);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(awareness, clients)
        );
        broadcast(d, encoding.toUint8Array(encoder), origin instanceof WebSocket ? origin : null);
      }
    }
  );
}

function startRoomMeta(docName: string, hydrated: boolean): RoomMeta {
  const meta: RoomMeta = {
    dirty: false,
    hydrated,
    failCount: 0,
    flushing: false,
    interval: setInterval(() => {
      void flushRoom(docName);
    }, SNAPSHOT_INTERVAL_MS)
  };
  meta.interval.unref?.();
  roomMeta.set(docName, meta);
  return meta;
}

/**
 * 取（或创建）房间文档。首建时从服务端拉取最新快照恢复（D7 配套的恢复路径）：
 * - 拉取成功无历史 → 空文档；拉取成功有历史 → applyUpdate 恢复
 * - 拉取失败 → 仍允许进房（fail-open），但该房间禁止 flush，防止空文档覆盖新快照
 * - 并发握手同一房间只加载一次（loadingDocs 串行化）
 */
function ensureDoc(docName: string): Promise<Y.Doc> {
  const existing = docs.get(docName);
  if (existing) return Promise.resolve(existing);
  const inflight = loadingDocs.get(docName);
  if (inflight) return inflight;

  const task = (async () => {
    const loaded = await loadLatestSnapshot(docName);
    const current = docs.get(docName);
    if (current) return current;
    const doc = new Y.Doc();
    if (loaded.ok && loaded.bytes && loaded.bytes.length > 0) {
      // 监听器挂载前恢复：不触发广播、不置 dirty
      Y.applyUpdate(doc, loaded.bytes, 'snapshot-restore');
    }
    initDoc(docName, doc);
    docs.set(docName, doc);
    startRoomMeta(docName, loaded.ok);
    if (!loaded.ok) {
      console.error(`[YjsWS] room=${docName}: snapshot load failed, flush disabled until reload`);
    }
    return doc;
  })().finally(() => {
    loadingDocs.delete(docName);
  });
  loadingDocs.set(docName, task);
  return task;
}

/** 落库一次；返回是否无需再写（干净/被禁用）或写成功，false = 写失败需重试 */
async function flushRoom(docName: string): Promise<boolean> {
  const doc = docs.get(docName);
  const meta = roomMeta.get(docName);
  if (!doc || !meta) return true;
  if (!meta.hydrated || !meta.dirty) return true;
  if (meta.flushing) return false;
  meta.flushing = true;
  try {
    const bytes = Y.encodeStateAsUpdate(doc);
    await saveSnapshot(docName, bytes);
    const recovered = meta.failCount > 0;
    meta.dirty = false;
    meta.failCount = 0;
    if (recovered) pushSnapshotStatus(doc, 0, 0);
    return true;
  } catch (err) {
    meta.failCount += 1;
    console.error(
      `[YjsWS] snapshot flush failed room=${docName} attempt=${meta.failCount}:`,
      err instanceof Error ? err.message : String(err)
    );
    pushSnapshotStatus(doc, 1, meta.failCount);
    return false;
  } finally {
    meta.flushing = false;
  }
}

/** 快照状态帧（type 4）：state 0=恢复 1=重试中；仅推教师连接 */
function pushSnapshotStatus(doc: Y.Doc, state: number, attempt: number): void {
  const conns = (doc as any).conns as Map<WebSocket, Set<unknown>> | undefined;
  if (!conns || conns.size === 0) return;
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSnapshotStatus);
  encoding.writeVarUint(encoder, state);
  encoding.writeVarUint(encoder, attempt);
  const frame = encoding.toUint8Array(encoder);
  for (const [conn] of conns) {
    const meta = connMeta.get(conn);
    if (meta?.role === TEACHER_ROLE && conn.readyState === 1) {
      try {
        conn.send(frame);
      } catch {
        // 发送失败不阻塞 flush 流程
      }
    }
  }
}

function scheduleEmptyCleanup(docName: string): void {
  const meta = roomMeta.get(docName);
  const doc = docs.get(docName);
  if (!meta || !doc) return;
  if (((doc as any).conns?.size ?? 0) > 0) return;
  if (meta.graceTimer) return;
  meta.graceTimer = setTimeout(() => {
    meta.graceTimer = undefined;
    void cleanupRoom(docName);
  }, SNAPSHOT_EMPTY_GRACE_MS);
  meta.graceTimer.unref?.();
}

function cancelEmptyCleanup(docName: string): void {
  const meta = roomMeta.get(docName);
  if (meta?.graceTimer) {
    clearTimeout(meta.graceTimer);
    meta.graceTimer = undefined;
  }
}

/**
 * 空房清理（D7）：grace 到期后先 flush 再销毁（先快照后清理，评审 P0#1）。
 * flush 失败 → 保留内存 + 退避重试，绝不先删后存。
 */
async function cleanupRoom(docName: string): Promise<void> {
  const doc = docs.get(docName);
  const meta = roomMeta.get(docName);
  if (!doc || !meta) return;
  if (((doc as any).conns?.size ?? 0) > 0) return;
  const flushed = await flushRoom(docName);
  if (((doc as any).conns?.size ?? 0) > 0) return;
  if (!flushed) {
    meta.retryTimer = setTimeout(() => {
      meta.retryTimer = undefined;
      void cleanupRoom(docName);
    }, SNAPSHOT_FAIL_RETRY_MS);
    meta.retryTimer.unref?.();
    return;
  }
  teardownRoom(docName);
}

function teardownRoom(docName: string): void {
  const doc = docs.get(docName);
  const meta = roomMeta.get(docName);
  if (!meta) return;
  clearInterval(meta.interval);
  if (meta.graceTimer) clearTimeout(meta.graceTimer);
  if (meta.retryTimer) clearTimeout(meta.retryTimer);
  roomMeta.delete(docName);
  docs.delete(docName);
  if (doc) {
    try {
      ((doc as any).awareness as { destroy?: () => void } | undefined)?.destroy?.();
    } catch {
      // awareness 已随连接清理，忽略
    }
    try {
      doc.destroy();
    } catch {
      // doc 已销毁，忽略
    }
  }
  console.log(`[YjsWS] room=${docName} released (snapshot persisted)`);
}

/** 关停/测试用：并行 flush 全部脏房间，单房间失败不影响其他房间 */
async function flushAllRooms(): Promise<void> {
  await Promise.allSettled([...roomMeta.keys()].map(name => flushRoom(name)));
}

function send(_doc: Y.Doc, conn: WebSocket, m: Uint8Array) {
  if (conn.readyState !== 1) {
    closeConn(_doc, conn);
    return;
  }
  try {
    conn.send(m);
  } catch {
    closeConn(_doc, conn);
  }
}

function closeConn(doc: Y.Doc, conn: WebSocket) {
  const conns = (doc as any).conns as Map<WebSocket, Set<number>> | undefined;
  const controlledIds = conns?.get(conn);
  conns?.delete(conn);
  const meta = connMeta.get(conn);
  connMeta.delete(conn);
  const awareness = (doc as any).awareness;
  if (awareness && controlledIds && controlledIds.size > 0) {
    awarenessProtocol.removeAwarenessStates(awareness, Array.from(controlledIds), null);
  }
  if (meta && (conns?.size ?? 0) === 0) {
    scheduleEmptyCleanup(meta.docName);
  }
}

function messageListener(conn: WebSocket, doc: Y.Doc, message: Uint8Array) {
  try {
    const dec = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(dec);

    if (messageType === messageSync) {
      // D8 写权限过滤：非教师丢弃 syncStep2/update（防学生直写污染快照），放行 syncStep1
      const meta = connMeta.get(conn);
      if (!meta?.canWrite) {
        const probe = decoding.createDecoder(message);
        decoding.readVarUint(probe);
        if (decoding.readVarUint(probe) !== SYNC_STEP1) return;
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.readSyncMessage(dec, encoder, doc, conn);
      if (encoding.length(encoder) > 1) {
        send(doc, conn, encoding.toUint8Array(encoder));
      }
    } else if (messageType === messageAwareness) {
      const data = decoding.readVarUint8Array(dec);
      awarenessProtocol.applyAwarenessUpdate((doc as any).awareness, data, conn);
    }
  } catch (err) {
    console.error('[YjsWS] Message parse error:', err);
  }
}

async function handleYjsConnection(connection: WebSocket, req: http.IncomingMessage) {
  const url = new URL(req.url!, `http://${req.headers.host}`);

  const token = url.searchParams.get('token');
  if (!token) {
    connection.close(YjsClose.SESSION_INVALID, 'Token required');
    return;
  }
  const payload = verifyToken(token, JWT_SECRET);
  if (!payload) {
    connection.close(YjsClose.SESSION_INVALID, 'Invalid token');
    return;
  }

  // Buffer frames that arrive while the async session check is in flight and
  // replay them once the doc is attached, so early sync messages are not lost.
  const pending: Uint8Array[] = [];
  let doc: Y.Doc | null = null;
  connection.on('message', (message: Buffer | ArrayBuffer) => {
    const bytes = new Uint8Array(message);
    if (!doc) {
      pending.push(bytes);
      return;
    }
    messageListener(connection, doc, bytes);
  });

  const sessionState = await validateSession(redis, payload.sub, payload.sid, err =>
    console.error(
      '[YjsWS] session check fail-open:',
      err instanceof Error ? err.message : String(err)
    )
  );
  if (sessionState === 'kicked') {
    connection.close(YjsClose.SESSION_KICKED, 'Session replaced by another login');
    return;
  }
  if (sessionState === 'expired') {
    connection.close(YjsClose.SESSION_INVALID, 'Session expired');
    return;
  }
  if (connection.readyState !== WebSocket.OPEN) return;

  const docName = url.searchParams.get('roomId') || 'default';

  // D8 房间成员校验：非成员直接 4403；校验不可用（未启用/故障）时退回 JWT 角色
  const access = await checkRoomAccess(docName, payload.sub);
  if (access && !access.allowed) {
    connection.close(YjsClose.NOT_IN_ROOM, 'Not a room member');
    return;
  }
  if (connection.readyState !== WebSocket.OPEN) return;
  const role = access ? (access.isTeacher ? TEACHER_ROLE : STUDENT_ROLE) : payload.role;
  const canWrite = role === TEACHER_ROLE;

  doc = await ensureDoc(docName);
  const liveDoc = doc;
  (liveDoc as any).conns = (liveDoc as any).conns || new Map();
  (liveDoc as any).conns.set(connection, new Set());
  connMeta.set(connection, {
    docName,
    authUserId: payload.sub,
    sid: payload.sid,
    role,
    canWrite
  });

  connection.binaryType = 'arraybuffer';

  connection.on('close', () => {
    closeConn(liveDoc, connection);
  });

  if (connection.readyState !== WebSocket.OPEN) {
    // 加载期间对端已断开：清理本连接并让空房流程接管
    closeConn(liveDoc, connection);
    return;
  }
  cancelEmptyCleanup(docName);

  for (const bytes of pending) messageListener(connection, liveDoc, bytes);

  // Send sync step 1
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, liveDoc);
  send(liveDoc, connection, encoding.toUint8Array(encoder));

  // Send current awareness states
  const awareness = (liveDoc as any).awareness;
  if (awareness) {
    const states = awareness.getStates();
    if (states.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, messageAwareness);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(states.keys()))
      );
      send(liveDoc, connection, encoding.toUint8Array(awarenessEncoder));
    }
  }

  // Send sync step 2
  const encoder2 = encoding.createEncoder();
  encoding.writeVarUint(encoder2, messageSync);
  syncProtocol.writeSyncStep2(encoder2, liveDoc);
  send(liveDoc, connection, encoding.toUint8Array(encoder2));
}

const app = new Koa();
const server = http.createServer(app.callback());
const wss = new WebSocketServer({ server });

app.use(async ctx => {
  ctx.body = { status: 'ok', service: 'yjs-ws' };
});

wss.on('connection', (connection, req) => {
  handleYjsConnection(connection, req);
});

const port = Number(process.env.YJS_WS_PORT) || 50055;
server.listen(port, '0.0.0.0', () => {
  console.log(`Yjs WS service on port ${port}`);
});

process.on('SIGTERM', () => {
  console.log('[YjsWS] Shutting down: flushing snapshots...');
  void (async () => {
    // D1：关停前落库全部脏房间；5s 上限防止 gRPC 挂起阻塞退出
    await Promise.race([
      flushAllRooms(),
      new Promise(resolve => setTimeout(resolve, 5000).unref?.())
    ]);
    wss.clients.forEach(client => client.close(1001, 'Server shutting down'));
    server.close(() => process.exit(0));
  })();
});

function roomCount(): number {
  return docs.size;
}

function roomAlive(roomName: string): boolean {
  return docs.has(roomName);
}

export { server, wss, flushAllRooms, roomCount, roomAlive };
