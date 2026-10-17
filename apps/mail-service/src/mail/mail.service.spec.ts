import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Redis } from 'ioredis';
import { MailService } from './mail.service';

function createService() {
  const mailer = { sendMail: vi.fn().mockResolvedValue(undefined) };
  const redis = {
    setex: vi.fn().mockResolvedValue('OK'),
    get: vi.fn(),
    del: vi.fn().mockResolvedValue(1),
    set: vi.fn().mockResolvedValue('OK'),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1)
  };
  const config = {};
  const service = new MailService(mailer as never, config as never, redis as unknown as Redis);
  return { service, mailer, redis };
}

describe('MailService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendCode', () => {
    it('写入 6 位验证码、TTL 300 秒，并设置 60s 冷却', async () => {
      const { service, redis } = createService();
      await service.sendCode('a@b.com');
      expect(redis.set).toHaveBeenCalledWith('verify_cooldown:a@b.com', '1', 'EX', 60, 'NX');
      expect(redis.setex).toHaveBeenCalledTimes(1);
      const code = redis.setex.mock.calls[0]?.[2] as string;
      expect(code).toMatch(/^\d{6}$/);
      expect(redis.setex.mock.calls[0]?.[1]).toBe(300);
      expect(redis.setex.mock.calls[0]?.[0]).toBe('verify_code:a@b.com');
    });

    it('冷却期内重复请求直接返回，不重发邮件', async () => {
      const { service, mailer, redis } = createService();
      redis.set.mockResolvedValueOnce(null);
      await service.sendCode('a@b.com');
      expect(mailer.sendMail).not.toHaveBeenCalled();
      expect(redis.setex).not.toHaveBeenCalled();
    });

    it('邮件主题与正文携带验证码和 5 分钟有效期说明', async () => {
      const { service, mailer } = createService();
      await service.sendCode('a@b.com');
      expect(mailer.sendMail).toHaveBeenCalledTimes(1);
      expect(mailer.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'a@b.com',
          subject: expect.stringContaining('云砚直播')
        })
      );
      expect(mailer.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.stringContaining('5 分钟内有效') })
      );
    });

    it('发送失败时吞掉异常，且不向调用方抛出（日志不落明文）', async () => {
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
      redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce('123456');
      await expect(service.verifyCode('a@b.com', '123456')).resolves.toBe(true);
      expect(redis.del).toHaveBeenCalledWith('verify_code:a@b.com');
    });

    it('验证码不匹配时失败计数 +1', async () => {
      const { service, redis } = createService();
      redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce('654321');
      redis.incr.mockResolvedValueOnce(1);
      await expect(service.verifyCode('a@b.com', '123456')).resolves.toBe(false);
      expect(redis.incr).toHaveBeenCalledWith('verify_attempts:a@b.com');
      expect(redis.expire).toHaveBeenCalledWith('verify_attempts:a@b.com', 300);
    });

    it('达到 5 次失败后设置 15 分钟锁定', async () => {
      const { service, redis } = createService();
      redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce('654321');
      redis.incr.mockResolvedValueOnce(5);
      await expect(service.verifyCode('a@b.com', '123456')).resolves.toBe(false);
      expect(redis.expire).toHaveBeenCalledWith('verify_attempts:a@b.com', 900);
    });

    it('锁定期内直接拒绝，不查询验证码', async () => {
      const { service, redis } = createService();
      redis.get.mockResolvedValueOnce('locked');
      await expect(service.verifyCode('a@b.com', '123456')).resolves.toBe(false);
      expect(redis.del).not.toHaveBeenCalled();
    });
  });
});
