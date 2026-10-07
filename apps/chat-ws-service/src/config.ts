/**
 * 持久化开关与依赖配置（方案 §4.7）。
 * - 单一布尔：DATABASE_URL 与 RABBITMQ_URL 同启同停，防"只配 MQ"无界积压。
 * - 半配置（有其一缺其一）→ 视为配置错误（ERROR 日志）并按关闭处理，不静默启动。
 * - require* 仅在开关开启分支（Pool/MQ 构造处）调用；缺失即 exit(1)（对齐 requireJwtSecret）。
 */
export interface PersistenceConfig {
  enabled: boolean;
  /** enabled=false 时的展示原因（half_configured / not_configured）；enabled=true 为 null */
  disabledReason: string | null;
  databaseUrl?: string;
  rabbitUrl?: string;
  /** history 读路径 fail-open 超时（ms），测试可调小 */
  historyTimeoutMs: number;
}

function inspect(env: NodeJS.ProcessEnv = process.env): PersistenceConfig {
  const databaseUrl = env.DATABASE_URL || '';
  const rabbitUrl = env.RABBITMQ_URL || '';
  const hasDb = databaseUrl !== '';
  const hasMq = rabbitUrl !== '';
  const enabled = hasDb && hasMq;
  const disabledReason = enabled ? null : hasDb || hasMq ? 'half_configured' : 'not_configured';
  return {
    enabled,
    disabledReason,
    databaseUrl: hasDb ? databaseUrl : undefined,
    rabbitUrl: hasMq ? rabbitUrl : undefined,
    historyTimeoutMs: Number(env.CHAT_HISTORY_TIMEOUT_MS) || 3000
  };
}

/** 读取持久化配置（启动期快照；测试可注入 env） */
export function loadPersistenceConfig(env: NodeJS.ProcessEnv = process.env): PersistenceConfig {
  return inspect(env);
}

/** fail-fast：仅在开关开启分支调用；缺失打印指引并退出 */
export function requireDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL ?? '';
  if (!url) {
    console.error('DATABASE_URL is not set. Persistence is enabled but the database is missing.');
    process.exit(1);
  }
  return url;
}

/** fail-fast：仅在开关开启分支调用；缺失打印指引并退出 */
export function requireRabbitUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.RABBITMQ_URL ?? '';
  if (!url) {
    console.error('RABBITMQ_URL is not set. Persistence is enabled but the broker is missing.');
    process.exit(1);
  }
  return url;
}
