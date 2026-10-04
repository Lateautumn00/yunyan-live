import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { Observable, of, throwError } from 'rxjs';
import {
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateUserNameDto
} from '@yunyan-live/nest-shared';
import { AuthController } from './auth.controller';

function createController() {
  const authService = {
    login: vi.fn(() => of({ code: '0', msg: 'ok', guid: 'g1', access_token: 'upstream.jwt' })),
    register: vi.fn(() => of({ code: '0', msg: 'ok', guid: 'g1' })),
    resetPassword: vi.fn(() => of({ code: '0', msg: 'ok' })),
    changePassword: vi.fn(() => of({ code: '0', msg: 'ok' })),
    getUser: vi.fn(
      (): Observable<{
        code: string;
        msg: string;
        data?: { id: string; username: string; email: string; role: number };
      }> =>
        of({
          code: '0',
          msg: 'ok',
          data: { id: 'u1', username: '乌同学', email: 'a@b.com', role: 1 }
        })
    ),
    updateUserName: vi.fn(() => of({ code: '0', msg: 'ok' }))
  };
  const authClient = { getService: vi.fn(() => authService) };
  const jwt = {
    decode: vi.fn(),
    sign: vi.fn(() => 'signed.token')
  };
  const session = {
    createSession: vi.fn(async () => ({ sid: 'SID1', oldSid: null })),
    removeSession: vi.fn(async () => undefined),
    touchSession: vi.fn(async () => undefined)
  };
  const controller = new AuthController(
    authClient as never,
    jwt as never,
    session as never
  );
  controller.onModuleInit();
  return { controller, authService, authClient, jwt, session };
}

function loginDto() {
  return Object.assign(new LoginDto(), { email: 'a@b.com', password: 'p' });
}

beforeAll(() => {
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AuthController.onModuleInit', () => {
  it('按 AuthService 名称解析 gRPC 客户端', () => {
    const { authClient } = createController();
    expect(authClient.getService).toHaveBeenCalledWith('AuthService');
  });
});

describe('AuthController.login', () => {
  it('上游令牌可解出载荷时按载荷重签，并携带新 sid', async () => {
    const { controller, authService, jwt, session } = createController();
    authService.login.mockReturnValueOnce(
      of({ code: '0', msg: 'ok', guid: 'g1', access_token: 'upstream.jwt', role: 1 })
    );
    jwt.decode.mockReturnValueOnce({ sub: 'u1', email: 'a@b.com', role: 3 });

    const res = await controller.login(loginDto());

    expect(authService.login).toHaveBeenCalledWith({ email: 'a@b.com', password: 'p' });
    expect(session.createSession).toHaveBeenCalledWith('g1');
    expect(jwt.decode).toHaveBeenCalledWith('upstream.jwt');
    expect(jwt.sign).toHaveBeenCalledWith({
      sub: 'u1',
      email: 'a@b.com',
      role: 3,
      sid: 'SID1'
    });
    expect(res).toEqual({ token: 'signed.token', guid: 'g1', role: 1 });
  });

  it('载荷解不出时回退 guid/入参邮箱/角色 2', async () => {
    const { controller, jwt, session } = createController();
    jwt.decode.mockReturnValueOnce(null);

    await controller.login(loginDto());

    expect(session.createSession).toHaveBeenCalledWith('g1');
    expect(jwt.sign).toHaveBeenCalledWith({
      sub: 'g1',
      email: 'a@b.com',
      role: 2,
      sid: 'SID1'
    });
  });

  it('载荷解不出但上游带 role 时采用上游角色', async () => {
    const { controller, authService, jwt } = createController();
    authService.login.mockReturnValueOnce(
      of({ code: '0', msg: 'ok', guid: 'g1', access_token: '', role: 5 })
    );
    jwt.decode.mockReturnValueOnce(null);

    await controller.login(loginDto());

    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'g1', role: 5 })
    );
  });

  it('gRPC 登录失败时不创建会话', async () => {
    const { controller, authService, session } = createController();
    authService.login.mockReturnValueOnce(
      throwError(() => ({ code: 5, details: '用户不存在' }))
    );
    await expect(controller.login(loginDto())).rejects.toThrow('用户不存在');
    expect(session.createSession).not.toHaveBeenCalled();
  });
});

describe('AuthController.register / resetPassword / updateUserName', () => {
  it('register 字段映射：userName→username，role 缺省 2', async () => {
    const { controller, authService } = createController();
    const dto = Object.assign(new RegisterDto(), {
      userName: 'u2',
      email: 'a@b.com',
      password: 'p',
      code: '123456'
    });
    const res = await controller.register(dto);
    expect(authService.register).toHaveBeenCalledWith({
      username: 'u2',
      email: 'a@b.com',
      password: 'p',
      code: '123456',
      role: 2
    });
    expect(res).toEqual({ code: '0', msg: 'ok', guid: 'g1' });
  });

  it('register 显式 role 原样透传', async () => {
    const { controller, authService } = createController();
    const dto = Object.assign(new RegisterDto(), {
      userName: 'u2',
      email: 'a@b.com',
      password: 'p',
      code: '123456',
      role: 9
    });
    await controller.register(dto);
    expect(authService.register).toHaveBeenCalledWith(expect.objectContaining({ role: 9 }));
  });

  it('resetPassword DTO 原样透传', async () => {
    const { controller, authService } = createController();
    const dto = Object.assign(new ResetPasswordDto(), {
      email: 'a@b.com',
      code: '123456',
      password: 'np'
    });
    await controller.resetPassword(dto);
    expect(authService.resetPassword).toHaveBeenCalledWith(dto);
  });

  it('updateUserName 映射为 user_id/username', async () => {
    const { controller, authService } = createController();
    const dto = Object.assign(new UpdateUserNameDto(), { userName: '新名字' });
    await controller.updateUserName(dto, { user: { userId: 'u1' } });
    expect(authService.updateUserName).toHaveBeenCalledWith({
      user_id: 'u1',
      username: '新名字'
    });
  });
});

describe('AuthController.logout', () => {
  it('携带 sid 时移除会话', async () => {
    const { controller, session } = createController();
    const res = await controller.logout({ user: { userId: 'u1', sid: 'S1' } });
    expect(session.removeSession).toHaveBeenCalledWith('u1', 'S1');
    expect(res).toEqual({ success: true });
  });

  it('缺少 sid 时仍调用移除（由 SessionService 判空）', async () => {
    const { controller, session } = createController();
    await controller.logout({ user: { userId: 'u1' } });
    expect(session.removeSession).toHaveBeenCalledWith('u1', undefined);
  });
});

describe('AuthController.changePassword', () => {
  it('映射 snake_case 并附带 user-id 元数据', async () => {
    const { controller, authService } = createController();
    let capturedMetadata: Metadata | undefined;
    authService.changePassword.mockImplementation((...args: unknown[]) => {
      capturedMetadata = args[1] as Metadata;
      return of({ code: '0', msg: 'ok' });
    });
    const dto = Object.assign(new ChangePasswordDto(), {
      oldPassword: 'old',
      password: 'new'
    });
    await controller.changePassword(dto, { user: { userId: 'u1' } });
    expect(authService.changePassword).toHaveBeenCalledWith(
      { user_id: 'u1', old_password: 'old', new_password: 'new' },
      expect.any(Metadata)
    );
    expect(capturedMetadata).toBeInstanceOf(Metadata);
    expect(capturedMetadata?.get('user-id')[0]?.toString()).toBe('u1');
  });
});

describe('AuthController.getMe', () => {
  it('刷新会话并按 req.user 重签 token，返回用户资料', async () => {
    const { controller, session, jwt } = createController();
    const res = await controller.getMe({
      user: { userId: 'u1', email: 'a@b.com', role: 1, sid: 'S1' }
    });
    expect(session.touchSession).toHaveBeenCalledWith('u1');
    expect(jwt.sign).toHaveBeenCalledWith({
      sub: 'u1',
      email: 'a@b.com',
      role: 1,
      sid: 'S1'
    });
    expect(res).toEqual({
      token: 'signed.token',
      guid: 'u1',
      userName: '乌同学',
      email: 'a@b.com',
      role: 1
    });
  });

  it('上游缺 data 时仍会 touch/重签，最终在返回体求值抛错（锁定现状）', async () => {
    const { controller, authService, session, jwt } = createController();
    authService.getUser.mockReturnValueOnce(of({ code: '0', msg: 'ok' }));
    await expect(
      controller.getMe({ user: { userId: 'u1', email: 'a@b.com', role: 1 } })
    ).rejects.toThrow(TypeError);
    expect(session.touchSession).toHaveBeenCalledWith('u1');
    expect(jwt.sign).toHaveBeenCalled();
  });

  it('上游 gRPC 失败时错误经 grpcCall 映射', async () => {
    const { controller, authService } = createController();
    authService.getUser.mockReturnValueOnce(
      throwError(() => ({ code: 16, details: '未登录' }))
    );
    await expect(
      controller.getMe({ user: { userId: 'u1', email: 'a@b.com', role: 1 } })
    ).rejects.toThrow('未登录');
  });
});

describe('AuthController.getUserById', () => {
  it('只返回 userId 与 userName 两个字段', async () => {
    const { controller } = createController();
    const res = await controller.getUserById('u1');
    expect(res).toEqual({ userId: 'u1', userName: '乌同学' });
  });

  it('上游缺 data 时抛错（锁定现状非空断言）', async () => {
    const { controller, authService } = createController();
    authService.getUser.mockReturnValueOnce(of({ code: '0', msg: 'ok' }));
    await expect(controller.getUserById('u1')).rejects.toThrow(TypeError);
  });
});
