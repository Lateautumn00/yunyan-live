import Redis from 'ioredis';
import { RECALL_CHANNEL, type RecallPayload } from './constants';

/**
 * F4：撤回写库成功后广播（供网关 PushController 调用）。
 * 撤回事实在 PG（chat_messages.recalled_at），本频道只做"通知已变"——
 * chat-ws 转播 recall 帧，客户端按 msgId 把已渲染消息替换为占位文案。
 */
export async function publishRecall(redis: Redis, payload: RecallPayload): Promise<void> {
  await redis.publish(RECALL_CHANNEL, JSON.stringify(payload));
}

type RecallErrorStage = 'connection' | 'subscribe' | 'parse';

/**
 * 订阅撤回频道，返回订阅连接（范式同 subscribeModeration，关停时可 quit）。
 * 订阅失败 3s 重试；解析出有效 RecallPayload 时回调 onRecall。
 */
export function subscribeRecall(
  redis: Redis,
  onRecall: (payload: RecallPayload) => void,
  onError?: (err: unknown, stage: RecallErrorStage) => void
): Redis {
  const report =
    onError ??
    ((err, stage) =>
      console.error(
        `[chat-ws] recall ${stage}:`,
        err instanceof Error ? err.message : String(err)
      ));

  const subscriber = redis.duplicate();
  subscriber.on('error', (err: unknown) => report(err, 'connection'));

  const subscribe = () => {
    subscriber.subscribe(RECALL_CHANNEL).catch((err: unknown) => {
      report(err, 'subscribe');
      setTimeout(subscribe, 3000);
    });
  };
  subscribe();

  subscriber.on('message', (channel: string, message: string) => {
    if (channel !== RECALL_CHANNEL) return;
    try {
      const payload = JSON.parse(message) as Partial<RecallPayload>;
      if (payload.roomId && payload.msgId) {
        onRecall(payload as RecallPayload);
      } else {
        report(new Error('invalid recall payload'), 'parse');
      }
    } catch (err) {
      report(err, 'parse');
    }
  });

  return subscriber;
}
