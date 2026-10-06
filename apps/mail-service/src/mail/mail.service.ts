import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@yunyan-live/nest-shared';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly CODE_EXPIRE = 300;

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  private generateCode(): string {
    return Math.random().toString().slice(2, 8);
  }

  async sendCode(email: string): Promise<void> {
    const code = this.generateCode();
    const key = `verify_code:${email}`;

    await this.redis.setex(key, this.CODE_EXPIRE, code);
    this.logger.log(`验证码已生成: ${email} -> ${code}`);

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
      this.logger.log(`[开发模式] 验证码: ${code}`);
    }
  }

  async verifyCode(email: string, code: string): Promise<boolean> {
    const key = `verify_code:${email}`;
    const stored = await this.redis.get(key);

    if (!stored) return false;
    if (stored !== code) return false;

    await this.redis.del(key);
    return true;
  }
}
