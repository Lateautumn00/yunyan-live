import { describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { SendCodeDto } from '@yunyan-live/nest-shared';
import { MailController } from './mail.controller';

function createController() {
  const sendCode = vi.fn(() => of({ code: '0', msg: 'ok' }));
  const mailClient = {
    getService: vi.fn(() => ({ sendCode }))
  };
  const controller = new MailController(mailClient as never);
  controller.onModuleInit();
  return { controller, mailClient, sendCode };
}

describe('MailController', () => {
  it('onModuleInit 按 MailService 名称解析 gRPC 客户端', () => {
    const { mailClient } = createController();
    expect(mailClient.getService).toHaveBeenCalledWith('MailService');
  });

  it('sendCode 透传 email 并返回上游信封', async () => {
    const { controller, sendCode } = createController();
    const dto = Object.assign(new SendCodeDto(), { email: 'a@b.com' });
    await expect(controller.sendCode(dto)).resolves.toEqual({ code: '0', msg: 'ok' });
    expect(sendCode).toHaveBeenCalledWith({ email: 'a@b.com' });
  });

  it('gRPC 错误经 grpcCall 映射为 HttpException', async () => {
    const { controller, sendCode } = createController();
    sendCode.mockReturnValueOnce(throwError(() => ({ code: 5, details: '无此邮箱' })));
    const dto = Object.assign(new SendCodeDto(), { email: 'a@b.com' });
    const err = await controller.sendCode(dto).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(404);
    expect((err as HttpException).message).toBe('无此邮箱');
  });

  it('调用前未初始化会抛错（onModuleInit 必须先执行）', async () => {
    const controller = new MailController({
      getService: vi.fn()
    } as never);
    const dto = Object.assign(new SendCodeDto(), { email: 'a@b.com' });
    await expect(controller.sendCode(dto)).rejects.toThrow();
  });
});
