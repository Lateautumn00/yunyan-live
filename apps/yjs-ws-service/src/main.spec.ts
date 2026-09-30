import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import net from 'node:net';
import jwt from 'jsonwebtoken';
import * as Y from 'yjs';
import { WebSocket as NodeWebSocket } from 'ws';
import { WebsocketProvider } from 'y-websocket';

vi.mock('ioredis', () => {
  class FakeRedis {
    on() {
      return this;
    }
    async get() {
      return process.env.TEST_SESSION_SID ?? null;
    }
    duplicate() {
      return new FakeRedis();
    }
    async subscribe() {
      return 0;
    }
  }
  return { default: FakeRedis };
});

const runId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const providers: WebsocketProvider[] = [];
let port = 0;
let token = '';
let main: typeof import('./main');

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address() as net.AddressInfo;
      const chosen = address.port;
      probe.close(() => resolve(chosen));
    });
  });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitFor(cond: () => boolean, label: string, timeout = 4000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeout) {
      throw new Error(`waitFor timeout after ${timeout}ms: ${label}`);
    }
    await sleep(20);
  }
}

async function untilSynced(provider: WebsocketProvider, timeout = 5000): Promise<void> {
  await waitFor(() => provider.synced, 'provider synced', timeout);
}

function connect(roomId: string, doc: Y.Doc): WebsocketProvider {
  const provider = new WebsocketProvider(`ws://127.0.0.1:${port}`, roomId, doc, {
    connect: true,
    disableBc: true,
    params: { roomId, token },
    WebSocketPolyfill: NodeWebSocket as unknown as typeof WebSocket,
  });
  providers.push(provider);
  return provider;
}

const elementsOf = (doc: Y.Doc): unknown[] => doc.getArray('elements').toArray();

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.TEST_SESSION_SID = 'sid-test';
  port = await freePort();
  process.env.YJS_WS_PORT = String(port);
  token = jwt.sign({ sub: 'user-test', sid: 'sid-test' }, 'test-secret');
  main = await import('./main');
  await waitFor(() => main.server.listening, 'server listening', 5000);
}, 15000);

afterAll(async () => {
  for (const provider of providers.splice(0)) {
    provider.destroy();
  }
  await sleep(300);
  for (const client of main.wss.clients) client.terminate();
  await new Promise<void>((resolve) => main.wss.close(() => resolve()));
  await new Promise<void>((resolve) => main.server.close(() => resolve()));
}, 15000);

describe('yjs-ws realtime sync', () => {
  it('T1: after the room empties, reconnect still receives realtime broadcasts', async () => {
    const room = `t1-${runId}`;

    const docA = new Y.Doc();
    const pA = connect(room, docA);
    await untilSynced(pA);
    docA.getArray('elements').push(['shape1']);
    await sleep(400);
    pA.disconnect();
    await sleep(400);

    const docB = new Y.Doc();
    const pB = connect(room, docB);
    await untilSynced(pB);
    await waitFor(() => elementsOf(docB).includes('shape1'), 'B receives history');
    expect(elementsOf(docB)).toContain('shape1');

    const docA2 = new Y.Doc();
    const pA2 = connect(room, docA2);
    await untilSynced(pA2);
    expect(elementsOf(docA2)).toContain('shape1');
    docA2.getArray('elements').push(['shape2']);
    await waitFor(() => elementsOf(docB).includes('shape2'), 'B receives realtime update');
  }, 20000);

  it('T2: laser awareness is relayed to other clients in realtime', async () => {
    const room = `t2-${runId}`;

    const docA = new Y.Doc();
    const pA = connect(room, docA);
    await untilSynced(pA);
    const docB = new Y.Doc();
    const pB = connect(room, docB);
    await untilSynced(pB);

    pA.awareness.setLocalStateField('laser', { x: 1, y: 2 });
    await waitFor(
      () => pB.awareness.getStates().get(docA.clientID)?.laser?.x === 1,
      'B receives laser awareness',
    );
  }, 20000);

  it('T3: awareness of a disconnected client is removed server-side and broadcast', async () => {
    const room = `t3-${runId}`;

    const docA = new Y.Doc();
    const pA = connect(room, docA);
    await untilSynced(pA);
    const docB = new Y.Doc();
    const pB = connect(room, docB);
    await untilSynced(pB);

    pA.awareness.setLocalStateField('laser', { x: 9, y: 9 });
    await waitFor(
      () => pB.awareness.getStates().get(docA.clientID)?.laser?.x === 9,
      'B receives laser awareness',
    );

    pA.destroy();
    await sleep(400);
    await waitFor(
      () => !pB.awareness.getStates().has(docA.clientID),
      'stale awareness removed after graceful disconnect',
    );
  }, 20000);

  it('T4: awareness of an abruptly terminated client is cleaned up server-side', async () => {
    const room = `t4-${runId}`;

    const docA = new Y.Doc();
    const pA = connect(room, docA);
    await untilSynced(pA);
    const docB = new Y.Doc();
    const pB = connect(room, docB);
    await untilSynced(pB);

    pA.awareness.setLocalStateField('laser', { x: 5, y: 5 });
    await waitFor(
      () => pB.awareness.getStates().get(docA.clientID)?.laser?.x === 5,
      'B receives laser awareness',
    );

    pA.shouldConnect = false;
    const rawWs = pA.ws as unknown as { terminate?: () => void };
    rawWs.terminate?.();
    await sleep(400);
    await waitFor(
      () => !pB.awareness.getStates().has(docA.clientID),
      'stale awareness removed after abrupt disconnect',
    );
  }, 20000);
});
