import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable
} from '@nestjs/common';

interface ThrottleBucket {
  hits: number;
  resetAt: number;
}

/**
 * 登录限流（5 次 / 60s，按客户端 IP）：
 * 与网关 `STRICT_THROTTLE` 同口径，但不引入 @nestjs/throttler（单进程内存实现即可）。
 * 只挂在 POST /admin/login，其它端点不受影响。
 */
@Injectable()
export class LoginThrottleGuard implements CanActivate {
  static readonly LIMIT = 5;
  static readonly WINDOW_MS = 60_000;

  private readonly buckets = new Map<string, ThrottleBucket>();

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ ip?: string; socket?: { remoteAddress?: string } }>();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { hits: 1, resetAt: now + LoginThrottleGuard.WINDOW_MS });
      return true;
    }

    bucket.hits += 1;
    if (bucket.hits > LoginThrottleGuard.LIMIT) {
      throw new HttpException('登录过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
