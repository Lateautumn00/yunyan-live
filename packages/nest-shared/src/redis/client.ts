import Redis from 'ioredis';

export interface RedisClientOptions {
  host?: string;
  port?: number | string;
}

/**
 * 创建 fail-fast Redis 客户端：连接不可用时命令立即报错（不排队、单次重试），
 * 使会话校验可以 fail-open 而不是挂起请求。
 */
export function createRedisClient(options: RedisClientOptions = {}): Redis {
  return new Redis({
    host: options.host || '127.0.0.1',
    port: Number(options.port) || 6379,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
}
