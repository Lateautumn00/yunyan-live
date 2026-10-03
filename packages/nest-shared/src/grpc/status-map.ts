import { status as GrpcStatus } from '@grpc/grpc-js';

export const GRPC_STATUS_TO_HTTP: Record<number, number> = {
  [GrpcStatus.NOT_FOUND]: 404,
  [GrpcStatus.UNAUTHENTICATED]: 401,
  [GrpcStatus.PERMISSION_DENIED]: 403,
  [GrpcStatus.ALREADY_EXISTS]: 409,
  [GrpcStatus.INVALID_ARGUMENT]: 400,
  [GrpcStatus.INTERNAL]: 500,
  [GrpcStatus.UNAVAILABLE]: 503
};

export const GRPC_STATUS_MSG: Record<number, string> = {
  [GrpcStatus.NOT_FOUND]: 'Not found',
  [GrpcStatus.UNAUTHENTICATED]: 'Unauthorized',
  [GrpcStatus.PERMISSION_DENIED]: 'Forbidden',
  [GrpcStatus.ALREADY_EXISTS]: 'Conflict',
  [GrpcStatus.INVALID_ARGUMENT]: 'Bad request',
  [GrpcStatus.INTERNAL]: 'Internal server error',
  [GrpcStatus.UNAVAILABLE]: 'Service unavailable'
};
