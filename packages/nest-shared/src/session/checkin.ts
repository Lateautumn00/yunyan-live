import Redis from 'ioredis';
import { CHECKIN_ACTIONS, CHECKIN_CHANNEL, type CheckinPayload } from './constants';

/**
 * 发布签到状态变更到房间频道（供网关 CheckinController 调用）。
 * 刻意不在此吞错：调用方须自行 try/catch——广播失败不得影响已落库的签到响应。
 */
export async function publishCheckin(redis: Redis, payload: CheckinPayload): Promise<void> {
  await redis.publish(CHECKIN_CHANNEL, JSON.stringify(payload));
}

type CheckinErrorStage = 'connection' | 'subscribe' | 'parse';

/**
 * 订阅签到频道，返回订阅连接（范式同 subscribeForbid，关停时可 quit）。
 * 订阅失败 3s 重试；解析出有效 CheckinPayload 时回调 onCheckin。
 */
export function subscribeCheckin(
  redis: Redis,
  onCheckin: (payload: CheckinPayload) => void,
  onError?: (err: unknown, stage: CheckinErrorStage) => void
): Redis {
  const report =
    onError ??
    ((err, stage) =>
      console.error(`[live] checkin ${stage}:`, err instanceof Error ? err.message : String(err)));

  const subscriber = redis.duplicate();
  subscriber.on('error', (err: unknown) => report(err, 'connection'));

  const subscribe = () => {
    subscriber.subscribe(CHECKIN_CHANNEL).catch((err: unknown) => {
      report(err, 'subscribe');
      setTimeout(subscribe, 3000);
    });
  };
  subscribe();

  subscriber.on('message', (channel: string, message: string) => {
    if (channel !== CHECKIN_CHANNEL) return;
    try {
      const payload = JSON.parse(message) as Partial<CheckinPayload>;
      if (
        payload.roomId &&
        payload.sessionId &&
        typeof payload.action === 'string' &&
        (CHECKIN_ACTIONS as readonly string[]).includes(payload.action)
      ) {
        onCheckin(payload as CheckinPayload);
      } else {
        report(new Error('missing roomId/sessionId/action'), 'parse');
      }
    } catch (err) {
      report(err, 'parse');
    }
  });

  return subscriber;
}
