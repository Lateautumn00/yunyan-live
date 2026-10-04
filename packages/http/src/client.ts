import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig
} from 'axios';
import type { ApiResult } from '@yunyan-live/types';

export interface TokenProvider {
  token: string | null;
  guid?: string | null;
}

export class ApiError extends Error {
  readonly apiCode?: number;

  constructor(message: string, apiCode?: number) {
    super(message);
    this.name = 'ApiError';
    this.apiCode = apiCode;
  }
}

export interface RequestInterceptorOptions {
  tokenProvider?: () => TokenProvider | undefined;
  paramsProvider?: () => Record<string, string | number | boolean | null | undefined>;
}

export interface ResponseInterceptorOptions {
  onMessageError?: (msg: string) => void;
}

export interface ResponseErrorInterceptorOptions {
  onUnauthorized?: (data?: ApiResult) => void;
  onServerError?: (msg: string) => void;
}

export interface HttpClientOptions extends RequestInterceptorOptions, ResponseInterceptorOptions {
  baseURL: string;
  timeout?: number;
  withCredentials?: boolean;
  headers?: Record<string, string>;
  onUnauthorized?: (data?: ApiResult) => void;
  onServerError?: (msg: string) => void;
}

/**
 * Envelope-typed view of an http client whose response interceptor unwraps to ApiResult.
 * Methods resolve the `{ code, msg, data }` envelope instead of AxiosResponse.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type HttpClient = Omit<
  AxiosInstance,
  'get' | 'post' | 'put' | 'delete' | 'patch' | 'request'
> & {
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResult<T>>;
  post<T = any>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResult<T>>;
  put<T = any>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResult<T>>;
  delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResult<T>>;
  patch<T = any>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResult<T>>;
  request<T = any>(config: AxiosRequestConfig): Promise<ApiResult<T>>;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export function createRequestInterceptor(opts: RequestInterceptorOptions = {}) {
  return (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const tokens = opts.tokenProvider?.();
    if (tokens?.token) {
      config.headers.Authorization = `Bearer ${tokens.token}`;
    }
    if (opts.paramsProvider) {
      config.params = { ...config.params, ...opts.paramsProvider() };
    }
    return config;
  };
}

export function createResponseInterceptor(opts: ResponseInterceptorOptions = {}) {
  return (response: AxiosResponse<ApiResult>): ApiResult | Promise<never> => {
    const res = response.data;
    if (res.code !== 1000) {
      opts.onMessageError?.(res.msg || 'Error');
      return Promise.reject(new ApiError(res.msg || 'Error', res.code));
    }
    return res;
  };
}

export function createResponseErrorInterceptor(opts: ResponseErrorInterceptorOptions = {}) {
  return (error: AxiosError<unknown>): Promise<never> => {
    if (error.response) {
      switch (error.response.status) {
        case 401: {
          const data = error.response.data;
          opts.onUnauthorized?.(
            data && typeof data === 'object' ? (data as ApiResult) : undefined
          );
          break;
        }
        case 503:
          opts.onServerError?.('服务器异常，请求超时');
          break;
      }
    }
    return Promise.reject(error.response?.data ?? error);
  };
}

export function createHttpClient(opts: HttpClientOptions): AxiosInstance {
  const instance = axios.create({
    withCredentials: opts.withCredentials ?? true,
    baseURL: opts.baseURL,
    timeout: opts.timeout ?? 10000,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      ...opts.headers
    }
  });
  instance.interceptors.request.use(createRequestInterceptor(opts), (error: unknown) =>
    Promise.reject(error)
  );
  instance.interceptors.response.use(
    createResponseInterceptor(opts) as unknown as (response: AxiosResponse) => AxiosResponse,
    createResponseErrorInterceptor(opts)
  );
  return instance;
}
