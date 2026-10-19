#!/usr/bin/env bash
# S9b 索引治理综合演练（GAP-S9b）：热路径 seq→index 对照 + 保留期清理任务 + 孤儿巡检自检。
# 证据整理进 docs/research/drills/s9b-index-explain.md。
# 依赖：docker（postgres:16-alpine）、node（db-migrate runner 建库）。
# 用法：scripts/drill-s9b-explain.sh    # 结束后自动清理容器
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_NAME="s9b-drill-pg"
PG_PORT="${S9B_DRILL_PORT:-55435}"
DSN="postgres://postgres:postgres@127.0.0.1:${PG_PORT}/yunyan_live"

step() { printf '\n== %s ==\n' "$*"; }
psql_d() {
  docker run --rm -i --network host -e PGPASSWORD=postgres postgres:16-alpine \
    psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -d yunyan_live -X -q -v ON_ERROR_STOP=1 "$@"
}

cleanup() { docker rm -f "$PG_NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

step "0) 起临时 PG + 迁移（baseline + 0001-0006）"
cleanup
docker run -d --name "$PG_NAME" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=yunyan_live \
  -p "127.0.0.1:${PG_PORT}:5432" postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$PG_NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
DATABASE_URL="$DSN" node "$ROOT/scripts/db-migrate.mjs" >/dev/null

step "1) 造数：rooms 2万 / participants 30万 / coursewares 20万 / transfer 10万 / chat 100万 / tool_usage 50万 / checkin sessions 10万+records 30万"
psql_d <<'SQL'
INSERT INTO live_rooms ("roomId", title, "joinCode", type, status, "startTime", duration,
                        "liveUserId", "liveNums", "createdAt", "updatedAt")
SELECT 'room-' || g, '课程' || g, 'C' || lpad(g::text, 8, '0'), g % 3, 1,
       now() - ((g % 400) * interval '1 day'), 60,
       'teacher-' || (g % 50), 0, now() - ((g % 400) * interval '1 day'), now()
FROM generate_series(1, 20000) g;
INSERT INTO live_rooms ("roomId", title, "joinCode", type, status, "startTime", duration,
                        "liveUserId", "liveNums", "createdAt", "updatedAt")
VALUES ('room-hot', '热房', 'C99999999', 0, 1, now(), 60, 'teacher-1', 0, now(), now());

-- 花名册：热房 5000 人（getParticipants 命中），其余 29.5 万散布
INSERT INTO live_participants ("userId", "roomId", "joinedAt")
SELECT 'hot-' || g, 'room-hot',
       now() - ((g % 300) * interval '1 day') - ((g % 86400) * interval '1 second')
FROM generate_series(1, 5000) g;
INSERT INTO live_participants ("userId", "roomId", "joinedAt")
SELECT 'student-' || g, 'room-' || (1 + (g % 20000)),
       now() - ((g % 400) * interval '1 day')
FROM generate_series(1, 295000) g;

INSERT INTO coursewares ("roomId", filename, filext, fileurl, "createdAt")
SELECT 'room-hot', '热课件' || g, '.pptx', '/cw/hot-' || g || '.pptx',
       now() - ((g % 300) * interval '1 day')
FROM generate_series(1, 5000) g;
INSERT INTO coursewares ("roomId", filename, filext, fileurl, "createdAt")
SELECT 'room-' || (1 + (g % 20000)), '课件' || g, '.pptx', '/cw/' || g || '.pptx',
       now() - ((g % 400) * interval '1 day')
FROM generate_series(1, 195000) g;

-- 转播码：仅 1 行命中 (room-hot, student-hot, status=0)，其余 10 万行不同 target
INSERT INTO live_transfer_codes (code, status, "roomId", "targetUserId", "createdAt", "expiresAt")
VALUES ('T0000000000000000001', 0, 'room-hot', 'student-hot', now(), now() + interval '1 day');
INSERT INTO live_transfer_codes (code, status, "roomId", "targetUserId", "createdAt", "expiresAt")
SELECT 'T' || lpad(g::text, 19, '0'), 0,
       'room-' || (1 + (g % 20000)), 'stu-' || g,
       now() - ((g % 400) * interval '1 day'), now() + interval '1 day'
FROM generate_series(2, 100000) g;

-- chat_messages：created_at 铺 400 天（365 天窗口外 ~8.75% 可删）
INSERT INTO chat_messages (msg_id, room_id, sender_id, sender_name, content, created_at)
SELECT gen_random_uuid(), 'room-' || (1 + (g % 20000)), gen_random_uuid(),
       '用户' || (g % 5000), '消息' || g,
       now() - ((g % 400) * interval '1 day')
FROM generate_series(1, 1000000) g;

INSERT INTO board_tool_usage ("roomId", "userId", tool, "createdAt")
SELECT 'room-' || (1 + (g % 20000)), 'student-' || (g % 5000),
       'pen', now() - ((g % 400) * interval '1 day')
FROM generate_series(1, 500000) g;

-- checkin：sessions 铺 900 天（730 天窗口外 ~19%），id 定型便于 records 关联
INSERT INTO checkin_sessions (id, "roomId", "teacherId", "startedAt", "deadlineAt",
                              "attendeeIds", "attendeeCount", "createdAt")
SELECT ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
       'room-' || (1 + (g % 20000)), 'teacher-' || (g % 50),
       now() - ((g % 900) * interval '1 day'), now() - ((g % 900) * interval '1 day') + interval '5 min',
       '[]'::jsonb, 0, now() - ((g % 900) * interval '1 day')
FROM generate_series(1, 100000) g;
INSERT INTO checkin_records ("sessionId", "userId", "respondedAt")
SELECT ('00000000-0000-4000-8000-' || lpad((1 + (g % 100000))::text, 12, '0'))::uuid,
       'stu-' || g, now() - ((g % 900) * interval '1 day')
FROM generate_series(1, 300000) g;

ANALYZE live_rooms, live_participants, coursewares, live_transfer_codes,
        chat_messages, board_tool_usage, checkin_sessions, checkin_records;
SQL
psql_d -c "SELECT (SELECT count(*) FROM live_participants) AS participants,
                  (SELECT count(*) FROM coursewares) AS coursewares,
                  (SELECT count(*) FROM live_transfer_codes) AS transfers,
                  (SELECT count(*) FROM chat_messages) AS chat,
                  (SELECT count(*) FROM board_tool_usage) AS tool_usage,
                  (SELECT count(*) FROM checkin_sessions) AS sessions,
                  (SELECT count(*) FROM checkin_records) AS records;"

step "2) 回退 0006 六索引 → EXPLAIN 基线（无索引计划）"
psql_d <<'SQL'
DROP INDEX IF EXISTS idx_live_participants_room_joined;
DROP INDEX IF EXISTS idx_coursewares_room_created;
DROP INDEX IF EXISTS idx_live_transfer_codes_room_user;
DROP INDEX IF EXISTS idx_chat_messages_created;
DROP INDEX IF EXISTS idx_board_tool_usage_created;
DROP INDEX IF EXISTS idx_checkin_sessions_started;
SQL

step "2a) getParticipants：room-hot 花名册（WHERE roomId ORDER BY joinedAt DESC）"
psql_d <<'SQL'
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM live_participants WHERE "roomId" = 'room-hot' ORDER BY "joinedAt" DESC;
SQL

step "2b) listCoursewares：room-hot 课件列表（WHERE roomId ORDER BY createdAt ASC）"
psql_d <<'SQL'
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM coursewares WHERE "roomId" = 'room-hot' ORDER BY "createdAt" ASC;
SQL

step "2c) 转播码撤销 UPDATE（事务内执行后回滚，不改数据）"
psql_d <<'SQL'
BEGIN;
EXPLAIN (ANALYZE, BUFFERS)
UPDATE live_transfer_codes SET status = 2
WHERE "roomId" = 'room-hot' AND "targetUserId" = 'student-hot' AND status = 0;
ROLLBACK;
SQL

step "2d) chat_messages 保留批删（365 天窗外首批 5000，回滚）"
psql_d <<'SQL'
BEGIN;
EXPLAIN (ANALYZE, BUFFERS)
DELETE FROM chat_messages
WHERE ctid IN (SELECT ctid FROM chat_messages
               WHERE created_at < now() - interval '365 days' LIMIT 5000);
ROLLBACK;
SQL

step "2e) board_tool_usage 保留批删（同上，回滚）"
psql_d <<'SQL'
BEGIN;
EXPLAIN (ANALYZE, BUFFERS)
DELETE FROM board_tool_usage
WHERE ctid IN (SELECT ctid FROM board_tool_usage
               WHERE "createdAt" < now() - interval '365 days' LIMIT 5000);
ROLLBACK;
SQL

step "2f) checkin_sessions 保留窗驱动 SELECT（730 天窗外）"
psql_d <<'SQL'
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM checkin_sessions WHERE "startedAt" < now() - interval '730 days' LIMIT 5000;
SQL

step "3) 应用 0006 → ANALYZE → 同查询 EXPLAIN 对照"
psql_d -f - <"$ROOT/db/migrations/0006_s9b_hot_path_indexes.sql"
psql_d <<'SQL'
ANALYZE live_participants, coursewares, live_transfer_codes,
        chat_messages, board_tool_usage, checkin_sessions;
SQL

step "3a) getParticipants（对照 2a）"
psql_d <<'SQL'
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM live_participants WHERE "roomId" = 'room-hot' ORDER BY "joinedAt" DESC;
SQL

step "3b) listCoursewares（对照 2b）"
psql_d <<'SQL'
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM coursewares WHERE "roomId" = 'room-hot' ORDER BY "createdAt" ASC;
SQL

step "3c) 转播码撤销 UPDATE（对照 2c）"
psql_d <<'SQL'
BEGIN;
EXPLAIN (ANALYZE, BUFFERS)
UPDATE live_transfer_codes SET status = 2
WHERE "roomId" = 'room-hot' AND "targetUserId" = 'student-hot' AND status = 0;
ROLLBACK;
SQL

step "3d) chat_messages 保留批删（对照 2d）"
psql_d <<'SQL'
BEGIN;
EXPLAIN (ANALYZE, BUFFERS)
DELETE FROM chat_messages
WHERE ctid IN (SELECT ctid FROM chat_messages
               WHERE created_at < now() - interval '365 days' LIMIT 5000);
ROLLBACK;
SQL

step "3e) board_tool_usage 保留批删（对照 2e）"
psql_d <<'SQL'
BEGIN;
EXPLAIN (ANALYZE, BUFFERS)
DELETE FROM board_tool_usage
WHERE ctid IN (SELECT ctid FROM board_tool_usage
               WHERE "createdAt" < now() - interval '365 days' LIMIT 5000);
ROLLBACK;
SQL

step "3f) checkin_sessions 保留窗驱动 SELECT（对照 2f）"
psql_d <<'SQL'
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM checkin_sessions WHERE "startedAt" < now() - interval '730 days' LIMIT 5000;
SQL

step "4) 索引命中确认（0006 六索引 idx_scan > 0）"
psql_d <<'SQL'
SELECT indexrelname, idx_scan FROM pg_stat_user_indexes
WHERE indexrelname IN ('idx_live_participants_room_joined', 'idx_coursewares_room_created',
                       'idx_live_transfer_codes_room_user', 'idx_chat_messages_created',
                       'idx_board_tool_usage_created', 'idx_checkin_sessions_started')
ORDER BY indexrelname;
SQL

step "5) 孤儿巡检自检：种 3 孤儿 → 检出 → 清理 → 归零"
psql_d <<'SQL'
INSERT INTO live_participants ("userId", "roomId", "joinedAt")
VALUES ('ghost-student', 'room-ghost', now());
INSERT INTO chat_messages (msg_id, room_id, sender_id, sender_name, content, created_at)
VALUES (gen_random_uuid(), 'room-ghost', gen_random_uuid(), '幽灵', 'orphan', now());
INSERT INTO checkin_records ("sessionId", "userId", "respondedAt")
VALUES ('11111111-1111-4111-8111-111111111111', 'ghost-student', now());
SQL
psql_d -f - <"$ROOT/scripts/audit-orphans.sql"
psql_d <<'SQL'
DELETE FROM live_participants WHERE "roomId" = 'room-ghost';
DELETE FROM chat_messages WHERE room_id = 'room-ghost';
DELETE FROM checkin_records WHERE "userId" = 'ghost-student' AND "respondedAt" >= now() - interval '1 min';
SQL
psql_d -f - <"$ROOT/scripts/audit-orphans.sql"

step "6) 保留期清理任务演练：dry-run 统计 → 有界 apply（2 批）"
POSTGRES_CONTAINER="$PG_NAME" POSTGRES_USER=postgres POSTGRES_DB=yunyan_live \
  bash "$ROOT/scripts/cleanup-retention.sh"
POSTGRES_CONTAINER="$PG_NAME" POSTGRES_USER=postgres POSTGRES_DB=yunyan_live \
  bash "$ROOT/scripts/cleanup-retention.sh" --apply --batch 5000 --max-batches 2
POSTGRES_CONTAINER="$PG_NAME" POSTGRES_USER=postgres POSTGRES_DB=yunyan_live \
  bash "$ROOT/scripts/cleanup-retention.sh"

step "DRILL PASSED"
