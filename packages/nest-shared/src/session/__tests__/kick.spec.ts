import { EventEmitter } from 'node:events';
import type { Redis } from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeKick, validateSession } from '../kick';
import { SESSION_KICK_CHANNEL } from '../constants';

type FakeSubscriber = EventEmitter & {
  subscribe: ReturnType<typeof vi.fn>;
};

function makeRedis() {
  const subscriber = new EventEmitter() as FakeSubscriber;
  subscriber.subscribe = vi.fn().mockResolvedValue(undefined);
  const redis = {
    get: vi.fn(async (_key: string): Promise<string | null> => null),
    duplicate: vi.fn(() => subscriber)
  };
  return { redis: redis as unknown as Redis, subscriber, mock: redis };
}

describe('validateSession', () => {
  it('缺 guid 或 sid 返回 expired', async () => {
    const { redis } = makeRedis();
    await expect(validateSession(redis, undefined, 's1')).resolves.toBe('expired');
    await expect(validateSession(redis, 'g1', undefined)).resolves.toBe('expired');
  });

  it('sid 与当前记录一致返回 ok', async () => {
    const { redis, mock } = makeRedis();
    mock.get.mockResolvedValue('s1');
    await expect(validateSession(redis, 'g1', 's1')).resolves.toBe('ok');
    expect(mock.get).toHaveBeenCalledWith('session:g1');
  });

  it('记录被替换返回 kicked，无记录返回 expired', async () => {
    const { redis, mock } = makeRedis();
    mock.get.mockResolvedValue('newer');
    await expect(validateSession(redis, 'g1', 's1')).resolves.toBe('kicked');
    mock.get.mockResolvedValue(null);
    await expect(validateSession(redis, 'g1', 's1')).resolves.toBe('expired');
  });

  it('Redis 故障返回 fail-open 并回调 onFailOpen', async () => {
    const { redis, mock } = makeRedis();
    const err = new Error('down');
    mock.get.mockRejectedValue(err);
    const onFailOpen = vi.fn();
    await expect(validateSession(redis, 'g1', 's1', onFailOpen)).resolves.toBe('fail-open');
    expect(onFailOpen).toHaveBeenCalledWith(err);
  });

  it('未提供 onFailOpen 时也静默放行', async () => {
    const { redis, mock } = makeRedis();
    mock.get.mockRejectedValue(new Error('down'));
    await expect(validateSession(redis, 'g1', 's1')).resolves.toBe('fail-open');
  });
});

describe('subscribeKick', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('订阅顶下线频道并回调有效载荷', () => {
    const { redis, subscriber, mock } = makeRedis();
    const onKick = vi.fn();
    const res = subscribeKick(redis, onKick);
    expect(res).toBe(subscriber);
    expect(mock.duplicate).toHaveBeenCalled();
    expect(subscriber.subscribe).toHaveBeenCalledWith(SESSION_KICK_CHANNEL);
    subscriber.emit(
      'message',
      SESSION_KICK_CHANNEL,
      JSON.stringify({ guid: 'g1', oldSid: 'old' })
    );
    expect(onKick).toHaveBeenCalledWith('g1', 'old');
  });

  it('忽略其它频道与非法载荷', () => {
    const { redis, subscriber } = makeRedis();
    const onKick = vi.fn();
    const onError = vi.fn();
    subscribeKick(redis, onKick, onError);
    subscriber.emit('message', 'other:channel', JSON.stringify({ guid: 'g1', oldSid: 'old' }));
    subscriber.emit('message', SESSION_KICK_CHANNEL, 'not-json');
    subscriber.emit('message', SESSION_KICK_CHANNEL, JSON.stringify({ guid: 'g1' }));
    subscriber.emit('message', SESSION_KICK_CHANNEL, JSON.stringify({ oldSid: 'old' }));
    expect(onKick).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(SyntaxError), 'parse');
  });

  it('连接错误按 connection 阶段上报', () => {
    const { redis, subscriber } = makeRedis();
    const onError = vi.fn();
    subscribeKick(redis, vi.fn(), onError);
    const err = new Error('conn lost');
    subscriber.emit('error', err);
    expect(onError).toHaveBeenCalledWith(err, 'connection');
  });

  it('订阅失败按 subscribe 阶段上报并 3s 后重试', async () => {
    const { redis, subscriber } = makeRedis();
    const onError = vi.fn();
    subscriber.subscribe
      .mockRejectedValueOnce(new Error('sub fail'))
      .mockResolvedValue(undefined);
    subscribeKick(redis, vi.fn(), onError);
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'subscribe');
    expect(subscriber.subscribe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(subscriber.subscribe).toHaveBeenCalledTimes(2);
  });

  it('未提供 onError 时用 console.error 兜底', () => {
    const { redis, subscriber } = makeRedis();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    subscribeKick(redis, vi.fn());
    subscriber.emit('message', SESSION_KICK_CHANNEL, 'not-json');
    expect(consoleSpy).toHaveBeenCalledWith('[session] kick parse:', expect.stringContaining('Unexpected token'));
    consoleSpy.mockRestore();
  });
});
