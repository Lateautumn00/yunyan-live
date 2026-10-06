import Redis from 'ioredis';
import {
  FORBID_ALLOWED,
  FORBID_CHANNEL,
  ForbidPayload,
  forbidKey
} from './constants';

/**
 * 读取教室禁言状态：无记录视为可发言（FORBID_ALLOWED）；Redis 故障 fail-open 放行。
 * 供 chat-ws-service 在连接建立与 msg 轮询时读取。
 */
export async function readForbid(redis: Redis, roomId: string): Promise<number> {
  try {
    const value = await redis.get(forbidKey(roomId));
    if (value === null) return FORBID_ALLOWED;
    return value === '0' ? 0 : FORBID_ALLOWED;
  } catch {
    return FORBID_ALLOWED;
  }
}

/** 写入教室禁言状态并广播到房间频道（供网关 PushController 调用）。 */
export async function writeForbid(redis: Redis, roomId: string, status: number): Promise<void> {
  await redis.set(forbidKey(roomId), String(status));
  await redis.publish(FORBID_CHANNEL, JSON.stringify({ roomId, status } satisfies ForbidPayload));
}

type ForbidErrorStage = 'connection' | 'subscribe' | 'parse';

/**
 * 订阅禁言频道，返回订阅连接（范式同 subscribeKick，关停时可 quit）。
 * 订阅失败 3s 重试；解析出有效 ForbidPayload 时回调 onForbid。
 */
export function subscribeForbid(
  redis: Redis,
  onForbid: (roomId: string, status: number) => void,
  onError?: (err: unknown, stage: ForbidErrorStage) => void
): Redis {
  const report =
    onError ??
    ((err, stage) =>
      console.error(`[live] forbid ${stage}:`, err instanceof Error ? err.message : String(err)));

  const subscriber = redis.duplicate();
  subscriber.on('error', (err: unknown) => report(err, 'connection'));

  const subscribe = () => {
    subscriber.subscribe(FORBID_CHANNEL).catch((err: unknown) => {
      report(err, 'subscribe');
      setTimeout(subscribe, 3000);
    });
  };
  subscribe();

  subscriber.on('message', (channel: string, message: string) => {
    if (channel !== FORBID_CHANNEL) return;
    try {
      const payload = JSON.parse(message) as Partial<ForbidPayload>;
      if (payload.roomId && typeof payload.status === 'number') {
        onForbid(payload.roomId, payload.status);
      } else {
        report(new Error('missing roomId/status'), 'parse');
      }
    } catch (err) {
      report(err, 'parse');
    }
  });

  return subscriber;
}
