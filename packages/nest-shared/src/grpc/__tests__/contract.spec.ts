import { RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { describe, expect, it } from 'vitest';
import { fail, GRPC_CODE_FAIL, GRPC_CODE_OK, ok } from '../envelope';
import { grpcError } from '../error';
import { userIdFromMetadata, userIdMetadata, USER_ID_KEY } from '../metadata';
import { GRPC_STATUS_MSG, GRPC_STATUS_TO_HTTP } from '../status-map';

describe('envelope', () => {
  it('ok 默认 { code: 0, msg: success } 并可携带扩展字段', () => {
    expect(ok()).toEqual({ code: GRPC_CODE_OK, msg: 'success' });
    expect(ok({ roomId: 'r1' }, 'created')).toEqual({
      code: GRPC_CODE_OK,
      msg: 'created',
      roomId: 'r1'
    });
  });

  it('fail 固定 code 1 并可携带扩展字段', () => {
    expect(fail('boom')).toEqual({ code: GRPC_CODE_FAIL, msg: 'boom' });
    expect(fail('boom', { reason: 'x' })).toEqual({
      code: GRPC_CODE_FAIL,
      msg: 'boom',
      reason: 'x'
    });
  });
});

describe('grpcError', () => {
  it('包装为携带 { code, message } 的 RpcException', () => {
    const err = grpcError(GrpcStatus.NOT_FOUND, 'room not found');
    expect(err).toBeInstanceOf(RpcException);
    expect(err.getError()).toEqual({ code: GrpcStatus.NOT_FOUND, message: 'room not found' });
  });
});

describe('userIdMetadata', () => {
  it('写入并读回 user-id', () => {
    const metadata = userIdMetadata('u1');
    expect(metadata.get(USER_ID_KEY)[0]?.toString()).toBe('u1');
    expect(userIdFromMetadata(metadata)).toBe('u1');
  });

  it('缺失 user-id 时读取 undefined', () => {
    const metadata = userIdMetadata('u1');
    metadata.remove(USER_ID_KEY);
    expect(userIdFromMetadata(metadata)).toBeUndefined();
  });
});

describe('status-map', () => {
  it('gRPC status 与文案一一对应', () => {
    expect(GRPC_STATUS_TO_HTTP[GrpcStatus.NOT_FOUND]).toBe(404);
    expect(GRPC_STATUS_TO_HTTP[GrpcStatus.UNAUTHENTICATED]).toBe(401);
    expect(GRPC_STATUS_TO_HTTP[GrpcStatus.PERMISSION_DENIED]).toBe(403);
    expect(GRPC_STATUS_TO_HTTP[GrpcStatus.ALREADY_EXISTS]).toBe(409);
    expect(GRPC_STATUS_TO_HTTP[GrpcStatus.INVALID_ARGUMENT]).toBe(400);
    expect(GRPC_STATUS_TO_HTTP[GrpcStatus.INTERNAL]).toBe(500);
    expect(GRPC_STATUS_TO_HTTP[GrpcStatus.UNAVAILABLE]).toBe(503);

    expect(GRPC_STATUS_MSG[GrpcStatus.NOT_FOUND]).toBe('Not found');
    expect(GRPC_STATUS_MSG[GrpcStatus.UNAUTHENTICATED]).toBe('Unauthorized');
    expect(GRPC_STATUS_MSG[GrpcStatus.PERMISSION_DENIED]).toBe('Forbidden');
    expect(GRPC_STATUS_MSG[GrpcStatus.ALREADY_EXISTS]).toBe('Conflict');
    expect(GRPC_STATUS_MSG[GrpcStatus.INVALID_ARGUMENT]).toBe('Bad request');
    expect(GRPC_STATUS_MSG[GrpcStatus.INTERNAL]).toBe('Internal server error');
    expect(GRPC_STATUS_MSG[GrpcStatus.UNAVAILABLE]).toBe('Service unavailable');
  });
});
