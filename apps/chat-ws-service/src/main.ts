import Koa from 'koa';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { URL } from 'url';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import { WsClose } from '@yunyan-live/types';
import {
  requireJwtSecret,
  subscribeForbid,
  subscribeKick,
  readForbid,
  validateSession,
  verifyToken
} from '@yunyan-live/nest-shared';

dotenv.config();

interface WsClient {
  ws: WebSocket;
  userId: string;
  nickName: string;
  roomId: string;
  authUserId?: string;
  sid?: string;
}

interface LiveMessage {
  type: string;
  data?: Record<string, unknown>;
}

const rooms = new Map<string, Map<string, WsClient>>();
const clientIds = new WeakMap<WebSocket, string>();
const whiteboardStates = new Map<string, string>();

const JWT_SECRET = requireJwtSecret();

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

// 禁言状态变更（网关 live/push/updateForbid 写入并 publish）→ 广播给房间内所有客户端
subscribeForbid(
  redis,
  (roomId, status) => {
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
  sid?: string
): string {
  const clientId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  clientIds.set(client, clientId);
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }
  rooms.get(roomId)!.set(clientId, { ws: client, userId, nickName, roomId, authUserId, sid });
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

    switch (msg.type) {
      case 'ping':
        sendTo(client, { type: 'pong' });
        break;
      case 'msg':
        void readForbid(redis, roomId).then(forbid => {
          sendTo(client, {
            type: 'msg',
            data: { liveMsg: { liveNums: rooms.get(roomId)?.size ?? 0, forbid } }
          });
        });
        break;
      case 'bullet':
        broadcast(roomId, raw);
        break;
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
  const userId = url.searchParams.get('liveUserId') || 'anonymous';
  const nickName = url.searchParams.get('nickName') || '';

  const clientId = registerClient(connection, roomId, userId, nickName, payload.sub, payload.sid);

  sendTo(connection, { type: 'pong' });
  const forbid = await readForbid(redis, roomId);
  sendTo(connection, {
    type: 'msg',
    data: { liveMsg: { liveNums: rooms.get(roomId)!.size, forbid } }
  });

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
        }
        console.log(`[ChatWS] Disconnected: roomId=${rid}, id=${cid}`);
        break;
      }
    }
  });
}

const app = new Koa();
const server = http.createServer(app.callback());
const wss = new WebSocketServer({ server });

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
  server.close(() => process.exit(0));
});
