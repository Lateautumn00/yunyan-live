import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { grpcError } from './error';
import { UserCallVerifyResult, verifyUserCall } from './metadata';

const PASS: ReadonlySet<UserCallVerifyResult> = new Set(['ok', 'absent', 'no-secret']);

/**
 * 从 RPC ExecutionContext 中防御性取出 gRPC Metadata。
 * 一元调用：switchToRpc().getContext() 即 call.metadata（server-grpc.js:158）；
 * 流式/异常布局回退取 .metadata；取不到视为无 metadata（按 absent 放行）。
 */
function metadataFrom(context: ExecutionContext): Metadata | undefined {
  const ctx = context.switchToRpc().getContext() as unknown;
  if (ctx && typeof (ctx as Metadata).get === 'function') return ctx as Metadata;
  const inner = (ctx as { metadata?: unknown } | null | undefined)?.metadata;
  if (inner && typeof (inner as Metadata).get === 'function') return inner as Metadata;
  return undefined;
}

/**
 * GAP-S10b gRPC 验签拦截器：携带 user-id 的调用必须携带合法 HMAC 签名，
 * 否则拒绝为 UNAUTHENTICATED（status-map → 401）。
 * 实现为 NestInterceptor 而非 Guard：Guard 先于拦截器执行，拒绝会被
 * GrpcMetricsInterceptor（注册在外层）漏计；interceptor 才能计入
 * yunyan_grpc_requests_total{code="UNAUTHENTICATED"}。
 * 注册顺序：metrics 在前（外层），本 guard 在后（内层）。
 */
@Injectable()
export class GrpcAuthGuard implements NestInterceptor {
  private readonly secret: string | undefined;

  constructor(secret: string | undefined = process.env.GRPC_SHARED_SECRET) {
    this.secret = secret;
    if (!secret) {
      console.warn('[GAP-S10b] GRPC_SHARED_SECRET 未配置，gRPC 验签已停用（仅限本地开发）');
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'rpc') return next.handle();
    const result = verifyUserCall(metadataFrom(context), this.secret);
    if (PASS.has(result)) return next.handle();
    return throwError(() =>
      grpcError(GrpcStatus.UNAUTHENTICATED, `gRPC metadata 验签失败: ${result}`)
    );
  }
}
