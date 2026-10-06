import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionService } from '../store';
import { SESSION_KICK_CHANNEL, SESSION_TTL_SECONDS, sessionKey } from '../constants';

vi.mock('crypto', async importOriginal => {
  const actual = await importOriginal<typeof import('crypto')>();
  return { ...actual, randomUUID: () => 'sid-fixed' };
});

function makeRedis() {
  const redis = {
    get: vi.fn(async (_key: string): Promise<string | null> => null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    publish: vi.fn(async () => 0)
  };
  return redis;
}

function setup() {
  const redis = makeRedis();
  const service = new SessionService(redis as unknown as Redis);
  return { service, redis };
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  errSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SessionService.createSession', () => {
  it('无旧会话时签发 sid 并写入 TTL，不广播顶下线', async () => {
    const { service, redis } = setup();
    const res = await service.createSession('g1');
    expect(res).toEqual({ sid: 'sid-fixed', oldSid: null });
    expect(redis.get).toHaveBeenCalledWith(sessionKey('g1'));
    expect(redis.set).toHaveBeenCalledWith(
      sessionKey('g1'),
      'sid-fixed',
      'EX',
      SESSION_TTL_SECONDS
    );
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it('存在旧会话时广播 KickPayload 并返回旧 sid', async () => {
    const { service, redis } = setup();
    redis.get.mockResolvedValueOnce('old-sid');
    const res = await service.createSession('g1');
    expect(res).toEqual({ sid: 'sid-fixed', oldSid: 'old-sid' });
    expect(redis.publish).toHaveBeenCalledWith(
      SESSION_KICK_CHANNEL,
      JSON.stringify({ guid: 'g1', oldSid: 'old-sid' })
    );
    expect(logSpy).toHaveBeenCalledWith('Session replaced for guid=g1, kicked old sid=old-sid');
  });

  it('旧 sid 与新 sid 相同时不广播', async () => {
    const { service, redis } = setup();
    redis.get.mockResolvedValueOnce('sid-fixed');
    const res = await service.createSession('g1');
    expect(res).toEqual({ sid: 'sid-fixed', oldSid: 'sid-fixed' });
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it('Redis 读取失败时 fail-open 仍签发新 sid', async () => {
    const { service, redis } = setup();
    redis.get.mockRejectedValueOnce(new Error('redis down'));
    const res = await service.createSession('g1');
    expect(res).toEqual({ sid: 'sid-fixed', oldSid: null });
    expect(redis.set).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith('createSession failed for guid=g1: Error: redis down');
  });

  it('Redis 写入失败时同样 fail-open', async () => {
    const { service, redis } = setup();
    redis.set.mockRejectedValueOnce(new Error('readonly'));
    const res = await service.createSession('g1');
    expect(res).toEqual({ sid: 'sid-fixed', oldSid: null });
    expect(errSpy).toHaveBeenCalledWith('createSession failed for guid=g1: Error: readonly');
  });
});

describe('SessionService.validateSid', () => {
  it('缺 guid 或 sid 返回 expired', async () => {
    const { service } = setup();
    await expect(service.validateSid(undefined, 's1')).resolves.toBe('expired');
    await expect(service.validateSid('g1', undefined)).resolves.toBe('expired');
  });

  it('sid 匹配 ok，不匹配 kicked，无记录 expired', async () => {
    const { service, redis } = setup();
    redis.get.mockResolvedValueOnce('s1');
    await expect(service.validateSid('g1', 's1')).resolves.toBe('ok');
    redis.get.mockResolvedValueOnce('s1');
    await expect(service.validateSid('g1', 'other')).resolves.toBe('kicked');
    redis.get.mockResolvedValueOnce(null);
    await expect(service.validateSid('g1', 's1')).resolves.toBe('expired');
  });

  it('Redis 故障返回 fail-open 并记录', async () => {
    const { service, redis } = setup();
    redis.get.mockRejectedValueOnce(new Error('down'));
    await expect(service.validateSid('g1', 's1')).resolves.toBe('fail-open');
    expect(errSpy).toHaveBeenCalledWith('validateSid fail-open for guid=g1: Error: down');
  });
});

describe('SessionService.removeSession', () => {
  it('缺 sid 直接返回不触碰 Redis', async () => {
    const { service, redis } = setup();
    await service.removeSession('g1', undefined);
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('当前 sid 匹配时删除记录', async () => {
    const { service, redis } = setup();
    redis.get.mockResolvedValueOnce('s1');
    await service.removeSession('g1', 's1');
    expect(redis.del).toHaveBeenCalledWith(sessionKey('g1'));
  });

  it('sid 已被顶替时不删除', async () => {
    const { service, redis } = setup();
    redis.get.mockResolvedValueOnce('newer-sid');
    await service.removeSession('g1', 's1');
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('Redis 故障时吞掉错误仅记录', async () => {
    const { service, redis } = setup();
    redis.get.mockRejectedValueOnce(new Error('down'));
    await expect(service.removeSession('g1', 's1')).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith('removeSession failed for guid=g1: Error: down');
  });
});

describe('SessionService.touchSession', () => {
  it('续期到会话 TTL', async () => {
    const { service, redis } = setup();
    await service.touchSession('g1');
    expect(redis.expire).toHaveBeenCalledWith(sessionKey('g1'), SESSION_TTL_SECONDS);
  });

  it('Redis 故障时吞掉错误仅记录', async () => {
    const { service, redis } = setup();
    redis.expire.mockRejectedValueOnce(new Error('down'));
    await expect(service.touchSession('g1')).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith('touchSession failed for guid=g1: Error: down');
  });
});
