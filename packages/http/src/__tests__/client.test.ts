import { AxiosError, AxiosHeaders, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '@yunyan-live/types';
import {
  createRequestInterceptor,
  createResponseErrorInterceptor,
  createResponseInterceptor
} from '../client';

describe('createRequestInterceptor', () => {
  it('adds Bearer authorization header from tokenProvider', () => {
    const interceptor = createRequestInterceptor({
      tokenProvider: () => ({ token: 'abc', guid: 'g1' })
    });
    const config = {
      headers: new AxiosHeaders(),
      params: undefined
    } as InternalAxiosRequestConfig;

    const out = interceptor(config);
    expect(out.headers.Authorization).toBe('Bearer abc');
  });

  it('does NOT put token into query params', () => {
    const interceptor = createRequestInterceptor({
      tokenProvider: () => ({ token: 'secret', guid: 'g1' })
    });
    const config = {
      headers: new AxiosHeaders(),
      params: undefined
    } as InternalAxiosRequestConfig;

    const out = interceptor(config);
    expect(out.params).toBeUndefined();
  });

  it('merges paramsProvider without token leakage', () => {
    const interceptor = createRequestInterceptor({
      paramsProvider: () => ({ page: 1 })
    });
    const config = {
      headers: new AxiosHeaders(),
      params: { pageSize: 20 }
    } as InternalAxiosRequestConfig;

    const out = interceptor(config);
    expect(out.params).toEqual({ page: 1, pageSize: 20 });
  });

  it('leaves header untouched when no token', () => {
    const interceptor = createRequestInterceptor({ tokenProvider: () => undefined });
    const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
    const out = interceptor(config);
    expect(out.headers.Authorization).toBeUndefined();
  });
});

describe('createResponseInterceptor', () => {
  it('resolves with the envelope when code is 1000', () => {
    const interceptor = createResponseInterceptor();
    const response = {
      data: { code: 1000, data: { id: 1 } }
    } as AxiosResponse<ApiResult<{ id: number }>>;

    expect(interceptor(response)).toEqual({ code: 1000, data: { id: 1 } });
  });

  it('rejects and calls onMessageError when code != 1000', async () => {
    const onMessageError = vi.fn();
    const interceptor = createResponseInterceptor({ onMessageError });
    const response = {
      data: { code: 4001, msg: 'token 过期' }
    } as AxiosResponse<ApiResult>;

    await expect(interceptor(response)).rejects.toThrow('token 过期');
    expect(onMessageError).toHaveBeenCalledWith('token 过期');
  });

  it('rejects with generic Error when msg missing', async () => {
    const interceptor = createResponseInterceptor();
    const response = { data: { code: 500 } } as AxiosResponse<ApiResult>;

    await expect(interceptor(response)).rejects.toThrow('Error');
  });
});

describe('createResponseErrorInterceptor', () => {
  const makeError = (status?: number): AxiosError => {
    const error = new AxiosError('boom', 'ERR_BAD_REQUEST');
    if (status) {
      error.response = { status, data: { code: status } } as AxiosError['response'];
    }
    return error;
  };

  it('calls onUnauthorized on 401 with the response body', async () => {
    const onUnauthorized = vi.fn();
    const interceptor = createResponseErrorInterceptor({ onUnauthorized });
    const error = new AxiosError('boom', 'ERR_BAD_REQUEST');
    error.response = {
      status: 401,
      data: { code: 4001, msg: '登录已过期，请重新登录' }
    } as AxiosError['response'];

    await expect(interceptor(error)).rejects.toMatchObject({ code: 4001 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledWith({ code: 4001, msg: '登录已过期，请重新登录' });
  });

  it('calls onUnauthorized with undefined when 401 body is not an object', async () => {
    const onUnauthorized = vi.fn();
    const interceptor = createResponseErrorInterceptor({ onUnauthorized });
    const error = new AxiosError('boom', 'ERR_BAD_REQUEST');
    error.response = { status: 401, data: 'plain text' } as AxiosError['response'];

    await expect(interceptor(error)).rejects.toBe('plain text');
    expect(onUnauthorized).toHaveBeenCalledWith(undefined);
  });

  it('calls onServerError with fixed message on 503', async () => {
    const onServerError = vi.fn();
    const interceptor = createResponseErrorInterceptor({ onServerError });

    await expect(interceptor(makeError(503))).rejects.toMatchObject({ code: 503 });
    expect(onServerError).toHaveBeenCalledWith('服务器异常，请求超时');
  });

  it('rejects with response data for other statuses without handler calls', async () => {
    const onUnauthorized = vi.fn();
    const onServerError = vi.fn();
    const interceptor = createResponseErrorInterceptor({ onUnauthorized, onServerError });

    await expect(interceptor(makeError(502))).rejects.toMatchObject({ code: 502 });
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(onServerError).not.toHaveBeenCalled();
  });

  it('rejects with the original error when there is no response', async () => {
    const interceptor = createResponseErrorInterceptor({});
    await expect(interceptor(makeError())).rejects.toBeInstanceOf(Error);
  });
});
