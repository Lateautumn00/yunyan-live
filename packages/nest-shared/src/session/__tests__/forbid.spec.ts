import { EventEmitter } from 'node:events';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import {
  FORBID_CHANNEL,
  forbidKey,
  readForbid,
  subscribeForbid,
  writeForbid
} from '../index';

type FakeSubscriber = EventEmitter & { subscribe: (channel: string) => Promise<void> };

function makeRedis(get: (key: string) => Promise<string | null>) {
  const subscriber = new EventEmitter() as FakeSubscriber;
  subscriber.subscribe = vi.fn().mockResolvedValue(undefined);
  const redis = {
    get: vi.fn(get),
    set: vi.fn().mockResolvedValue('OK'),
    publish: vi.fn().mockResolvedValue(1),
    duplicate: vi.fn(() => subscriber)
  };
  return { redis: redis as unknown as Redis, subscriber, mock: redis };
}

describe('readForbid', () => {
  it('无记录时视为可发言', async () => {
    const { redis } = makeRedis(async () => null);
    await expect(readForbid(redis, 'r1')).resolves.toBe(1);
  });

  it('解析存储的禁言状态 0/1', async () => {
    const zero = makeRedis(async () => '0');
    await expect(readForbid(zero.redis, 'r1')).resolves.toBe(0);
    const one = makeRedis(async () => '1');
    await expect(readForbid(one.redis, 'r1')).resolves.toBe(1);
  });

  it('Redis 故障 fail-open 放行', async () => {
    const { redis } = makeRedis(async () => {
      throw new Error('redis down');
    });
    await expect(readForbid(redis, 'r1')).resolves.toBe(1);
  });
});

describe('writeForbid', () => {
  it('写入 key 并 publish 到 live:forbid 频道', async () => {
    const { redis, mock } = makeRedis(async () => null);
    await writeForbid(redis, 'r1', 0);
    expect(mock.set).toHaveBeenCalledWith(forbidKey('r1'), '0');
    expect(mock.publish).toHaveBeenCalledWith(
      FORBID_CHANNEL,
      JSON.stringify({ roomId: 'r1', status: 0 })
    );
  });
});

describe('subscribeForbid', () => {
  it('订阅频道并把有效载荷回调给消费方', () => {
    const { redis, subscriber, mock } = makeRedis(async () => null);
    const onForbid = vi.fn();
    subscribeForbid(redis, onForbid);
    expect(subscriber.subscribe).toHaveBeenCalledWith(FORBID_CHANNEL);
    subscriber.emit('message', FORBID_CHANNEL, JSON.stringify({ roomId: 'r1', status: 0 }));
    expect(onForbid).toHaveBeenCalledWith('r1', 0);
    expect(mock.duplicate).toHaveBeenCalled();
  });

  it('忽略其它频道与坏载荷并上报 parse 错误', () => {
    const { redis, subscriber } = makeRedis(async () => null);
    const onForbid = vi.fn();
    const onError = vi.fn();
    subscribeForbid(redis, onForbid, onError);
    subscriber.emit('message', 'other:channel', JSON.stringify({ roomId: 'r1', status: 0 }));
    subscriber.emit('message', FORBID_CHANNEL, 'not-json');
    subscriber.emit('message', FORBID_CHANNEL, JSON.stringify({ status: 1 }));
    expect(onForbid).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls.every(([, stage]) => stage === 'parse')).toBe(true);
  });
});
