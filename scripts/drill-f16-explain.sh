#!/usr/bin/env bash
# GAP-F16: 列表接口 SQL 化 EXPLAIN 演练（keyset 深翻页 vs OFFSET、聚合下推）。
# 证据整理进 docs/research/drills/f16-pagination-explain.md。
# 依赖：docker（postgres:16-alpine）、node（S9a runner 建库）。
# 用法：scripts/drill-f16-explain.sh    # 结束后自动清理容器
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_NAME="f16-drill-pg"
PG_PORT="${F16_DRILL_PORT:-55434}"
DSN="postgres://postgres:postgres@127.0.0.1:${PG_PORT}/yunyan_live"

step() { printf '\n== %s ==\n' "$*"; }
psql_d() { docker run --rm -i --network host -e PGPASSWORD=postgres postgres:16-alpine \
  psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -d yunyan_live -X -q -v ON_ERROR_STOP=1 "$@"; }

cleanup() { docker rm -f "$PG_NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

step "0) 起临时 PG + 迁移（baseline + 0001_f16_list_indexes）"
cleanup
docker run -d --name "$PG_NAME" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=yunyan_live \
  -p "127.0.0.1:${PG_PORT}:5432" postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$PG_NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
DATABASE_URL="$DSN" node "$ROOT/scripts/db-migrate.mjs" >/dev/null

step "1) 造数：rooms 2万 / participants 30万 / watch_times 100万 / videos 20万"
psql_d <<'SQL'
INSERT INTO live_rooms ("roomId", title, "joinCode", type, status, "startTime", duration,
                        "liveUserId", "liveNums", "createdAt", "updatedAt")
SELECT 'room-' || g, '课程' || g, 'C' || lpad(g::text, 8, '0'), g % 3, 1,
       now() - ((g % 400) * interval '1 day'), 60,
       'teacher-' || (g % 50), 0, now() - ((g % 400) * interval '1 day'), now()
FROM generate_series(1, 20000) g;

-- (userId, roomId) 唯一约束：student-0 重用户 2 万房各一次（演示深翻页），其余每人 15 房
INSERT INTO live_participants ("userId", "roomId", "joinedAt")
SELECT 'student-0', 'room-' || g,
       now() - ((g % 400) * interval '1 day') - ((g % 86400) * interval '1 second')
FROM generate_series(1, 20000) g;
INSERT INTO live_participants ("userId", "roomId", "joinedAt")
SELECT 'student-' || (1 + ((g - 1) / 15)), 'room-' || (1 + ((g - 1) % 15)),
       now() - ((g % 400) * interval '1 day') - ((g % 86400) * interval '1 second')
FROM generate_series(1, 280000) g;

INSERT INTO user_watch_times (user_id, room_id, joined_at, left_at, created_at)
SELECT 'student-' || (g % 8000), 'room-' || (1 + (g % 20000)),
       now() - ((g % 400) * interval '1 day') - ((g % 86400) * interval '1 second'),
       CASE WHEN g % 7 = 0 THEN NULL ELSE
         now() - ((g % 400) * interval '1 day') - ((g % 86400) * interval '1 second')
           + ((30 + (g % 3000)) * interval '1 second') END,
       now() - ((g % 400) * interval '1 day') - ((g % 86400) * interval '1 second')
FROM generate_series(1, 1000000) g;

INSERT INTO video_recordings ("roomId", "filePath", "fileName", "fileSize", duration,
                              "recordType", "teacherName", "createdAt", "updatedAt")
SELECT 'room-' || (1 + (g % 20000)), '/rec/' || g || '.mp4', g || '.mp4', 1048576, 3600,
       1, '', now() - ((g % 400) * interval '1 day'), now()
FROM generate_series(1, 200000) g;

ANALYZE live_rooms, live_participants, user_watch_times, video_recordings;
SQL
psql_d -c "SELECT (SELECT count(*) FROM live_rooms) AS rooms,
                  (SELECT count(*) FROM live_participants) AS participants,
                  (SELECT count(*) FROM user_watch_times) AS watch_times,
                  (SELECT count(*) FROM video_recordings) AS videos;"

step "2) getStudentRooms：page1（OFFSET 0）"
psql_d <<'SQL'
EXPLAIN (ANALYZE, BUFFERS)
SELECT p."joinedAt", r."roomId", r.title, r."liveUserId", r."joinCode",
       r.status, r."startTime", r.type
FROM live_participants p
JOIN live_rooms r ON r."roomId" = p."roomId" AND r."deletedAt" IS NULL
WHERE p."userId" = 'student-0'
ORDER BY p."joinedAt" DESC, p.id DESC
LIMIT 10 OFFSET 0;
SQL

step "3) getStudentRooms：深 OFFSET（student-0 第 1999 页，OFFSET 19990）"
psql_d <<'SQL'
EXPLAIN (ANALYZE, BUFFERS)
SELECT p."joinedAt", r."roomId", r.title, r."liveUserId", r."joinCode",
       r.status, r."startTime", r.type
FROM live_participants p
JOIN live_rooms r ON r."roomId" = p."roomId" AND r."deletedAt" IS NULL
WHERE p."userId" = 'student-0'
ORDER BY p."joinedAt" DESC, p.id DESC
LIMIT 10 OFFSET 19990;
SQL

step "4) getStudentRooms：keyset cursor（index 递进，无 OFFSET）"
psql_d <<'SQL'
EXPLAIN (ANALYZE, BUFFERS)
SELECT p."joinedAt", r."roomId", r.title, r."liveUserId", r."joinCode",
       r.status, r."startTime", r.type
FROM live_participants p
JOIN live_rooms r ON r."roomId" = p."roomId" AND r."deletedAt" IS NULL
WHERE p."userId" = 'student-0'
  AND (p."joinedAt", p.id) < (now() - interval '300 day', '00000000-0000-0000-0000-000000000000'::uuid)
ORDER BY p."joinedAt" DESC, p.id DESC
LIMIT 10 OFFSET 0;
SQL

step "5) getUserWatchTimeList：页查询 + 全量聚合（total/total_time 下推）"
psql_d <<'SQL'
EXPLAIN (ANALYZE, BUFFERS)
SELECT w.id, w.user_id, w.room_id, w.joined_at, w.left_at, w.created_at,
       r.title AS room_title, (w.left_at IS NULL) AS is_online
FROM user_watch_times w
JOIN live_rooms r ON r."roomId" = w.room_id AND r."deletedAt" IS NULL
WHERE r."deletedAt" IS NULL
ORDER BY w.created_at DESC, w.id DESC
LIMIT 10 OFFSET 0;

EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)::int AS total,
       COALESCE(SUM(
         CASE WHEN w.left_at IS NULL
           THEN floor(EXTRACT(EPOCH FROM (now() - w.joined_at)))
           ELSE floor(EXTRACT(EPOCH FROM (w.left_at - w.joined_at)))
         END
       ), 0)::bigint AS total_time
FROM user_watch_times w
JOIN live_rooms r ON r."roomId" = w.room_id AND r."deletedAt" IS NULL
WHERE r."deletedAt" IS NULL;
SQL

step "6) getUserWatchTimeList：深 OFFSET vs keyset"
psql_d <<'SQL'
EXPLAIN (ANALYZE, BUFFERS)
SELECT w.id, w.user_id, w.room_id, w.joined_at, w.left_at, w.created_at,
       r.title AS room_title, (w.left_at IS NULL) AS is_online
FROM user_watch_times w
JOIN live_rooms r ON r."roomId" = w.room_id AND r."deletedAt" IS NULL
WHERE r."deletedAt" IS NULL
ORDER BY w.created_at DESC, w.id DESC
LIMIT 10 OFFSET 999900;

EXPLAIN (ANALYZE, BUFFERS)
SELECT w.id, w.user_id, w.room_id, w.joined_at, w.left_at, w.created_at,
       r.title AS room_title, (w.left_at IS NULL) AS is_online
FROM user_watch_times w
JOIN live_rooms r ON r."roomId" = w.room_id AND r."deletedAt" IS NULL
WHERE r."deletedAt" IS NULL
  AND (w.created_at, w.id) < (now() - interval '100 day', '00000000-0000-0000-0000-000000000000'::uuid)
ORDER BY w.created_at DESC, w.id DESC
LIMIT 10 OFFSET 0;
SQL

step "7) getVideoList：页查询（GROUP BY + count 子查询）"
psql_d <<'SQL'
EXPLAIN (ANALYZE, BUFFERS)
SELECT r."roomId", r.title, r.type, COUNT(*)::int AS count,
       (EXTRACT(EPOCH FROM MIN(v."createdAt")) * 1000)::bigint AS first_recorded_ms
FROM live_rooms r
JOIN video_recordings v ON v."roomId" = r."roomId"
WHERE r."deletedAt" IS NULL
GROUP BY r."roomId", r.title, r.type, r."createdAt"
ORDER BY r."createdAt" DESC, r."roomId" DESC
LIMIT 10 OFFSET 0;

EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)::int AS total FROM (
  SELECT r."roomId"
  FROM live_rooms r
  JOIN video_recordings v ON v."roomId" = r."roomId"
  WHERE r."deletedAt" IS NULL
  GROUP BY r."roomId", r.title, r.type, r."createdAt"
) g;
SQL

step "8) getVideoList：深 OFFSET vs keyset"
psql_d <<'SQL'
EXPLAIN (ANALYZE, BUFFERS)
SELECT r."roomId", r.title, r.type, COUNT(*)::int AS count,
       (EXTRACT(EPOCH FROM MIN(v."createdAt")) * 1000)::bigint AS first_recorded_ms
FROM live_rooms r
JOIN video_recordings v ON v."roomId" = r."roomId"
WHERE r."deletedAt" IS NULL
GROUP BY r."roomId", r.title, r.type, r."createdAt"
ORDER BY r."createdAt" DESC, r."roomId" DESC
LIMIT 10 OFFSET 19990;

EXPLAIN (ANALYZE, BUFFERS)
SELECT r."roomId", r.title, r.type, COUNT(*)::int AS count,
       (EXTRACT(EPOCH FROM MIN(v."createdAt")) * 1000)::bigint AS first_recorded_ms
FROM live_rooms r
JOIN video_recordings v ON v."roomId" = r."roomId"
WHERE r."deletedAt" IS NULL
  AND (r."createdAt", r."roomId") < (now() - interval '100 day', 'room-x')
GROUP BY r."roomId", r.title, r.type, r."createdAt"
ORDER BY r."createdAt" DESC, r."roomId" DESC
LIMIT 10 OFFSET 0;
SQL

step "9) 索引命中确认（idx_* 全部被计划引用）"
psql_d <<'SQL'
SELECT indexrelname, idx_scan FROM pg_stat_user_indexes
WHERE indexrelname LIKE 'idx_live_participants%' OR indexrelname LIKE 'idx_user_watch_times%'
   OR indexrelname LIKE 'idx_video_recordings%' OR indexrelname LIKE 'idx_live_rooms_teacher%'
ORDER BY indexrelname;
SQL

step "DRILL PASSED"
