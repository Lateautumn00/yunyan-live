export const SYNC_ENV_KEY = 'TYPEORM_SYNC';

/**
 * GAP-S9a 冻结策略：
 * - 默认（未设环境变量）synchronize=false，schema 变更只能走迁移（pnpm db:migrate）
 * - 生产环境显式请求 sync → 直接抛错拒启动（硬禁，防 TypeORM 动表）
 * - 非生产显式 TYPEORM_SYNC=true → 仅本地开发可用
 */
export function resolveSynchronize(
  requested: boolean,
  nodeEnv: string | undefined = process.env.NODE_ENV
): boolean {
  if (requested && nodeEnv === 'production') {
    throw new Error(
      '[GAP-S9a] TYPEORM_SYNC=true is forbidden in production. ' +
        'Schema changes must go through migrations (pnpm db:migrate).'
    );
  }
  return requested;
}
