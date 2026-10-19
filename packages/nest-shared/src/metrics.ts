import http from 'http';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Observable, catchError, throwError, tap } from 'rxjs';
import { Counter, Gauge, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * O5 监控最小集 —— 指标基线见 docs/research/monitoring-baseline.md。
 * 硬约定（防 O7 二次返工）：
 * - 指标名统一 `yunyan_` 前缀，不把服务名嵌进指标名
 * - registry 默认 label `service` = 服务短名，与未来结构化日志的 `service` 字段同值域
 * - 禁高基数 label（user_id / room_id / trace 级标识不得作 label）
 */
export interface ServiceMetrics {
  service: string;
  registry: Registry;
  /** gateway HTTP：{method, route, status}；route 为路由模板，未命中记 unmatched */
  httpRequests: Counter<'method' | 'route' | 'status'>;
  /** gRPC 服务端：{rpc, code}；code 为 grpc 状态名（OK/DEADLINE_EXCEEDED…） */
  grpcRequests: Counter<'rpc' | 'code'>;
  /** chat-ws 当前在线连接数（跨房间求和） */
  chatOnlineConnections: Gauge<string>;
  /** chat-ws 队列深度 {queue=work|dlq}；persistence 关闭时 series 不出现 */
  chatQueueDepth: Gauge<'queue'>;
  /** live-service 审计队列深度 {queue=work|dlq}；S12 consumer 未启动时 series 不出现 */
  auditQueueDepth: Gauge<'queue'>;
  /** mail-service 通知结果计数 {kind, result=sent|skipped_dedupe|skipped_rate|failed}；F9 */
  notifyTotal: Counter<'kind' | 'result'>;
  /** mail-service 通知队列深度 {queue=work|dlq}；F9 consumer 未启动时 series 不出现 */
  notifyQueueDepth: Gauge<'queue'>;
}

export function createServiceMetrics(service: string): ServiceMetrics {
  const registry = new Registry();
  registry.setDefaultLabels({ service });
  collectDefaultMetrics({ register: registry });
  const httpRequests = new Counter({
    name: 'yunyan_http_requests_total',
    help: 'Total handled HTTP requests by method, route template and status code',
    labelNames: ['method', 'route', 'status'],
    registers: [registry]
  });
  const grpcRequests = new Counter({
    name: 'yunyan_grpc_requests_total',
    help: 'Total handled gRPC requests by method and status code name',
    labelNames: ['rpc', 'code'],
    registers: [registry]
  });
  const chatOnlineConnections = new Gauge({
    name: 'yunyan_chat_online_connections',
    help: 'Current websocket connections across chat rooms',
    registers: [registry]
  });
  const chatQueueDepth = new Gauge({
    name: 'yunyan_chat_queue_depth',
    help: 'Current RabbitMQ queue depth reported by chat-ws (queue=work|dlq)',
    labelNames: ['queue'],
    registers: [registry]
  });
  const auditQueueDepth = new Gauge({
    name: 'yunyan_audit_queue_depth',
    help: 'Current RabbitMQ audit queue depth reported by live-service (queue=work|dlq)',
    labelNames: ['queue'],
    registers: [registry]
  });
  const notifyTotal = new Counter({
    name: 'yunyan_notify_total',
    help: 'Total notification emails by kind and result (sent|skipped_dedupe|skipped_rate|failed)',
    labelNames: ['kind', 'result'],
    registers: [registry]
  });
  const notifyQueueDepth = new Gauge({
    name: 'yunyan_notify_queue_depth',
    help: 'Current RabbitMQ notify queue depth reported by mail-service (queue=work|dlq)',
    labelNames: ['queue'],
    registers: [registry]
  });
  return {
    service,
    registry,
    httpRequests,
    grpcRequests,
    chatOnlineConnections,
    chatQueueDepth,
    auditQueueDepth,
    notifyTotal,
    notifyQueueDepth
  };
}

type MetricsRequestLike = {
  method?: string;
  baseUrl?: string;
  url?: string;
  route?: { path?: string };
};

type MetricsResponseLike = {
  statusCode: number;
  on(event: 'finish', listener: () => void): unknown;
};

/** gateway 请求计数中间件（express 之外的 (req,res,next) 结构也可用）；/metrics 自身不计数 */
export function httpMetricsMiddleware(metrics: ServiceMetrics) {
  return (req: MetricsRequestLike, res: MetricsResponseLike, next: () => void): void => {
    const path = (req.url ?? '').split('?')[0];
    if (path === '/metrics' || path.startsWith('/metrics/')) {
      next();
      return;
    }
    res.on('finish', () => {
      const route = req.route?.path ? `${req.baseUrl ?? ''}${req.route.path}` : 'unmatched';
      metrics.httpRequests.inc({
        method: req.method ?? 'UNKNOWN',
        route,
        status: String(res.statusCode)
      });
    });
    next();
  };
}

type MetricsHttpResponseLike = {
  writeHead(status: number, headers: Record<string, string>): unknown;
  end(chunk?: string): unknown;
};

/**
 * /metrics 请求处理器（node 风格 (req,res)；express mount 到 /metrics 后 url 被剥成 `/`，
 * 故 `/` 与 `/metrics` 都视为命中）。
 */
export function metricsRequestHandler(metrics: ServiceMetrics) {
  return (req: { url?: string }, res: MetricsHttpResponseLike): void => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== '/' && path !== '/metrics' && !path.startsWith('/metrics/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    void metrics.registry
      .metrics()
      .then(body => {
        res.writeHead(200, { 'Content-Type': metrics.registry.contentType });
        res.end(body);
      })
      .catch(() => {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('metrics error');
      });
  };
}

/** gRPC 微服务无 HTTP listener：独立轻量端口暴露 /metrics（auth 9464 / live 9465） */
export function startMetricsServer(metrics: ServiceMetrics, port: number): http.Server {
  const server = http.createServer(metricsRequestHandler(metrics));
  server.listen(port, '0.0.0.0', () => {
    console.log(`[metrics] ${metrics.service} exposing /metrics on :${port}`);
  });
  return server;
}

/** grpc 数字状态码 → 状态名（OK/INTERNAL/…）；未知回落 UNKNOWN */
export function grpcCodeName(err: unknown): string {
  let code: number | undefined;
  if (err instanceof RpcException) {
    const payload: unknown = err.getError();
    if (typeof payload === 'number') {
      code = payload;
    } else if (
      payload &&
      typeof payload === 'object' &&
      'code' in payload &&
      typeof (payload as { code: unknown }).code === 'number'
    ) {
      code = (payload as { code: number }).code;
    }
    // 其余形态（纯字符串 message 等）code 保持 undefined → UNKNOWN
  } else if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'number'
  ) {
    code = (err as { code: number }).code;
  }
  if (code === undefined) return 'UNKNOWN';
  const name = Object.keys(GrpcStatus).find(
    key => !/^\d+$/.test(key) && GrpcStatus[key as keyof typeof GrpcStatus] === code
  );
  return name ?? String(code);
}

/** gRPC 服务端请求计数：成功 OK，失败按 grpc 状态名（结构化日志接入 O7 后可按 rpc 名串联） */
@Injectable()
export class GrpcMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: ServiceMetrics) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'rpc') return next.handle();
    let rpc = 'unknown';
    try {
      const rpcContext = context.switchToRpc().getContext() as {
        getRpcMethodName?: () => string;
      };
      const full = rpcContext.getRpcMethodName?.() ?? '';
      rpc = full.split('/').filter(Boolean).pop() ?? 'unknown';
    } catch {
      // context 缺失（测试或非标准 transport）时保持 unknown
    }
    return next.handle().pipe(
      tap(() => {
        this.metrics.grpcRequests.inc({ rpc, code: 'OK' });
      }),
      catchError((err: unknown) => {
        this.metrics.grpcRequests.inc({ rpc, code: grpcCodeName(err) });
        return throwError(() => err);
      })
    );
  }
}
