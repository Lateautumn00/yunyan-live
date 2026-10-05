import { afterEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  JWT_EXPIRES_IN_DEFAULT,
  JWT_EXPIRES_IN_SECONDS,
  jwtModuleAsyncOptions,
  requireJwtSecret,
  verifyToken
} from '../index';

const payload = { sub: 'u1', email: 'a@b.com', role: 1, sid: 's1' };

describe('verifyToken', () => {
  it('往返签发与校验', () => {
    const token = jwt.sign(payload, 'secret');
    expect(verifyToken(token, 'secret')).toEqual(expect.objectContaining(payload));
  });

  it('秘钥不匹配或伪造 token 返回 null', () => {
    const token = jwt.sign(payload, 'secret');
    expect(verifyToken(token, 'other')).toBeNull();
    expect(verifyToken('not-a-token', 'secret')).toBeNull();
  });

  it('过期 token 返回 null', () => {
    const token = jwt.sign(payload, 'secret', { expiresIn: -10 });
    expect(verifyToken(token, 'secret')).toBeNull();
  });

  it('不带 sid 的载荷同样可用', () => {
    const token = jwt.sign({ sub: 'u1', email: 'a@b.com', role: 2 }, 'secret');
    expect(verifyToken(token, 'secret')).toEqual(
      expect.objectContaining({ sub: 'u1', email: 'a@b.com', role: 2 })
    );
  });
});

describe('requireJwtSecret', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('返回已配置的秘钥', () => {
    expect(requireJwtSecret({ JWT_SECRET: 'strong' })).toBe('strong');
  });

  it('缺失时打印指引并 process.exit(1)', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = requireJwtSecret({});
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy).toHaveBeenCalledWith(
      'JWT_SECRET is not set. Copy .env.example to .env and set a strong secret.'
    );
    expect(res).toBe('');
    expect(JWT_EXPIRES_IN_DEFAULT).toBe('7d');
    expect(JWT_EXPIRES_IN_SECONDS).toBe(7 * 24 * 60 * 60);
  });
});

describe('jwtModuleAsyncOptions', () => {
  it('注入 ConfigService 并提供 secret 与 7d 默认有效期', () => {
    const options = jwtModuleAsyncOptions();
    expect(options.inject?.length).toBe(1);
    const config = {
      get: vi.fn((key: string, def?: string) => {
        if (key === 'JWT_SECRET') return 'secret';
        return def;
      })
    };
    const factory = options.useFactory as (c: unknown) => {
      secret: string;
      signOptions: { expiresIn: string };
    };
    const built = factory(config);
    expect(built).toEqual({ secret: 'secret', signOptions: { expiresIn: '7d' } });
    expect(config.get).toHaveBeenCalledWith('JWT_EXPIRES_IN', '7d');
  });

  it('JWT_EXPIRES_IN 已配置时覆盖默认值', () => {
    const options = jwtModuleAsyncOptions();
    const config = {
      get: vi.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'secret';
        if (key === 'JWT_EXPIRES_IN') return '1d';
        return undefined;
      })
    };
    const factory = options.useFactory as (c: unknown) => { signOptions: { expiresIn: string } };
    expect(factory(config).signOptions).toEqual({ expiresIn: '1d' });
  });
});
