import Redis from 'ioredis';
import { BULLET_CHANNEL, type BulletEnvelope } from './constants';

/**
 * F14：本实例 bullet 广播后 fire-and-forget 转播到其它实例。
 * 仅通知（信封透传帧字节）；落库由 MQ publisher 链路独立负责，两路互不依赖、
 * 任一路失败都不得阻断本进程广播。
 */
export async function publishBullet(redis: Redis, envelope: BulletEnvelope): Promise<void> {
  await redis.publish(BULLET_CHANNEL, JSON.stringify(envelope));
}

type BulletErrorStage = 'connection' | 'subscribe' | 'parse';

/**
 * 订阅弹幕转播频道，返回订阅连接（范式同 subscribeRecall，关停时可 quit）。
 * 订阅失败 3s 重试；解析出有效 BulletEnvelope 时回调 onBullet（回环抑制由调用方按 src 判定）。
 */
export function subscribeBullet(
  redis: Redis,
  onBullet: (envelope: BulletEnvelope) => void,
  onError?: (err: unknown, stage: BulletErrorStage) => void
): Redis {
  const report =
    onError ??
    ((err, stage) =>
      console.error(
        `[chat-ws] bullet ${stage}:`,
        err instanceof Error ? err.message : String(err)
      ));

  const subscriber = redis.duplicate();
  subscriber.on('error', (err: unknown) => report(err, 'connection'));

  const subscribe = () => {
    subscriber.subscribe(BULLET_CHANNEL).catch((err: unknown) => {
      report(err, 'subscribe');
      setTimeout(subscribe, 3000);
    });
  };
  subscribe();

  subscriber.on('message', (channel: string, message: string) => {
    if (channel !== BULLET_CHANNEL) return;
    try {
      const payload = JSON.parse(message) as Partial<BulletEnvelope>;
      if (payload.src && payload.roomId && typeof payload.payload === 'string') {
        onBullet(payload as BulletEnvelope);
      } else {
        report(new Error('invalid bullet envelope'), 'parse');
      }
    } catch (err) {
      report(err, 'parse');
    }
  });

  return subscriber;
}
