import { HttpException, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerLimitDetail } from '@nestjs/throttler/dist/throttler.guard.interface';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** 认证类端点限流档位（严格档）：5 次 / 60s */
export const STRICT_THROTTLE = { limit: 5, ttl: 60000 } as const;
/** 普通接口默认档位：100 次 / 60s（与 ThrottlerModule 默认一致） */
export const DEFAULT_THROTTLE = { limit: 100, ttl: 60000 } as const;

/** 限流触发时的统一错误消息：不泄露上限、窗口或命中 key */
export const RATE_LIMIT_MESSAGE = '请求过于频繁，请稍后再试';

/**
 * 分级限流守卫（GAP-S1）。
 *
 * 1. **userId + IP 分离**：已登录按 `userId` 计数，匿名按 `IP` 计数，
 *    避免 50 名学生共用同一 NAT 出口被集体 429。
 * 2. **严格档**：认证类端点（login/register/resetPassword/reqEmailCode）
 *    通过路由级 `@Throttle({ default: STRICT_THROTTLE })` 覆盖默认档。
 * 3. **响应不泄露配额策略**：触发时返回统一 429 消息，
 *    不暴露上限值、窗口长度或命中 key。
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  /** key = handler 名 + 身份：登录用户按 userId，匿名按 IP */
  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    const req = context.switchToHttp().getRequest<Request>();
    const userId = (req as { user?: { userId?: string } }).user?.userId;
    const identity = userId ? `u:${userId}` : `ip:${suffix}`;
    const prefix = `${context.getClass().name}-${context.getHandler().name}-${name}`;
    return `${prefix}-${identity}`;
  }

  protected async getErrorMessage(
    _context: ExecutionContext,
    _detail: ThrottlerLimitDetail
  ): Promise<string> {
    return RATE_LIMIT_MESSAGE;
  }

  protected async throwThrottlingException(
    _context: ExecutionContext,
    _detail: ThrottlerLimitDetail
  ): Promise<void> {
    throw new HttpException({ code: 4029, msg: RATE_LIMIT_MESSAGE }, 429);
  }
}
