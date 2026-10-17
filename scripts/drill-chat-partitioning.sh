#!/usr/bin/env bash
# GAP-O8: chat_messages 分区迁移 runbook 本地全量演练。
# 复现 docs/research/runbooks/chat-messages-partitioning.md 的阶段 1-6（小数据量）。
# 依赖：docker（postgres:16-alpine）、node（复用 S9a runner 建库）。
# 用法：scripts/drill-chat-partitioning.sh    # 结束后自动清理容器
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_NAME="o8-drill-pg"
PG_PORT="${O8_DRILL_PORT:-55433}"
DSN="postgres://postgres:postgres@127.0.0.1:${PG_PORT}/yunyan_live"

step() { printf '\n== %s ==\n' "$*"; }
psql_d() { docker run --rm -i --network host -e PGPASSWORD=postgres postgres:16-alpine \
  psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -d yunyan_live -X -q -v ON_ERROR_STOP=1 "$@"; }

cleanup() {
  docker rm -f "$PG_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

step "0) 起临时 PG + 用 S9a runner 建库（复用 db/schema-baseline.sql）"
cleanup
docker run -d --name "$PG_NAME" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=yunyan_live \
  -p "127.0.0.1:${PG_PORT}:5432" postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$PG_NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
DATABASE_URL="$DSN" node "$ROOT/scripts/db-migrate.mjs" >/dev/null

step "1) 造数：20 万行跨 2026-08/09/10 三月（复用真实 DDL 与索引）"
psql_d <<'SQL'
INSERT INTO chat_messages
  (msg_id, room_id, sender_id, sender_name, is_teacher, content, msg_type, mentions, extra, created_at)
SELECT
  gen_random_uuid(), 'room-drill', gen_random_uuid(), 'driller', false,
  'msg ' || g, 1, NULL, '{}'::jsonb,
  TIMESTAMPTZ '2026-08-01 00:00:00+08' +
    ((g % 92) * interval '1 day') + ((g % 86400) * interval '1 second')
FROM generate_series(1, 200000) g;
ANALYZE chat_messages;
SQL
psql_d -c "SELECT count(*), min(created_at)::date, max(created_at)::date FROM chat_messages;"

step "2) 步骤0 前置代码验证：无目标 ON CONFLICT 在普通表幂等"
psql_d <<'SQL'
BEGIN;
INSERT INTO chat_messages
  (msg_id, room_id, sender_id, sender_name, content, msg_type, extra, created_at)
VALUES ('11111111-1111-1111-1111-111111111111', 'room-drill', gen_random_uuid(), 't', 'first', 1, '{}', '2026-09-01+08')
ON CONFLICT DO NOTHING;
INSERT INTO chat_messages
  (msg_id, room_id, sender_id, sender_name, content, msg_type, extra, created_at)
VALUES ('11111111-1111-1111-1111-111111111111', 'room-drill', gen_random_uuid(), 't', 'replay', 1, '{}', '2026-09-01+08')
ON CONFLICT DO NOTHING;
SELECT count(*) AS plain_table_rows_for_msg FROM chat_messages
 WHERE msg_id = '11111111-1111-1111-1111-111111111111';
COMMIT;
SQL

step "3) 阶段1：建目标分区父表 + 复合 PK/UNIQUE + keyset 索引（按月分区 + default 兜底）"
psql_d <<'SQL'
CREATE TABLE chat_messages_p (LIKE chat_messages INCLUDING DEFAULTS INCLUDING IDENTITY EXCLUDING INDEXES) PARTITION BY RANGE (created_at);
CREATE TABLE chat_messages_p_2026_08 PARTITION OF chat_messages_p
  FOR VALUES FROM ('2026-08-01+08') TO ('2026-09-01+08');
CREATE TABLE chat_messages_p_2026_09 PARTITION OF chat_messages_p
  FOR VALUES FROM ('2026-09-01+08') TO ('2026-10-01+08');
CREATE TABLE chat_messages_p_2026_10 PARTITION OF chat_messages_p
  FOR VALUES FROM ('2026-10-01+08') TO ('2026-11-01+08');
CREATE TABLE chat_messages_p_default PARTITION OF chat_messages_p DEFAULT;
ALTER TABLE chat_messages_p ADD PRIMARY KEY (id, created_at);
CREATE UNIQUE INDEX UQ_chat_messages_p_msg_time ON chat_messages_p (msg_id, created_at);
CREATE INDEX IDX_chat_messages_p_room_time ON chat_messages_p (room_id, created_at DESC, id DESC);
SQL

step "4) 阶段2：分批回填（演练按月两批；生产按 500 万行/批调）"
psql_d -c "INSERT INTO chat_messages_p SELECT * FROM chat_messages WHERE created_at >= '2026-08-01+08' AND created_at < '2026-10-01+08';"
psql_d -c "INSERT INTO chat_messages_p SELECT * FROM chat_messages WHERE created_at >= '2026-10-01+08' AND created_at < '2026-11-01+08';"
psql_d -c "SELECT (SELECT count(*) FROM chat_messages) AS old, (SELECT count(*) FROM chat_messages_p) AS new;"

step "5) 阶段3：停写窗口（演练以尾部 delta 模拟窗口内新消息）"
psql_d <<'SQL'
INSERT INTO chat_messages
  (msg_id, room_id, sender_id, sender_name, content, msg_type, extra, created_at)
SELECT gen_random_uuid(), 'room-drill', gen_random_uuid(), 't', 'delta ' || g, 1, '{}',
       TIMESTAMPTZ '2026-10-20 00:00:00+08' + (g * interval '1 minute')
FROM generate_series(1, 1000) g;
INSERT INTO chat_messages_p
SELECT * FROM chat_messages c
WHERE c.id > (SELECT coalesce(max(id), 0) FROM chat_messages_p)
ON CONFLICT DO NOTHING;
SQL
psql_d -c "SELECT (SELECT count(*) FROM chat_messages) AS old, (SELECT count(*) FROM chat_messages_p) AS new, (SELECT count(*) FROM chat_messages) - (SELECT count(*) FROM chat_messages_p) AS diff;"

step "6) 阶段4：原子切换（RENAME 双表）"
psql_d <<'SQL'
ALTER TABLE chat_messages RENAME TO chat_messages_old;
ALTER TABLE chat_messages_p RENAME TO chat_messages;
SQL

step "7) 阶段5a：新表上无目标 ON CONFLICT 幂等复验"
psql_d <<'SQL'
BEGIN;
INSERT INTO chat_messages
  (msg_id, room_id, sender_id, sender_name, content, msg_type, extra, created_at)
VALUES ('22222222-2222-2222-2222-222222222222', 'room-drill', gen_random_uuid(), 't', 'first', 1, '{}', '2026-09-02+08')
ON CONFLICT DO NOTHING;
INSERT INTO chat_messages
  (msg_id, room_id, sender_id, sender_name, content, msg_type, extra, created_at)
VALUES ('22222222-2222-2222-2222-222222222222', 'room-drill', gen_random_uuid(), 't', 'replay', 1, '{}', '2026-09-02+08')
ON CONFLICT DO NOTHING;
SELECT count(*) AS partition_rows_for_msg FROM chat_messages
 WHERE msg_id = '22222222-2222-2222-2222-222222222222';
COMMIT;
SQL

step "8) 阶段5b：旧子句 ON CONFLICT (msg_id) 在分区表上必须报错（证明步骤0 必须先部署）"
set +e
OUT=$(psql_d -c "INSERT INTO chat_messages
  (msg_id, room_id, sender_id, sender_name, content, msg_type, extra, created_at)
VALUES (gen_random_uuid(), 'room-drill', gen_random_uuid(), 't', 'x', 1, '{}', now())
ON CONFLICT (msg_id) DO NOTHING;" 2>&1)
RC=$?
set -e
echo "$OUT" | head -2
[ "$RC" -ne 0 ] && echo "EXPECTED_ERROR: legacy conflict target rejected on partitioned table" || {
  echo "DRILL_FAIL: legacy ON CONFLICT (msg_id) unexpectedly succeeded"; exit 1; }

step "9) 阶段5c：约束/索引与分区裁剪（keyset history EXPLAIN）"
psql_d -c "\d chat_messages" | grep -E "Primary key|Unique|Partition key|room_time" || true
echo "-- 9a) 现行 keyset（row 比较，静态不裁剪 → 扫全部分区，runbook 已知事项）"
psql_d <<'SQL'
EXPLAIN (COSTS OFF)
SELECT id, created_at, content FROM chat_messages
 WHERE room_id = 'room-drill' AND (created_at, id) < ('2026-09-15+08', 999999999)
 ORDER BY created_at DESC, id DESC LIMIT 50;
SQL
echo "-- 9b) 优化对照：拆出独立 created_at 上界谓词 → 静态裁剪掉 10 月/default 分区"
psql_d <<'SQL'
EXPLAIN (COSTS OFF)
SELECT id, created_at, content FROM chat_messages
 WHERE room_id = 'room-drill'
   AND created_at < '2026-09-15+08'
   AND (created_at, id) < ('2026-09-15+08', 999999999)
 ORDER BY created_at DESC, id DESC LIMIT 50;
SQL

step "10) 触发线监控：默认绿 / 低阈值红"
"$ROOT/scripts/check-chat-partition-trigger.sh" --dsn "$DSN"
set +e
"$ROOT/scripts/check-chat-partition-trigger.sh" --dsn "$DSN" --rows 100 --bytes 100
RED_RC=$?
set -e
[ "$RED_RC" -eq 1 ] && echo "ALERT_OK: low-threshold red path exit 1" || {
  echo "DRILL_FAIL: expected exit 1"; exit 1; }

step "11) 回滚演练：RENAME 双向回切（观察期回退路径）"
psql_d <<'SQL'
ALTER TABLE chat_messages RENAME TO chat_messages_new;
ALTER TABLE chat_messages_old RENAME TO chat_messages;
SQL
psql_d -c "SELECT count(*) AS rolled_back FROM chat_messages;"

step "DRILL PASSED — all stages green"
