import { describe, expect, it, vi } from 'vitest';
import { ExecutionContext, HttpException } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';
import {
  DEFAULT_THROTTLE,
  RATE_LIMIT_MESSAGE,
  STRICT_THROTTLE,
  RateLimitGuard
} from './rate-limit.guard';

/** 构造最小可用的 ExecutionContext（限流守卫只读 handler/class/ip/user） */
function ctxOf(handlerName: string, ip = '1.1.1.1', user?: { userId: string }): ExecutionContext {
  const req = { ip, user } as unknown as Record<string, unknown>;
  return {
    getHandler: () => ({ name: handlerName }) as never,
    getClass: () => ({ name: 'TestCtrl' }) as never,
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        header: vi.fn().mockReturnThis()
      })
    })
  } as unknown as ExecutionContext;
}

async function guardWith(storage: ThrottlerStorageService): Promise<RateLimitGuard> {
  const options = { throttlers: [DEFAULT_THROTTLE] };
  const reflector = { getAllAndOverride: vi.fn(() => undefined) } as never;
  const guard = new RateLimitGuard(options as never, storage, reflector);
  // this.throttlers 由 onModuleInit 填充，测试绕过 DI 需手动触发
  await guard.onModuleInit();
  return guard;
}

/** 连续调用 canActivate 直至被限流，返回触发前的成功次数（超限会抛异常） */
async function hitsBefore429(
  guard: RateLimitGuard,
  context: ExecutionContext,
  max = 150
): Promise<number> {
  for (let i = 0; i < max; i++) {
    try {
      if (!(await guard.canActivate(context))) return i;
    } catch {
      return i;
    }
  }
  return max;
}

describe('RateLimitGuard（GAP-S1）', () => {
  it('阈值常量：严格档 5/60s，默认档 100/60s', () => {
    expect(STRICT_THROTTLE).toEqual({ limit: 5, ttl: 60000 });
    expect(DEFAULT_THROTTLE).toEqual({ limit: 100, ttl: 60000 });
  });

  it('匿名请求按 IP 计数：同 IP 第 101 次被限流', async () => {
    const guard = await guardWith(new ThrottlerStorageService());
    expect(await hitsBefore429(guard, ctxOf('list'))).toBe(100);
  });

  it('userId 与 IP 分离：同 IP 两个用户各享 100 次，不互相挤占', async () => {
    const guard = await guardWith(new ThrottlerStorageService());
    const a = ctxOf('list', '1.1.1.1', { userId: 'u1' });
    const b = ctxOf('list', '1.1.1.1', { userId: 'u2' });
    expect(await hitsBefore429(guard, a)).toBe(100);
    // u2 与 u1 共用出口 IP，但计数键按 userId 分离，仍可完整访问
    expect(await hitsBefore429(guard, b)).toBe(100);
  });

  it('同一 userId 从不同 IP 访问共享配额（按键是 userId 而非 IP）', async () => {
    const guard = await guardWith(new ThrottlerStorageService());
    expect(await hitsBefore429(guard, ctxOf('list', '1.1.1.1', { userId: 'u1' }))).toBe(100);
    expect(await hitsBefore429(guard, ctxOf('list', '9.9.9.9', { userId: 'u1' }))).toBe(0);
  });

  it('触发限流时抛异常且消息不泄露配额策略', async () => {
    const guard = await guardWith(new ThrottlerStorageService());
    const context = ctxOf('list');
    for (let i = 0; i < 100; i++) await guard.canActivate(context);
    const err = (await guard.canActivate(context).catch((e: unknown) => e)) as HttpException;
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(429);
    const body = err.getResponse() as { msg: string };
    expect(body.msg).toBe(RATE_LIMIT_MESSAGE);
    expect(JSON.stringify(body)).not.toMatch(/100|60000|60|limit|quota/i);
  });

  it('不同端点配额独立（key 含 handler 名）', async () => {
    const guard = await guardWith(new ThrottlerStorageService());
    expect(await hitsBefore429(guard, ctxOf('list'))).toBe(100);
    // 另一端点不受 list 端点限流影响
    expect(await guard.canActivate(ctxOf('detail'))).toBe(true);
  });
});
