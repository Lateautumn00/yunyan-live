import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import type { Response } from 'express';
import { GRPC_STATUS_MSG, GRPC_STATUS_TO_HTTP } from '@yunyan-live/nest-shared';

/**
 * 把服务层抛出的 RpcException（grpcError）映射为 HTTP 状态码。
 *
 * 业务层沿用 `grpcError(status.X, msg)` 表达 NOT_FOUND / ALREADY_EXISTS / INVALID_ARGUMENT，
 * 此前由网关 `grpcCall` 负责映射；收口为单进程 HTTP 后由本过滤器承担同样职责。
 * 登录停用账号的 FAILED_PRECONDITION 由控制器单独映射为 403。
 */
@Catch(RpcException)
export class RpcExceptionFilter implements ExceptionFilter {
  catch(exception: RpcException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const err = exception.getError() as { code?: number; details?: string; message?: string };
    const grpcCode = typeof err?.code === 'number' ? err.code : -1;
    const status = GRPC_STATUS_TO_HTTP[grpcCode] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      err?.details || err?.message || GRPC_STATUS_MSG[grpcCode] || 'Internal server error';

    response.status(status).json({ code: status, msg: message, data: null });
  }
}
