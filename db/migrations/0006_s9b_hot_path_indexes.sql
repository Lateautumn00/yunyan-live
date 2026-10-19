-- S9b 索引治理（批次 5）：热路径缺口 + 保留期删除驱动列。
-- 台账：docs/research/system-gap-analysis.md GAP-S9b；
-- 索引清单：docs/research/index-inventory.md；
-- EXPLAIN 证据：docs/research/drills/s9b-index-explain.md（scripts/drill-s9b-explain.sh）。
-- 非 CONCURRENTLY（runner 单条 simple-query 隐式事务；造数前空表/小表，锁窗口可忽略）。
-- 实体侧 @Index 同名（TypeORM 不带 DESC；btree 双向扫描，方向仅影响 dump 形态不影响计划）。

-- 1) getParticipants 花名册：where {roomId} 单列 + joinedAt 排序。
--    唯一键 (userId,roomId) 与既有 user_joined 索引均以 userId 打头， roomId-only 过滤不可用 → 全表扫。
CREATE INDEX IF NOT EXISTS idx_live_participants_room_joined
  ON live_participants ("roomId", "joinedAt" DESC);

-- 2) listCoursewares：where {roomId} + ORDER BY "createdAt" ASC（教室打开即拉课件列表）。
CREATE INDEX IF NOT EXISTS idx_coursewares_room_created
  ON coursewares ("roomId", "createdAt");

-- 3) 转播码撤销：UPDATE ... WHERE "roomId"=? AND "targetUserId"=? AND status=0（前两列等值走索引）。
CREATE INDEX IF NOT EXISTS idx_live_transfer_codes_room_user
  ON live_transfer_codes ("roomId", "targetUserId");

-- 4) 保留期删除驱动列（data-retention-policy §2：全局时间窗 + 批量 DELETE LIMIT 循环）：
--    既有索引均以 room_id/roomId 打头，全局 created_at 窗口不可用 → 只能全表扫。
CREATE INDEX IF NOT EXISTS idx_chat_messages_created
  ON chat_messages (created_at);

CREATE INDEX IF NOT EXISTS idx_board_tool_usage_created
  ON board_tool_usage ("createdAt");

-- 5) checkin 保留链路驱动列：sessions 按 "startedAt" 全局时间窗驱动，
--    records 经 UQ_checkin_records_session_user (sessionId 打头) 级联定位。
CREATE INDEX IF NOT EXISTS idx_checkin_sessions_started
  ON checkin_sessions ("startedAt");
