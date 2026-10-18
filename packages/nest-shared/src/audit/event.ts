/** 调用侧输入：eventId/occurredAtMs 缺省由 publisher 生成；detail 经白名单+脱敏后落库。 */
export interface AuditEventInput {
  actor: string;
  action: string;
  targetType?: string;
  targetId?: string;
  requestId?: string;
  ip?: string;
  detail?: Record<string, unknown>;
  /** uuid；缺省/非法格式由 publisher 重生成（非法防 22P02 毒行） */
  eventId?: string;
  /** epoch ms；缺省 Date.now() */
  occurredAtMs?: number;
}

/** publisher 规范化后的报文（wire 形态，与 audit_logs 列一一对应）。 */
export interface AuditWireEvent {
  eventId: string;
  occurredAtMs: number;
  actor: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  requestId: string | null;
  ip: string | null;
  detail: Record<string, unknown>;
}
