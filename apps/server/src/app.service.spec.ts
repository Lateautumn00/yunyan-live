import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const netMock = vi.hoisted(() => {
  class FakeSocket {
    handlers: Record<string, Array<() => void>> = {};
    destroyed = false;
    connectArgs: [number, string] | null = null;
    timeoutMs = 0;

    constructor() {
      sockets.push(this);
    }

    setTimeout(ms: number) {
      this.timeoutMs = ms;
      return this;
    }

    once(event: string, cb: () => void) {
      (this.handlers[event] ??= []).push(cb);
      return this;
    }

    connect(port: number, host: string) {
      this.connectArgs = [port, host];
      return this;
    }

    destroy() {
      this.destroyed = true;
    }

    emit(event: string) {
      for (const cb of this.handlers[event] ?? []) cb();
    }
  }
  const sockets: FakeSocket[] = [];
  return {
    FakeSocket,
    sockets,
    reset() {
      sockets.length = 0;
    }
  };
});

vi.mock('net', () => ({ Socket: netMock.FakeSocket }));

import { Socket } from 'net';
import { AppService } from './app.service';

beforeEach(() => {
  netMock.reset();
  vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppService.getHealth', () => {
  it('返回固定服务名与时间戳', () => {
    const service = new AppService();
    expect(service.getHealth()).toEqual({
      status: 'ok',
      service: '@yunyan-live/server',
      timestamp: 1700000000000
    });
  });
});

describe('AppService.tcpProbe via getServicesHealth', () => {
  it('全部 connect 成功时整体 ok，并探测固定三端口', async () => {
    expect(Socket).toBe(netMock.FakeSocket);
    const service = new AppService();
    const promise = service.getServicesHealth();
    expect(netMock.sockets).toHaveLength(3);
    expect(netMock.sockets.map(s => s.connectArgs)).toEqual([
      [50051, '127.0.0.1'],
      [50052, '127.0.0.1'],
      [50053, '127.0.0.1']
    ]);
    for (const socket of netMock.sockets) socket.emit('connect');
    await expect(promise).resolves.toEqual({
      status: 'ok',
      service: '@yunyan-live/server',
      timestamp: 1700000000000,
      services: [
        { name: 'auth-service', port: 50051, status: 'ok' },
        { name: 'live-service', port: 50052, status: 'ok' },
        { name: 'mail-service', port: 50053, status: 'ok' }
      ]
    });
    expect(netMock.sockets.every(s => s.destroyed)).toBe(true);
    expect(netMock.sockets[0]?.timeoutMs).toBe(3000);
  });

  it('任一探测失败时整体 degraded', async () => {
    const service = new AppService();
    const promise = service.getServicesHealth();
    netMock.sockets[0]?.emit('connect');
    netMock.sockets[1]?.emit('timeout');
    netMock.sockets[2]?.emit('error');
    const res = await promise;
    expect(res.status).toBe('degraded');
    expect(res.services).toEqual([
      { name: 'auth-service', port: 50051, status: 'ok' },
      { name: 'live-service', port: 50052, status: 'unavailable' },
      { name: 'mail-service', port: 50053, status: 'unavailable' }
    ]);
  });

  it('先 connect 后 error 不会重复 resolve（done 守卫）', async () => {
    const service = new AppService();
    const promise = service.getServicesHealth();
    const first = netMock.sockets[0]!;
    first.emit('connect');
    first.emit('error');
    netMock.sockets[1]?.emit('connect');
    netMock.sockets[2]?.emit('connect');
    const res = await promise;
    expect(res.services[0]?.status).toBe('ok');
  });
});
