import { EventEmitter } from 'node:events';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { CHECKIN_CHANNEL, publishCheckin, subscribeCheckin } from '../index';

type FakeSubscriber = EventEmitter & { subscribe: (channel: string) => Promise<void> };

function makeRedis() {
  const subscriber = new EventEmitter() as FakeSubscriber;
  subscriber.subscribe = vi.fn().mockResolvedValue(undefined);
  const redis = {
    publish: vi.fn().mockResolvedValue(1),
    duplicate: vi.fn(() => subscriber)
  };
  return { redis: redis as unknown as Redis, subscriber, mock: redis };
}

describe('publishCheckin', () => {
  it('发布到 live:checkin 频道并保留动作载荷', async () => {
    const { redis, mock } = makeRedis();
    await publishCheckin(redis, {
      roomId: 'r1',
      action: 'update',
      sessionId: 's1',
      signedCount: 3
    });
    expect(mock.publish).toHaveBeenCalledWith(
      CHECKIN_CHANNEL,
      JSON.stringify({ roomId: 'r1', action: 'update', sessionId: 's1', signedCount: 3 })
    );
  });

  it('publish 失败向上抛出（由调用方 try/catch，不静默吞错）', async () => {
    const { redis, mock } = makeRedis();
    mock.publish.mockRejectedValue(new Error('redis down'));
    await expect(
      publishCheckin(redis, { roomId: 'r1', action: 'ended', sessionId: 's1' })
    ).rejects.toThrow('redis down');
  });
});

describe('subscribeCheckin', () => {
  it('订阅频道并把有效载荷回调给消费方', () => {
    const { redis, subscriber, mock } = makeRedis();
    const onCheckin = vi.fn();
    subscribeCheckin(redis, onCheckin);
    expect(subscriber.subscribe).toHaveBeenCalledWith(CHECKIN_CHANNEL);
    subscriber.emit(
      'message',
      CHECKIN_CHANNEL,
      JSON.stringify({ roomId: 'r1', action: 'started', sessionId: 's1', deadlineAt: 'x' })
    );
    expect(onCheckin).toHaveBeenCalledWith({
      roomId: 'r1',
      action: 'started',
      sessionId: 's1',
      deadlineAt: 'x'
    });
    expect(mock.duplicate).toHaveBeenCalled();
  });

  it('忽略其它频道与坏载荷并上报 parse 错误', () => {
    const { redis, subscriber } = makeRedis();
    const onCheckin = vi.fn();
    const onError = vi.fn();
    subscribeCheckin(redis, onCheckin, onError);
    subscriber.emit(
      'message',
      'other:channel',
      JSON.stringify({ roomId: 'r1', action: 'update', sessionId: 's1' })
    );
    subscriber.emit('message', CHECKIN_CHANNEL, 'not-json');
    subscriber.emit('message', CHECKIN_CHANNEL, JSON.stringify({ roomId: 'r1', action: 'nope' }));
    subscriber.emit('message', CHECKIN_CHANNEL, JSON.stringify({ action: 'update' }));
    expect(onCheckin).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls.every(([, stage]) => stage === 'parse')).toBe(true);
  });
});
