-- F16 列表接口 SQL 化配套索引（keyset 深翻页 + 聚合过滤下推）。
-- 台账：docs/research/system-gap-analysis.md F16；EXPLAIN 证据：docs/research/drills/f16-pagination-explain.md。
-- 列名注意：live_participants / live_rooms / video_recordings 为现网真实 camelCase 引号列；
-- user_watch_times 是 snake_case 特例。
-- 非 CONCURRENTLY（runner 单条 simple-query 隐式事务；现网均为小表，普通建索引锁窗口可忽略）。
-- 实体侧 @Index 同名（TypeORM 不带 DESC；btree 双向扫描，方向仅影响 dump 形态不影响计划）。
CREATE INDEX IF NOT EXISTS idx_live_participants_user_joined
  ON live_participants ("userId", "joinedAt" DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_user_watch_times_created
  ON user_watch_times (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_user_watch_times_room_created
  ON user_watch_times (room_id, created_at);

CREATE INDEX IF NOT EXISTS idx_video_recordings_room_created
  ON video_recordings ("roomId", "createdAt");

CREATE INDEX IF NOT EXISTS idx_live_rooms_teacher_created
  ON live_rooms ("liveUserId", "createdAt" DESC);
