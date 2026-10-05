import {
  ArgumentsHost,
  BadRequestException,
  CallHandler,
  ExecutionContext,
  HttpException,
  NotFoundException
} from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { lastValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResponseInterceptor } from '../response.interceptor';
import { HttpExceptionFilter } from '../http-exception.filter';

function intercept(payload: unknown) {
  const interceptor = new ResponseInterceptor<unknown>();
  return lastValueFrom(
    interceptor.intercept({} as ExecutionContext, { handle: () => of(payload) } as CallHandler)
  );
}

function createHost() {
  const res = {
    status: vi.fn(),
    json: vi.fn()
  };
  res.status.mockReturnValue(res);
  const host = {
    switchToHttp: () => ({ getResponse: () => res })
  } as unknown as ArgumentsHost;
  return { res, host };
}

describe('ResponseInterceptor', () => {
  it('统一包装为 { code: 1000, msg: success, data }', async () => {
    await expect(intercept({ id: 1 })).resolves.toEqual({
      code: 1000,
      msg: 'success',
      data: { id: 1 }
    });
  });

  it('data 为 null 时信封保持不变', async () => {
    await expect(intercept(null)).resolves.toEqual({ code: 1000, msg: 'success', data: null });
  });

  it('丢弃业务对象自带的 code/msg，以信封为准', async () => {
    await expect(intercept({ code: 999, msg: 'custom', value: 'v' })).resolves.toEqual({
      code: 1000,
      msg: 'success',
      data: { code: 999, msg: 'custom', value: 'v' }
    });
  });
});

describe('HttpExceptionFilter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('字符串响应的 HttpException 直接作为 msg', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const filter = new HttpExceptionFilter();
    const { res, host } = createHost();
    filter.catch(new HttpException('boom', 500), host);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ code: 500, msg: 'boom', data: null });
  });

  it('401/404/409 映射到 4001/4003/4004', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const filter = new HttpExceptionFilter();

    const unauthorized = createHost();
    filter.catch(new HttpException({ message: 'Unauthorized' }, 401), unauthorized.host);
    expect(unauthorized.res.json).toHaveBeenCalledWith({
      code: 4001,
      msg: 'Unauthorized',
      data: null
    });

    const notFound = createHost();
    filter.catch(new NotFoundException('nope'), notFound.host);
    expect(notFound.res.json).toHaveBeenCalledWith({ code: 4003, msg: 'nope', data: null });

    const conflict = createHost();
    filter.catch(new HttpException('exists', 409), conflict.host);
    expect(conflict.res.json).toHaveBeenCalledWith({ code: 4004, msg: 'exists', data: null });
  });

  it('显式 code 覆盖状态映射（如会话被顶下线 4002）', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const filter = new HttpExceptionFilter();
    const { res, host } = createHost();
    filter.catch(new HttpException({ code: 4002, message: 'session kicked' }, 401), host);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ code: 4002, msg: 'session kicked', data: null });
  });

  it('对象型异常按 gRPC status 映射，details 优先作为 msg', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const filter = new HttpExceptionFilter();

    const notFound = createHost();
    filter.catch({ code: GrpcStatus.NOT_FOUND, details: 'room not found' }, notFound.host);
    expect(notFound.res.status).toHaveBeenCalledWith(404);
    expect(notFound.res.json).toHaveBeenCalledWith({
      code: 404,
      msg: 'room not found',
      data: null
    });

    const unauth = createHost();
    filter.catch({ code: GrpcStatus.UNAUTHENTICATED, details: 'bad token' }, unauth.host);
    expect(unauth.res.json).toHaveBeenCalledWith({ code: 401, msg: 'bad token', data: null });

    const unavailable = createHost();
    filter.catch({ code: GrpcStatus.UNAVAILABLE, details: 'down' }, unavailable.host);
    expect(unavailable.res.status).toHaveBeenCalledWith(503);
  });

  it('未知 gRPC code 回落 500 并给出兜底文案', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const filter = new HttpExceptionFilter();
    const { res, host } = createHost();
    filter.catch({ code: 99, details: '' }, host);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      code: 500,
      msg: 'Internal server error',
      data: null
    });
  });

  it('无 details 时用 gRPC status 文案', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const filter = new HttpExceptionFilter();
    const { res, host } = createHost();
    filter.catch({ code: GrpcStatus.PERMISSION_DENIED }, host);
    expect(res.json).toHaveBeenCalledWith({ code: 403, msg: 'Forbidden', data: null });
  });

  it('普通 Error 保留原 message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const filter = new HttpExceptionFilter();
    const { res, host } = createHost();
    filter.catch(new TypeError('x is not a function'), host);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      code: 500,
      msg: 'x is not a function',
      data: null
    });
  });

  it('非 Error 异常兜底 500 文案', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const filter = new HttpExceptionFilter();
    const { res, host } = createHost();
    filter.catch(null, host);
    expect(res.json).toHaveBeenCalledWith({
      code: 500,
      msg: 'Internal server error',
      data: null
    });
  });

  it('BadRequestException 的 message 数组 toString 后作为 msg', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const filter = new HttpExceptionFilter();
    const { res, host } = createHost();
    filter.catch(new BadRequestException(['title required', 'type invalid']), host);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: 400,
      msg: 'title required,type invalid',
      data: null
    });
  });
});
