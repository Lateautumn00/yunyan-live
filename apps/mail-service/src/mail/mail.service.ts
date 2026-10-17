import { randomInt } from 'crypto';
import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@yunyan-live/nest-shared';

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
}
