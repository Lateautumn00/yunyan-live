/* eslint-disable @typescript-eslint/no-explicit-any */
import Koa from 'koa';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { URL } from 'url';
import * as Y from 'yjs';
import * as jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import { YjsClose } from '@yunyan-live/types';
import { subscribeKick, validateSession } from '@yunyan-live/nest-shared';

dotenv.config();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const syncProtocol = require('y-protocols/sync');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const awarenessProtocol = require('y-protocols/awareness');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const encoding = require('lib0/encoding');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const decoding = require('lib0/decoding');

const messageSync = 0;
const messageAwareness = 1;

const JWT_SECRET = process.env.JWT_SECRET ?? '';
if (!JWT_SECRET) {
  console.error('JWT_SECRET is not set. Copy .env.example to .env and set a strong secret.');
  process.exit(1);
}

// y-websocket stops reconnecting on close codes 4400-4499 and emits a terminal
// `closed` event, so every unrecoverable auth failure must use YjsClose (44xx).

interface ConnMeta {
  docName: string;
  authUserId?: string;
  sid?: string;
}

const docs = new Map<string, Y.Doc>();
const connMeta = new WeakMap<WebSocket, ConnMeta>();

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
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
      console.error('[YjsWS] Redis subscriber error:', err instanceof Error ? err.message : String(err));
    } else if (stage === 'subscribe') {
      console.error('[YjsWS] subscribe failed, retrying:', err instanceof Error ? err.message : String(err));
    } else {
      console.error('[YjsWS] bad kick payload:', err);
    }
  },
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

function getYDoc(docName: string): Y.Doc {
  let doc = docs.get(docName);
  if (!doc) {
    doc = new Y.Doc();
    (doc as any).awareness = new awarenessProtocol.Awareness(doc);

    const d = doc;
    d.on('update', (update: Uint8Array, origin: any) => {
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
            awarenessProtocol.encodeAwarenessUpdate(awareness, clients),
          );
          broadcast(
            d,
            encoding.toUint8Array(encoder),
            origin instanceof WebSocket ? origin : null,
          );
        }
      },
    );

    docs.set(docName, doc);
  }
  return doc;
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
  connMeta.delete(conn);
  const awareness = (doc as any).awareness;
  if (awareness && controlledIds && controlledIds.size > 0) {
    awarenessProtocol.removeAwarenessStates(awareness, Array.from(controlledIds), null);
  }
}

function messageListener(conn: WebSocket, doc: Y.Doc, message: Uint8Array) {
  try {
    const dec = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(dec);

    if (messageType === messageSync) {
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
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
  } catch {
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

  const sessionState = await validateSession(
    redis,
    payload.sub,
    payload.sid as string | undefined,
    (err) => console.error('[YjsWS] session check fail-open:', err instanceof Error ? err.message : String(err)),
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

  doc = getYDoc(docName);
  const liveDoc = doc;
  (liveDoc as any).conns = (liveDoc as any).conns || new Map();
  (liveDoc as any).conns.set(connection, new Set());
  connMeta.set(connection, {
    docName,
    authUserId: payload.sub,
    sid: payload.sid as string | undefined,
  });

  connection.binaryType = 'arraybuffer';

  connection.on('close', () => {
    closeConn(liveDoc, connection);
  });

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
        awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(states.keys())),
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

app.use(async (ctx) => {
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
  console.log('[YjsWS] Shutting down...');
  wss.clients.forEach((client) => client.close(1001, 'Server shutting down'));
  server.close(() => process.exit(0));
});

export { server, wss };
