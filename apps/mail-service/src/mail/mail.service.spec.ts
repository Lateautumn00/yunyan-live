import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Redis } from 'ioredis';
import { MailService } from './mail.service';

function createService() {
  const mailer = { sendMail: vi.fn().mockResolvedValue(undefined) };
  const redis = { setex: vi.fn().mockResolvedValue('OK'), get: vi.fn(), del: vi.fn().mockResolvedValue(1) };
  const config = {};
  const service = new MailService(
    mailer as never,
    config as never,
    redis as unknown as Redis
  );
  return { service, mailer, redis };
}

describe('MailService', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendCode', () => {
    it('验证码写入 redis：verify_code:<email>，TTL 300 秒', async () => {
      const { service, redis } = createService();
      await service.sendCode('a@b.com');
      expect(redis.setex).toHaveBeenCalledWith('verify_code:a@b.com', 300, '123456');
    });

    it('邮件主题与正文携带验证码和 5 分钟有效期说明', async () => {
      const { service, mailer } = createService();
      await service.sendCode('a@b.com');
      expect(mailer.sendMail).toHaveBeenCalledTimes(1);
      expect(mailer.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'a@b.com',
          subject: expect.stringContaining('云砚直播'),
          html: expect.stringContaining('123456')
        })
      );
      expect(mailer.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.stringContaining('5 分钟内有效') })
      );
    });

    it('发送失败时吞掉异常，不向调用方抛出', async () => {
      const { service, mailer, redis } = createService();
      mailer.sendMail.mockRejectedValueOnce(new Error('smtp down'));
      await expect(service.sendCode('a@b.com')).resolves.toBeUndefined();
      expect(redis.setex).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyCode', () => {
    it('无记录时返回 false', async () => {
      const { service, redis } = createService();
      redis.get.mockResolvedValueOnce(null);
      await expect(service.verifyCode('a@b.com', '123456')).resolves.toBe(false);
      expect(redis.get).toHaveBeenCalledWith('verify_code:a@b.com');
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('验证码不匹配返回 false 且不删除', async () => {
      const { service, redis } = createService();
      redis.get.mockResolvedValueOnce('654321');
      await expect(service.verifyCode('a@b.com', '123456')).resolves.toBe(false);
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('匹配成功返回 true 并删除验证码（一次性）', async () => {
      const { service, redis } = createService();
      redis.get.mockResolvedValueOnce('123456');
      await expect(service.verifyCode('a@b.com', '123456')).resolves.toBe(true);
      expect(redis.del).toHaveBeenCalledWith('verify_code:a@b.com');
    });
  });
});
