import Redis from 'ioredis';
import { MODERATION_CHANNEL, type ModerationPayload } from './constants';

/**
 * F3：写库成功后广播单用户禁言/踢出事件（供网关 PushController 调用）。
 * 状态事实在 PG（chat_moderation），本频道只做"通知已变"——chat-ws 转播帧 + 更新内存视图。
 */
export async function publishModeration(redis: Redis, payload: ModerationPayload): Promise<void> {
  await redis.publish(MODERATION_CHANNEL, JSON.stringify(payload));
}

type ModerationErrorStage = 'connection' | 'subscribe' | 'parse';

/**
 * 订阅单用户禁言/踢出频道，返回订阅连接（范式同 subscribeForbid，关停时可 quit）。
 * 订阅失败 3s 重试；解析出有效 ModerationPayload 时回调 onModeration。
 */
export function subscribeModeration(
  redis: Redis,
  onModeration: (payload: ModerationPayload) => void,
  onError?: (err: unknown, stage: ModerationErrorStage) => void
): Redis {
  const report =
    onError ??
    ((err, stage) =>
      console.error(
        `[chat-ws] moderation ${stage}:`,
        err instanceof Error ? err.message : String(err)
      ));

  const subscriber = redis.duplicate();
  subscriber.on('error', (err: unknown) => report(err, 'connection'));

  const subscribe = () => {
    subscriber.subscribe(MODERATION_CHANNEL).catch((err: unknown) => {
      report(err, 'subscribe');
      setTimeout(subscribe, 3000);
    });
  };
  subscribe();

  subscriber.on('message', (channel: string, message: string) => {
    if (channel !== MODERATION_CHANNEL) return;
    try {
      const payload = JSON.parse(message) as Partial<ModerationPayload>;
      if (
        payload.roomId &&
        payload.userId &&
        (payload.kind === 'mute' || payload.kind === 'kick') &&
        (payload.op === 'set' || payload.op === 'release')
      ) {
        onModeration(payload as ModerationPayload);
      } else {
        report(new Error('invalid moderation payload'), 'parse');
      }
    } catch (err) {
      report(err, 'parse');
    }
  });

  return subscriber;
}
