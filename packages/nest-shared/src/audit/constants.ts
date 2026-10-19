/** S12 审计事件通道：与 chat 隔离的 exchange/rk（拓扑由 live-service consumer 断言）。 */
export const AUDIT_EXCHANGE = 'audit.persist';
export const AUDIT_RK_WORK = 'audit.work';
export const AUDIT_RK_DLQ = 'audit.dlq';

/** S12 DoD 记录点（登录/踢人/改密/删除/导出）的动作枚举；点分小写，新增动作须同步 data-retention-policy.md。 */
export const AUDIT_ACTIONS = {
  LOGIN_OK: 'auth.login.ok',
  LOGIN_FAILED: 'auth.login.failed',
  SESSION_KICK: 'session.kick',
  CHANGE_PASSWORD: 'user.change_password',
  RESET_PASSWORD: 'user.reset_password',
  DELETE_LIVE: 'live.delete',
  DELETE_VIDEO_ROOMS: 'video.delete_rooms',
  DELETE_VIDEO_IDS: 'video.delete_ids',
  DELETE_COURSEWARE: 'courseware.delete',
  EXPORT_RECORDING: 'recording.export',
  MODERATION_MUTE: 'moderation.mute',
  MODERATION_KICK: 'moderation.kick',
  MODERATION_RELEASE: 'moderation.release'
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** audit_logs 列宽（publisher 截断对齐，防 22xxx 超长入 DLQ）。 */
export const AUDIT_COLUMN_LIMITS = {
  actor: 100,
  action: 100,
  targetType: 50,
  targetId: 100,
  requestId: 64,
  ip: 45
} as const;
