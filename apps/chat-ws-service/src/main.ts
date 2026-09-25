import Koa from 'koa';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { URL } from 'url';
import * as jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

interface WsClient {
  ws: WebSocket;
  userId: string;
  nickName: string;
  roomId: string;
}

interface LiveMessage {
  type: string;
  data?: Record<string, unknown>;
}

const rooms = new Map<string, Map<string, WsClient>>();
const clientIds = new WeakMap<WebSocket, string>();
const whiteboardStates = new Map<string, string>();

const JWT_SECRET = process.env.JWT_SECRET ?? '';
if (!JWT_SECRET) {
  console.error('JWT_SECRET is not set. Copy .env.example to .env and set a strong secret.');
  process.exit(1);
}

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

function registerClient(client: WebSocket, roomId: string, userId: string, nickName: string): string {
  const clientId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  clientIds.set(client, clientId);
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }
  rooms.get(roomId)!.set(clientId, { ws: client, userId, nickName, roomId });
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
        sendTo(client, {
          type: 'msg',
          data: { liveMsg: { liveNums: rooms.get(roomId)?.size ?? 0, forbid: 0 } },
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
          data: { liveMsg: { msg: storedMsg } },
        });
        break;
      }
      case 'over':
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

function handleConnection(connection: WebSocket, req: http.IncomingMessage) {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  if (!token) {
    connection.close(4001, 'Token required');
    return;
  }

  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    connection.close(4001, 'Invalid token');
    return;
  }

  const roomId = url.searchParams.get('roomId') || 'default';
  const userId = url.searchParams.get('liveUserId') || 'anonymous';
  const nickName = url.searchParams.get('nickName') || '';

  const clientId = registerClient(connection, roomId, userId, nickName);

  sendTo(connection, { type: 'pong' });
  sendTo(connection, {
    type: 'msg',
    data: { liveMsg: { liveNums: rooms.get(roomId)!.size, forbid: 0 } },
  });

  console.log(`[ChatWS] Connected: roomId=${roomId}, userId=${userId}, id=${clientId}`);

  connection.on('message', (raw: Buffer | string) => {
    handleMessage(connection, raw.toString());
  });

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

app.use(async (ctx) => {
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
  wss.clients.forEach((client) => client.close(1001, 'Server shutting down'));
  server.close(() => process.exit(0));
});
