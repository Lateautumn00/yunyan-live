import { RpcException } from '@nestjs/microservices';

export function grpcError(grpcStatus: number, message: string): RpcException {
  return new RpcException({ code: grpcStatus, message });
}
