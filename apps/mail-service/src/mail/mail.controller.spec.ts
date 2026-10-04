import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { Logger } from '@nestjs/common';
import { MailController } from './mail.controller';

function createController() {
  const mailService = {
    sendCode: vi.fn().mockResolvedValue(undefined),
    verifyCode: vi.fn().mockResolvedValue(true)
  };
  const controller = new MailController(mailService as never);
  return { controller, mailService };
}

beforeAll(() => {
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('MailController', () => {
  describe('sendCode', () => {
    it('透传 email 并返回 ok 信封', async () => {
      const { controller, mailService } = createController();
      const res = await controller.sendCode({ email: 'a@b.com' });
      expect(mailService.sendCode).toHaveBeenCalledWith('a@b.com');
      expect(res).toEqual({ code: '0', msg: 'success' });
    });
  });

  describe('verifyCode', () => {
    it('校验通过返回 ok 且 valid=true', async () => {
      const { controller, mailService } = createController();
      mailService.verifyCode.mockResolvedValueOnce(true);
      const res = await controller.verifyCode({ email: 'a@b.com', code: '123456' });
      expect(mailService.verifyCode).toHaveBeenCalledWith('a@b.com', '123456');
      expect(res).toEqual({ code: '0', msg: 'success', valid: true });
    });

    it('校验失败返回 fail 信封且 valid=false', async () => {
      const { controller, mailService } = createController();
      mailService.verifyCode.mockResolvedValueOnce(false);
      const res = await controller.verifyCode({ email: 'a@b.com', code: '000000' });
      expect(res).toEqual({ code: '1', msg: '验证码无效或已过期', valid: false });
    });
  });

  describe('handleSendCode', () => {
    it('MQ 消息同样透传 email 给 sendCode，无返回值', async () => {
      const { controller, mailService } = createController();
      const res = await controller.handleSendCode({ email: 'mq@b.com' });
      expect(mailService.sendCode).toHaveBeenCalledTimes(1);
      expect(mailService.sendCode).toHaveBeenCalledWith('mq@b.com');
      expect(res).toBeUndefined();
    });
  });
});
