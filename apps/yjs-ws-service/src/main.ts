/* eslint-disable @typescript-eslint/no-explicit-any */
import Koa from 'koa';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { URL } from 'url';
import * as Y from 'yjs';
import * as jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

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

const docs = new Map<string, Y.Doc>();
const connMeta = new WeakMap<WebSocket, string>();

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
  const docName = connMeta.get(conn);
  if (docName) {
    awarenessProtocol.removeAwarenessStates((doc as any).awareness, [conn], null);
  }
  connMeta.delete(conn);
  (doc as any).conns?.delete(conn);
  if ((doc as any).conns?.size === 0 && doc !== docs.get((doc as any).name)) {
    docs.delete((doc as any).name);
    doc.destroy();
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

      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, messageAwareness);
      encoding.writeVarUint8Array(awarenessEncoder, data);
      broadcast(doc, encoding.toUint8Array(awarenessEncoder), conn);
    }
  } catch (err) {
    console.error('[YjsWS] Message parse error:', err);
  }
}

function handleYjsConnection(connection: WebSocket, req: http.IncomingMessage) {
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

  const docName = url.searchParams.get('roomId') || 'default';

  const doc = getYDoc(docName);
  (doc as any).conns = (doc as any).conns || new Map();
  (doc as any).conns.set(connection, new Set());
  connMeta.set(connection, docName);

  connection.binaryType = 'arraybuffer';

  connection.on('message', (message: Buffer | ArrayBuffer) => {
    messageListener(connection, doc, new Uint8Array(message));
  });

  connection.on('close', () => {
    closeConn(doc, connection);
  });

  // Send sync step 1
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  send(doc, connection, encoding.toUint8Array(encoder));

  // Send current awareness states
  const awareness = (doc as any).awareness;
  if (awareness) {
    const states = awareness.getStates();
    if (states.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, messageAwareness);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(states.keys())),
      );
      send(doc, connection, encoding.toUint8Array(awarenessEncoder));
    }
  }

  // Send sync step 2
  const encoder2 = encoding.createEncoder();
  encoding.writeVarUint(encoder2, messageSync);
  syncProtocol.writeSyncStep2(encoder2, doc);
  send(doc, connection, encoding.toUint8Array(encoder2));
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
