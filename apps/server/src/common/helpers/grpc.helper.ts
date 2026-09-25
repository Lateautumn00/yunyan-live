import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { firstValueFrom, Observable } from 'rxjs';
import { status as GrpcStatus } from '@grpc/grpc-js';

const GRPC_MAP: Record<number, HttpStatus> = {
  [GrpcStatus.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [GrpcStatus.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED,
  [GrpcStatus.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
  [GrpcStatus.ALREADY_EXISTS]: HttpStatus.CONFLICT,
  [GrpcStatus.INVALID_ARGUMENT]: HttpStatus.BAD_REQUEST,
  [GrpcStatus.INTERNAL]: HttpStatus.INTERNAL_SERVER_ERROR,
  [GrpcStatus.UNAVAILABLE]: HttpStatus.BAD_GATEWAY,
};

const logger = new Logger('GrpcHelper');

export async function grpcCall<T>(observable: Observable<T>): Promise<T> {
  try {
    return await firstValueFrom(observable);
  } catch (err: unknown) {
    const e = err as { message?: string; stack?: string; code?: number; details?: string; error?: { code?: number; message?: string; details?: string } };
    logger.error(`gRPC error: ${e?.message || e}`, e?.stack);

    if (e instanceof HttpException) throw e;

    const grpcCode = e?.code ?? e?.error?.code ?? -1;
    const details = e?.details || e?.error?.details || e?.message || e?.error?.message || '服务异常';
    const httpStatus = GRPC_MAP[grpcCode] || HttpStatus.INTERNAL_SERVER_ERROR;

    throw new HttpException(details, httpStatus);
  }
}
