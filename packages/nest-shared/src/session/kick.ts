import Redis from 'ioredis';
import { KickPayload, SESSION_KICK_CHANNEL, SessionState, sessionKey } from './constants';

/**
 * 校验会话 sid 是否为当前有效会话（fail-open：Redis 故障时放行）。
 * 供 HTTP 网关（SessionService.validateSid）与 WS 网关复用。
 */
export async function validateSession(
  redis: Redis,
  guid?: string,
  sid?: string,
  onFailOpen?: (err: unknown) => void,
): Promise<SessionState> {
  if (!guid || !sid) return 'expired';
  try {
    const current = await redis.get(sessionKey(guid));
    if (current === null) return 'expired';
    return current === sid ? 'ok' : 'kicked';
  } catch (err) {
    onFailOpen?.(err);
    return 'fail-open';
  }
}

export type KickErrorStage = 'connection' | 'subscribe' | 'parse';

/**
 * 订阅顶下线频道，返回订阅连接（调用方可在关停时 quit）。
 * 订阅失败 3s 重试；解析出有效 KickPayload 时回调 onKick。
 */
export function subscribeKick(
  redis: Redis,
  onKick: (guid: string, oldSid: string) => void,
  onError?: (err: unknown, stage: KickErrorStage) => void,
): Redis {
  const report =
    onError ??
    ((err, stage) =>
      console.error(`[session] kick ${stage}:`, err instanceof Error ? err.message : String(err)));

  const subscriber = redis.duplicate();
  subscriber.on('error', (err: unknown) => report(err, 'connection'));

  const subscribe = () => {
    subscriber.subscribe(SESSION_KICK_CHANNEL).catch((err: unknown) => {
      report(err, 'subscribe');
      setTimeout(subscribe, 3000);
    });
  };
  subscribe();

  subscriber.on('message', (channel: string, message: string) => {
    if (channel !== SESSION_KICK_CHANNEL) return;
    try {
      const { guid, oldSid } = JSON.parse(message) as Partial<KickPayload>;
      if (guid && oldSid) onKick(guid, oldSid);
    } catch (err) {
      report(err, 'parse');
    }
  });

  return subscriber;
}
