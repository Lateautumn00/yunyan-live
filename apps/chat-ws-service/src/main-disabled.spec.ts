import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';

/**
 * 持久化关闭路径（§4.7 not_configured）：历史链路整体不启用，
 * getHistory → persistence_disabled（终态）；广播与握手行为与现状一致。
 */
const SECRET = 'disabled-spec-secret';
const SID = 'sid-disabled-1';
const PORT = 50175;

process.env.JWT_SECRET = SECRET;
process.env.CHAT_WS_PORT = String(PORT);
process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = '6379';
process.env.DATABASE_URL = '';
process.env.RABBITMQ_URL = '';
process.env.CHAT_HISTORY_TIMEOUT_MS = '';

vi.mock('ioredis', () => {
  class MockRedis {
    get = vi.fn(async (key: string) => (key.startsWith('session:') ? 'sid-disabled-1' : null));
    set = vi.fn(async () => 'OK');
    on = vi.fn(() => undefined);
    subscribe = vi.fn(async () => 0);
    duplicate() {
      return new MockRedis();
    }
  }
  return { default: MockRedis };
});

vi.mock('amqplib', () => ({
  default: { connect: vi.fn(() => new Promise(() => undefined)) }
}));

interface Frame {
  type: string;
  data?: Record<string, unknown>;
  reason?: string;
}

class TestClient {
  readonly received: Frame[] = [];
  private cursor = 0;
  private waiters: Array<{
    pred: (f: Frame) => boolean;
    resolve: (f: Frame) => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(readonly ws: WebSocket) {
    ws.on('message', (raw: Buffer | string) => {
      const frame = JSON.parse(String(raw)) as Frame;
      this.received.push(frame);
      this.waiters = this.waiters.filter(w => {
        if (w.pred(frame)) {
          clearTimeout(w.timer);
          w.resolve(frame);
          return false;
        }
        return true;
      });
    });
  }

  send(obj: unknown) {
    this.ws.send(JSON.stringify(obj));
  }

  async next(type: string, timeoutMs = 3000): Promise<Frame> {
    const scan = (): Frame | undefined => {
      for (let i = this.cursor; i < this.received.length; i += 1) {
        const f = this.received[i];
        if (f.type === type) {
          this.cursor = i + 1;
          return f;
        }
      }
      return undefined;
    };
    const hit = scan();
    if (hit) return hit;
    return new Promise<Frame>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `timeout waiting ${type}; got: ${this.received
              .slice(this.cursor)
              .map(f => f.type)
              .join(',')}`
          )
        );
      }, timeoutMs);
      this.waiters.push({ pred: f => f.type === type, resolve, timer });
    });
  }

  async expectNo(type: string, waitMs = 150): Promise<void> {
    const before = this.received.filter(f => f.type === type).length;
    await new Promise(r => setTimeout(r, waitMs));
    expect(this.received.filter(f => f.type === type)).toHaveLength(before);
  }

  close() {
    this.ws.close();
  }
}

const token = jwt.sign({ sub: 'u-off', email: 'o@x', role: 0, sid: SID }, SECRET);

async function connect(): Promise<TestClient> {
  const qs = new URLSearchParams({
    token,
    roomId: 'r-off',
    liveUserId: 'u1',
    nickName: '路人'
  });
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?${qs}`);
  // 监听必须同步挂上：服务端 pong 可能与 open 同批到达，await 后再挂会丢帧
  const client = new TestClient(ws);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return client;
}

let server: import('http').Server;
let wss: import('ws').WebSocketServer;

beforeAll(async () => {
  const main = await import('./main');
  server = main.server;
  wss = main.wss;
  // WSL/drvfs 下 @yunyan-live/nest-shared 首次加载可达 ~25s（纯 I/O），放宽 hook 超时
}, 90_000);

afterAll(async () => {
  wss.clients.forEach(c => c.terminate());
  (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
  await new Promise<void>(resolve => {
    const guard = setTimeout(() => resolve(), 5000);
    server.close(() => {
      clearTimeout(guard);
      resolve();
    });
  });
}, 30_000);

describe('持久化关闭（§4.7 not_configured）', () => {
  it('握手正常：pong → msg，且不推 history 帧（严禁空 history 覆盖前端状态）', async () => {
    const c = await connect();
    await c.next('pong');
    await c.next('msg');
    await c.expectNo('history', 200);
    c.close();
  });

  it('getHistory → historyError persistence_disabled（终态，前端整段禁用历史）', async () => {
    const c = await connect();
    await c.next('msg');
    c.send({ type: 'getHistory' });
    const err = await c.next('historyError');
    expect(err.data).toEqual({ reason: 'persistence_disabled' });
    c.close();
  });

  it('畸形 cursor 在关闭态同样回 persistence_disabled（开关优先于游标校验）', async () => {
    const c = await connect();
    await c.next('msg');
    c.send({ type: 'getHistory', data: { cursor: 'garbage' } });
    const err = await c.next('historyError');
    expect(err.data).toEqual({ reason: 'persistence_disabled' });
    c.close();
  });

  it('bullet 广播行为与开启态一致（msgId 仍注入，仅不入队）', async () => {
    const c = await connect();
    await c.next('msg');
    c.send({ type: 'bullet', data: { liveMsg: { msg: 'offline' } } });
    const frame = await c.next('bullet');
    const data = frame.data as { msgId: string };
    expect(data.msgId).toMatch(/^[0-9a-f-]{36}$/);
    c.close();
  });

  it('/healthz → status=disabled，mq/pg/depth 全 0/null', async () => {
    const body = (await (await fetch(`http://127.0.0.1:${PORT}/healthz`)).json()) as Record<
      string,
      unknown
    >;
    expect(body).toEqual({ status: 'disabled', mq: 0, pg: 0, queueDepth: null, dlqDepth: null });
  });
});
