import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import type { ExecutionContext } from '@nestjs/common';
import {
  GrpcMetricsInterceptor,
  createServiceMetrics,
  grpcCodeName,
  httpMetricsMiddleware,
  metricsRequestHandler
} from './metrics';

describe('O5 指标基线（monitoring-baseline.md 的可执行断言）', () => {
  it('指标名统一 yunyan_ 前缀 + registry 默认 service label', async () => {
    const m = createServiceMetrics('auth-service');
    m.httpRequests.inc({ method: 'GET', route: '/health', status: '200' });
    const text = await m.registry.metrics();
    expect(text).toContain('yunyan_http_requests_total');
    expect(text).toContain('yunyan_grpc_requests_total');
    expect(text).toContain('yunyan_chat_online_connections');
    expect(text).toContain('yunyan_chat_queue_depth');
    expect(text).toContain('service="auth-service"');
    // process 默认指标同 registry（容器/进程级基础观测）
    expect(text).toContain('process_start_time_seconds');
  });

  it('httpMetricsMiddleware：命中路由记模板，未命中记 unmatched；/metrics 自身不计数', async () => {
    const m = createServiceMetrics('server');
    const mw = httpMetricsMiddleware(m);
    const makeRes = (status: number) => {
      const r = new EventEmitter() as EventEmitter & { statusCode: number };
      r.statusCode = status;
      return r;
    };
    // 每次请求独立 res：finish 监听挂在 res 上，复用会重复计数（测试语义=两次独立请求）
    const res1 = makeRes(500);
    mw(
      {
        method: 'POST',
        baseUrl: '/liveInfo',
        url: '/liveInfo/statistics',
        route: { path: '/statistics' }
      },
      res1,
      () => undefined
    );
    res1.emit('finish');
    const res2 = makeRes(404);
    mw({ method: 'GET', url: '/nope' }, res2, () => undefined);
    res2.emit('finish');
    let metricsSkipped = false;
    mw({ method: 'GET', url: '/metrics' }, makeRes(200), () => {
      metricsSkipped = true;
    });
    expect(metricsSkipped).toBe(true);
    const text = await m.registry.metrics();
    expect(text).toContain(
      'yunyan_http_requests_total{method="POST",route="/liveInfo/statistics",status="500",service="server"} 1'
    );
    expect(text).toContain(
      'yunyan_http_requests_total{method="GET",route="unmatched",status="404",service="server"} 1'
    );
  });

  it('metricsRequestHandler：/metrics 200 + prom 文本类型，其余 404', async () => {
    const m = createServiceMetrics('chat-ws-service');
    const handler = metricsRequestHandler(m);
    const writeHead = vi.fn();
    const end = vi.fn();
    handler({ url: '/metrics' }, { writeHead, end });
    await new Promise(resolve => setImmediate(resolve));
    expect(writeHead).toHaveBeenCalledWith(200, { 'Content-Type': m.registry.contentType });
    expect(end).toHaveBeenCalledWith(expect.stringContaining('yunyan_'));

    const writeHead404 = vi.fn();
    const end404 = vi.fn();
    handler({ url: '/debug/pprof' }, { writeHead: writeHead404, end: end404 });
    expect(writeHead404).toHaveBeenCalledWith(404, { 'Content-Type': 'text/plain' });
  });

  it('grpcCodeName：RpcException 各形态与裸错误码映射状态名', () => {
    expect(grpcCodeName(new RpcException({ code: 4, message: 'deadline' }))).toBe(
      'DEADLINE_EXCEEDED'
    );
    expect(grpcCodeName(new RpcException({ code: 13 }))).toBe('INTERNAL');
    expect(grpcCodeName({ code: 14 })).toBe('UNAVAILABLE');
    expect(grpcCodeName(new Error('boom'))).toBe('UNKNOWN');
  });

  it('GrpcMetricsInterceptor：成功记 OK、失败记状态名，非 rpc 上下文直通', async () => {
    const m = createServiceMetrics('live-service');
    const interceptor = new GrpcMetricsInterceptor(m);
    const rpcCtx = {
      getType: () => 'rpc',
      switchToRpc: () => ({
        getContext: () => ({ getRpcMethodName: () => '/live.Live/GetRoomInfo' })
      })
    } as unknown as ExecutionContext;
    const nextOk = { handle: () => of({ ok: true }) };
    await new Promise(resolve => {
      interceptor
        .intercept(rpcCtx, nextOk)
        .subscribe({ complete: () => resolve(undefined), error: () => resolve(undefined) });
    });
    await new Promise<void>(resolve => {
      interceptor
        .intercept(rpcCtx, {
          handle: () => throwError(() => ({ code: 14 }))
        })
        .subscribe({ error: () => resolve() });
    });
    const text = await m.registry.metrics();
    expect(text).toContain(
      'yunyan_grpc_requests_total{rpc="GetRoomInfo",code="OK",service="live-service"} 1'
    );
    expect(text).toContain(
      'yunyan_grpc_requests_total{rpc="GetRoomInfo",code="UNAVAILABLE",service="live-service"} 1'
    );

    const passthrough = interceptor.intercept(
      { getType: () => 'http' } as unknown as ExecutionContext,
      { handle: () => of('x') }
    );
    await new Promise(resolve => {
      passthrough.subscribe({
        complete: () => resolve(undefined),
        error: () => resolve(undefined)
      });
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
