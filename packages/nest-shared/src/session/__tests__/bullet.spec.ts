import { EventEmitter } from 'node:events';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { BULLET_CHANNEL, publishBullet, subscribeBullet } from '../index';

type FakeSubscriber = EventEmitter & { subscribe: (channel: string) => Promise<void> };

function makeRedis(subscribeImpl?: () => Promise<void>) {
  const subscriber = new EventEmitter() as FakeSubscriber;
  subscriber.subscribe = vi.fn(subscribeImpl ?? (() => Promise.resolve(undefined)));
  const redis = {
    publish: vi.fn().mockResolvedValue(1),
    duplicate: vi.fn(() => subscriber)
  };
  return { redis: redis as unknown as Redis, subscriber, mock: redis };
}

describe('publishBullet', () => {
  it('信封序列化后 publish 到 live:bullet 频道', async () => {
    const { redis, mock } = makeRedis();
    await publishBullet(redis, { src: 'node-a', roomId: 'r1', payload: '{"type":"bullet"}' });
    expect(mock.publish).toHaveBeenCalledWith(
      BULLET_CHANNEL,
      JSON.stringify({ src: 'node-a', roomId: 'r1', payload: '{"type":"bullet"}' })
    );
  });
});

describe('subscribeBullet', () => {
  it('订阅频道并把有效信封回调给消费方', () => {
    const { redis, subscriber, mock } = makeRedis();
    const onBullet = vi.fn();
    subscribeBullet(redis, onBullet);
    expect(subscriber.subscribe).toHaveBeenCalledWith(BULLET_CHANNEL);
    subscriber.emit(
      'message',
      BULLET_CHANNEL,
      JSON.stringify({ src: 'node-a', roomId: 'r1', payload: '{"type":"bullet","data":{}}' })
    );
    expect(onBullet).toHaveBeenCalledWith({
      src: 'node-a',
      roomId: 'r1',
      payload: '{"type":"bullet","data":{}}'
    });
    expect(mock.duplicate).toHaveBeenCalled();
  });

  it('忽略其它频道与坏载荷并上报 parse 错误', () => {
    const { redis, subscriber } = makeRedis();
    const onBullet = vi.fn();
    const onError = vi.fn();
    subscribeBullet(redis, onBullet, onError);
    subscriber.emit(
      'message',
      'other:channel',
      JSON.stringify({ src: 'node-a', roomId: 'r1', payload: '{}' })
    );
    subscriber.emit('message', BULLET_CHANNEL, 'not-json');
    subscriber.emit('message', BULLET_CHANNEL, JSON.stringify({ roomId: 'r1', payload: '{}' }));
    subscriber.emit(
      'message',
      BULLET_CHANNEL,
      JSON.stringify({ src: 'node-a', roomId: 'r1', payload: 42 })
    );
    expect(onBullet).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls.every(([, stage]) => stage === 'parse')).toBe(true);
  });
});
