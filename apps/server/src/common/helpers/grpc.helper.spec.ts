import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HttpException, Logger } from '@nestjs/common';
import { EMPTY, of, throwError } from 'rxjs';
import { grpcCall } from './grpc.helper';

beforeAll(() => {
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function expectHttpException(
  promise: Promise<unknown>,
  status: number,
  message: string
) {
  const err = await promise.then(
    () => {
      throw new Error('expected promise to reject');
    },
    (e: unknown) => e
  );
  expect(err).toBeInstanceOf(HttpException);
  expect((err as HttpException).getStatus()).toBe(status);
  expect((err as HttpException).message).toBe(message);
}

describe('grpcCall', () => {
  it('成功时解出 Observable 首个值', async () => {
    await expect(grpcCall(of({ code: '0', value: 1 }))).resolves.toEqual({
      code: '0',
      value: 1
    });
  });

  it('HttpException 原样透传，不做映射', async () => {
    const original = new HttpException('已被封禁', 403);
    const err = await grpcCall(throwError(() => original)).catch((e: unknown) => e);
    expect(err).toBe(original);
  });

  it('扁平 gRPC 错误按状态码映射（3→400、5→404、7→403、16→401）', async () => {
    await expectHttpException(
      grpcCall(throwError(() => ({ code: 3, details: '参数无效' }))),
      400,
      '参数无效'
    );
    await expectHttpException(
      grpcCall(throwError(() => ({ code: 16, details: '未登录' }))),
      401,
      '未登录'
    );
    await expectHttpException(
      grpcCall(throwError(() => ({ code: 7, details: '无权访问' }))),
      403,
      '无权访问'
    );
    await expectHttpException(
      grpcCall(throwError(() => ({ code: 5, details: '房间不存在' }))),
      404,
      '房间不存在'
    );
  });

  it('嵌套 {error:{code,details}} 形状同样可映射', async () => {
    await expectHttpException(
      grpcCall(throwError(() => ({ error: { code: 6, details: '冲突' } }))),
      409,
      '冲突'
    );
  });

  it('details 回退链：details → error.details → message → error.message → 服务异常', async () => {
    await expectHttpException(
      grpcCall(throwError(() => ({ code: 5, message: '只剩 message' }))),
      404,
      '只剩 message'
    );
    await expectHttpException(
      grpcCall(throwError(() => ({ code: 5, error: { message: '嵌套 message' } }))),
      404,
      '嵌套 message'
    );
    await expectHttpException(
      grpcCall(throwError(() => ({ code: 5 }))),
      404,
      '服务异常'
    );
  });

  it('未知 gRPC code 兜底 500，普通 Error 亦为 500', async () => {
    await expectHttpException(
      grpcCall(throwError(() => ({ code: 99, details: '未知码' }))),
      500,
      '未知码'
    );
    await expectHttpException(
      grpcCall(throwError(() => new Error('普通失败'))),
      500,
      '普通失败'
    );
  });

  it('空 Observable（无元素）同样转成 HttpException 500', async () => {
    await expectHttpException(grpcCall(EMPTY), 500, 'no elements in sequence');
  });
});
