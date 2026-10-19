import { randomInt } from 'crypto';
import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import Redis from 'ioredis';
import {
  NOTIFY_DEDUPE_TTL_S,
  NOTIFY_DAILY_LIMIT,
  REDIS_CLIENT,
  type NotifyWireEvent
} from '@yunyan-live/nest-shared';
import { renderNotify } from './templates';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly CODE_EXPIRE = 300;
  /** 发送冷却：60s 内重复请求直接拒绝 */
  private readonly COOLDOWN_TTL = 60;
  /** 失败锁定：5 次失败后 15 分钟内禁止验证 */
  private readonly MAX_ATTEMPTS = 5;
  private readonly LOCK_TTL = 900;

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  private generateCode(): string {
    return randomInt(0, 1000000).toString().padStart(6, '0');
  }

  private codeKey(email: string): string {
    return `verify_code:${email}`;
  }

  private attemptsKey(email: string): string {
    return `verify_attempts:${email}`;
  }

  async sendCode(email: string): Promise<void> {
    const key = this.codeKey(email);
    const cooldownKey = `verify_cooldown:${email}`;

    // 冷却：60s 内重复请求直接拒绝（Redis 写失败时 fail-open，不阻断主流程）
    let cooled = false;
    try {
      cooled = (await this.redis.set(cooldownKey, '1', 'EX', this.COOLDOWN_TTL, 'NX')) === 'OK';
    } catch (err) {
      this.logger.error(`冷却检查失败: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!cooled) {
      this.logger.warn(`请求过于频繁: ${email}`);
      return;
    }

    const code = this.generateCode();
    await this.redis.setex(key, this.CODE_EXPIRE, code);
    // 移除明文打印：日志不落验证码，避免泄露

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: '云砚直播 - 邮箱验证码',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>云砚直播 - 邮箱验证码</h2>
            <p>您的验证码是：</p>
            <div style="font-size: 32px; font-weight: bold; color: #286bff; letter-spacing: 8px; padding: 10px 0;">
              ${code}
            </div>
            <p style="color: #999; font-size: 12px;">验证码 ${this.CODE_EXPIRE / 60} 分钟内有效，请勿泄露给他人。</p>
          </div>
        `
      });
      this.logger.log(`验证码邮件已发送: ${email}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`邮件发送失败: ${message}`);
      // 不再在失败分支打印验证码（原「开发模式」明文日志已移除，避免泄露）
    }
  }

  async verifyCode(email: string, code: string): Promise<boolean> {
    const key = this.codeKey(email);
    const attemptsKey = this.attemptsKey(email);

    // 失败锁定：超限后 15 分钟内禁止验证
    let locked = false;
    try {
      locked = (await this.redis.get(attemptsKey)) !== null;
    } catch (err) {
      this.logger.error(`锁定检查失败: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (locked) {
      this.logger.warn(`验证已锁定: ${email}`);
      return false;
    }

    const stored = await this.redis.get(key);
    if (!stored) return false;
    if (stored !== code) {
      // 失败计数 +1，达到阈值后设置锁定（TTL 与锁定一致）
      try {
        const n = await this.redis.incr(attemptsKey);
        if (n >= this.MAX_ATTEMPTS) {
          await this.redis.expire(attemptsKey, this.LOCK_TTL);
        } else {
          await this.redis.expire(attemptsKey, this.CODE_EXPIRE);
        }
      } catch (err) {
        this.logger.error(`失败计数失败: ${err instanceof Error ? err.message : String(err)}`);
      }
      return false;
    }

    // 成功：删除验证码（一次性）并清空失败计数
    await this.redis.del(key);
    try {
      await this.redis.del(attemptsKey);
    } catch (err) {
      this.logger.error(`清空失败计数失败: ${err instanceof Error ? err.message : String(err)}`);
    }
    return true;
  }

  /**
   * F9 通知发送（MQ consumer 唯一投递出口）：
   * 1) 场次模板去重 dedupeKey=kind:scope:to（7d NX，命中直接跳过）
   * 2) 单用户单日 ≤5 次投递尝试（INCR 分桶，超限跳过）
   * 3) SMTP 失败回滚 dedupe 键并抛出（交 consumer 重试阶梯 5s/30s/120s → DLQ）
   * Redis 故障一律 fail-open（放行发送，error 日志留痕）——与 sendCode 冷却同口径。
   */
  async notify(event: NotifyWireEvent): Promise<'sent' | 'skipped_dedupe' | 'skipped_rate'> {
    const dedupeRedisKey = `notify_dedupe:${event.dedupeKey}`;
    try {
      const existing = await this.redis.get(dedupeRedisKey);
      if (existing) {
        this.logger.log(`通知去重跳过: ${event.dedupeKey}`);
        return 'skipped_dedupe';
      }
    } catch (err) {
      this.logger.error(
        `去重检查失败(fail-open): ${err instanceof Error ? err.message : String(err)}`
      );
    }

    try {
      const day = new Date().toISOString().slice(0, 10);
      const dailyKey = `notify_daily:${event.to}:${day}`;
      const n = await this.redis.incr(dailyKey);
      if (n === 1) await this.redis.expire(dailyKey, 2 * 24 * 60 * 60);
      if (n > NOTIFY_DAILY_LIMIT) {
        this.logger.warn(`单日通知超限跳过: ${event.to} n=${n}`);
        return 'skipped_rate';
      }
    } catch (err) {
      this.logger.error(
        `频控计数失败(fail-open): ${err instanceof Error ? err.message : String(err)}`
      );
    }

    try {
      const ok = await this.redis.set(dedupeRedisKey, '1', 'EX', NOTIFY_DEDUPE_TTL_S, 'NX');
      if (ok !== 'OK') {
        this.logger.log(`通知去重跳过(并发): ${event.dedupeKey}`);
        return 'skipped_dedupe';
      }
    } catch (err) {
      this.logger.error(
        `去重写入失败(fail-open): ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const { subject, html } = renderNotify(event.kind, event.payload);
    try {
      await this.mailerService.sendMail({ to: event.to, subject, html });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`通知邮件发送失败: kind=${event.kind} to=${event.to}: ${message}`);
      // 回滚 dedupe：重试投递须真正发出，不被本次失败占用去重位
      try {
        await this.redis.del(dedupeRedisKey);
      } catch (err) {
        this.logger.error(`去重回滚失败: ${err instanceof Error ? err.message : String(err)}`);
      }
      throw error instanceof Error ? error : new Error(message);
    }
    this.logger.log(`通知邮件已发送: kind=${event.kind} to=${event.to}`);
    return 'sent';
  }
}
