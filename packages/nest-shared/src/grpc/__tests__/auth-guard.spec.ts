import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { of } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { GrpcAuthGuard } from '../auth-guard';
import { USER_ID_KEY, USER_SIG_KEY, USER_TS_KEY, userIdMetadata } from '../metadata';

const SECRET = 'guard-test-secret';

function rpcContext(payload: unknown, type = 'rpc'): ExecutionContext {
  return {
    getType: () => type,
    switchToRpc: () => ({ getContext: () => payload })
  } as unknown as ExecutionContext;
}

function nextOk(): CallHandler<string> {
  return { handle: () => of('handled') };
}

async function run(
  guard: GrpcAuthGuard,
  payload: unknown,
  type = 'rpc'
): Promise<{ value?: unknown; error?: unknown }> {
  const out = guard.intercept(rpcContext(payload, type), nextOk());
  try {
    return { value: await firstValueFrom(out) };
  } catch (error) {
    return { error };
  }
}

describe('GrpcAuthGuard', () => {
  it('合法签名放行并调用 next.handle', async () => {
    const guard = new GrpcAuthGuard(SECRET);
    const { value, error } = await run(guard, userIdMetadata('u1', SECRET));
    expect(error).toBeUndefined();
    expect(value).toBe('handled');
  });

  it('无 user-id（系统调用）放行', async () => {
    const guard = new GrpcAuthGuard(SECRET);
    const { value, error } = await run(guard, new Metadata());
    expect(error).toBeUndefined();
    expect(value).toBe('handled');
  });

  it('服务端未配置密钥（空串）放行并告警', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const guard = new GrpcAuthGuard('');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('GRPC_SHARED_SECRET'));
    const { value, error } = await run(
      guard,
      (() => {
        const md = new Metadata();
        md.add(USER_ID_KEY, 'u1');
        return md;
      })()
    );
    expect(error).toBeUndefined();
    expect(value).toBe('handled');
    warn.mockRestore();
  });

  it('带 user-id 无签名 → UNAUTHENTICATED(16) 拒绝且不进 handler', async () => {
    const guard = new GrpcAuthGuard(SECRET);
    const bare = new Metadata();
    bare.add(USER_ID_KEY, 'u1');
    const handler = { handle: vi.fn(() => of('handled')) };
    const out = guard.intercept(rpcContext(bare), handler);
    const error = await firstValueFrom(out).catch((e: unknown) => e);
    expect(handler.handle).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(RpcException);
    expect((error as RpcException).getError()).toMatchObject({
      code: GrpcStatus.UNAUTHENTICATED,
      message: expect.stringContaining('missing')
    });
  });

  it('篡改签名 → 拒绝', async () => {
    const guard = new GrpcAuthGuard(SECRET);
    const md = userIdMetadata('u1', SECRET);
    md.remove(USER_SIG_KEY);
    md.add(USER_SIG_KEY, 'a'.repeat(64));
    const { error } = await run(guard, md);
    expect((error as RpcException).getError()).toMatchObject({ code: GrpcStatus.UNAUTHENTICATED });
  });

  it('过期时间戳 → 拒绝', async () => {
    const guard = new GrpcAuthGuard(SECRET);
    const md = userIdMetadata('u1', SECRET);
    md.remove(USER_TS_KEY);
    md.add(USER_TS_KEY, String(Date.now() - 10 * 60_000));
    const { error } = await run(guard, md);
    expect((error as RpcException).getError()).toMatchObject({ code: GrpcStatus.UNAUTHENTICATED });
    expect((error as RpcException).getError()).toMatchObject({
      message: expect.stringContaining('stale')
    });
  });

  it('非 rpc 类型直接放行', async () => {
    const guard = new GrpcAuthGuard(SECRET);
    const { value, error } = await run(guard, new Metadata(), 'http');
    expect(error).toBeUndefined();
    expect(value).toBe('handled');
  });

  it('防御性提取：call-like 对象取 .metadata；取不到按 absent 放行', async () => {
    const guard = new GrpcAuthGuard(SECRET);
    const wrapped = await run(guard, { metadata: userIdMetadata('u1', SECRET) });
    expect(wrapped.error).toBeUndefined();
    expect(wrapped.value).toBe('handled');

    const empty = await run(guard, {});
    expect(empty.error).toBeUndefined();
    expect(empty.value).toBe('handled');
  });
});
