export const GRPC_CODE_OK = '0';
export const GRPC_CODE_FAIL = '1';

export interface GrpcEnvelope {
  code: string;
  msg: string;
}

export function ok<T extends object>(extra?: T, msg = 'success'): GrpcEnvelope & T {
  return { code: GRPC_CODE_OK, msg, ...(extra ?? ({} as T)) };
}

export function fail<T extends object>(msg: string, extra?: T): GrpcEnvelope & T {
  return { code: GRPC_CODE_FAIL, msg, ...(extra ?? ({} as T)) };
}
