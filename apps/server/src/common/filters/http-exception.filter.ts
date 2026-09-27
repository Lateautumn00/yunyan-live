import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { status as GrpcStatus } from '@grpc/grpc-js';

const GRPC_STATUS_MAP: Record<number, number> = {
  [GrpcStatus.NOT_FOUND]: 404,
  [GrpcStatus.UNAUTHENTICATED]: 401,
  [GrpcStatus.PERMISSION_DENIED]: 403,
  [GrpcStatus.ALREADY_EXISTS]: 409,
  [GrpcStatus.INVALID_ARGUMENT]: 400,
  [GrpcStatus.INTERNAL]: 500,
  [GrpcStatus.UNAVAILABLE]: 503,
};

const GRPC_MSG_MAP: Record<number, string> = {
  [GrpcStatus.NOT_FOUND]: 'Not found',
  [GrpcStatus.UNAUTHENTICATED]: 'Unauthorized',
  [GrpcStatus.PERMISSION_DENIED]: 'Forbidden',
  [GrpcStatus.ALREADY_EXISTS]: 'Conflict',
  [GrpcStatus.INVALID_ARGUMENT]: 'Bad request',
  [GrpcStatus.INTERNAL]: 'Internal server error',
  [GrpcStatus.UNAVAILABLE]: 'Service unavailable',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 500;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      const resObj = typeof res === 'string' ? null : (res as Record<string, unknown>);
      message =
        typeof res === 'string'
          ? res
          : resObj?.message?.toString() || exception.message;

      const explicitCode = resObj?.code;
      if (typeof explicitCode === 'number') {
        // e.g. session kicked: HttpException({ code: 4002, message }, 401)
        code = explicitCode;
      } else {
        switch (status) {
          case 401: code = 4001; break;
          case 404: code = 4003; break;
          case 409: code = 4004; break;
          default: code = status;
        }
      }
    } else if (exception && typeof exception === 'object' && 'code' in exception) {
      const grpcError = exception as { code: number; details?: string; message?: string };
      const grpcCode = typeof grpcError.code === 'number' ? grpcError.code : -1;
      const mapped = GRPC_STATUS_MAP[grpcCode];
      if (mapped) {
        status = mapped;
        code = mapped;
      }
      message = grpcError.details || grpcError.message || GRPC_MSG_MAP[grpcCode] || 'Internal server error';
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    console.error(`[ExceptionFilter] ${exception?.constructor?.name}: ${message}`);

    response.status(status).json({
      code,
      msg: message,
      data: null,
    });
  }
}
