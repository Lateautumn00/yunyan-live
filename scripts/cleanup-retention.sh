#!/usr/bin/env bash
# S9b 首个清理任务（data-retention-policy §2 配套）：三表保留期批量窗口删除。
# 保留期限为草案（待 S11⑤「留存期限与删除权」签批后转正）；默认 dry-run 只统计，--apply 才真删。
# 用法：cleanup-retention.sh [--apply] [--batch N] [--max-batches N]
# 环境：POSTGRES_CONTAINER（默认 yunyan-live-postgres，同 backup-postgres.sh）、
#       POSTGRES_USER（postgres）、POSTGRES_DB（yunyan_live）、
#       CHAT_DAYS（默认 365）、CHECKIN_DAYS（默认 730）、TOOL_USAGE_DAYS（默认 365）。
# 机制：ctid IN (SELECT ctid … LIMIT batch) 循环批量删（短事务小锁）；
#       checkin 链 = records（sessionId 走 UQ 索引）→ sessions（0006 idx_checkin_sessions_started 驱动）。
set -euo pipefail

APPLY=0
BATCH="${BATCH:-5000}"
MAX_BATCHES="${MAX_BATCHES:-1000}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-yunyan-live-postgres}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-yunyan_live}"
CHAT_DAYS="${CHAT_DAYS:-365}"
CHECKIN_DAYS="${CHECKIN_DAYS:-730}"
TOOL_USAGE_DAYS="${TOOL_USAGE_DAYS:-365}"

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --batch) BATCH="$2"; shift 2 ;;
    --max-batches) MAX_BATCHES="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

for v in "$BATCH" "$MAX_BATCHES" "$CHAT_DAYS" "$CHECKIN_DAYS" "$TOOL_USAGE_DAYS"; do
  case "$v" in '' | *[!0-9]*) echo "non-numeric parameter: $v" >&2; exit 2 ;; esac
done

psql_c() {
  docker exec -i "$POSTGRES_CONTAINER" \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -q -t -A -v ON_ERROR_STOP=1 -c "$1"
}

echo "== 保留期统计（chat>${CHAT_DAYS}d / checkin>${CHECKIN_DAYS}d / tool_usage>${TOOL_USAGE_DAYS}d）=="
psql_c "SELECT 'chat_messages', count(*) FROM chat_messages WHERE created_at < now() - interval '${CHAT_DAYS} days'
        UNION ALL SELECT 'board_tool_usage', count(*) FROM board_tool_usage WHERE \"createdAt\" < now() - interval '${TOOL_USAGE_DAYS} days'
        UNION ALL SELECT 'checkin_sessions', count(*) FROM checkin_sessions WHERE \"startedAt\" < now() - interval '${CHECKIN_DAYS} days'
        UNION ALL SELECT 'checkin_records(旧session)', count(*) FROM checkin_records WHERE \"sessionId\" IN
          (SELECT id FROM checkin_sessions WHERE \"startedAt\" < now() - interval '${CHECKIN_DAYS} days');"

if [ "$APPLY" -ne 1 ]; then
  echo "dry-run 完成（未删除）。真删请加 --apply"
  exit 0
fi

run_batched_delete() {
  local label="$1" sql="$2" deleted=0 total=0 batch=0
  while [ "$batch" -lt "$MAX_BATCHES" ]; do
    deleted="$(psql_c "$sql")"
    total=$((total + deleted))
    batch=$((batch + 1))
    [ "$deleted" -eq 0 ] && break
    echo "  ${label}: batch#${batch} deleted=${deleted} (累计 ${total})"
  done
  if [ "$deleted" -ne 0 ] && [ "$batch" -eq "$MAX_BATCHES" ]; then
    echo "  ${label}: 达到 --max-batches=${MAX_BATCHES} 上限（累计 ${total}），下轮继续" >&2
  fi
}

echo "== apply：chat_messages（批 ${BATCH}，上限 ${MAX_BATCHES} 批）=="
run_batched_delete "chat" \
  "WITH d AS (DELETE FROM chat_messages WHERE ctid IN (SELECT ctid FROM chat_messages WHERE created_at < now() - interval '${CHAT_DAYS} days' LIMIT ${BATCH}) RETURNING 1) SELECT count(*) FROM d;"

echo "== apply：board_tool_usage =="
run_batched_delete "tool_usage" \
  "WITH d AS (DELETE FROM board_tool_usage WHERE ctid IN (SELECT ctid FROM board_tool_usage WHERE \"createdAt\" < now() - interval '${TOOL_USAGE_DAYS} days' LIMIT ${BATCH}) RETURNING 1) SELECT count(*) FROM d;"

echo "== apply：checkin_records + checkin_sessions（同批旧 session 级联）=="
run_batched_delete "checkin" \
  "WITH old AS (SELECT id FROM checkin_sessions WHERE \"startedAt\" < now() - interval '${CHECKIN_DAYS} days' LIMIT ${BATCH}),
        d1 AS (DELETE FROM checkin_records WHERE \"sessionId\" IN (SELECT id FROM old) RETURNING 1),
        d2 AS (DELETE FROM checkin_sessions WHERE id IN (SELECT id FROM old) RETURNING 1)
   SELECT (SELECT count(*) FROM d1) + (SELECT count(*) FROM d2);"

echo "== 清理后统计（应趋 0 或仅剩窗口内数据）=="
psql_c "SELECT 'chat_messages', count(*) FROM chat_messages WHERE created_at < now() - interval '${CHAT_DAYS} days'
        UNION ALL SELECT 'board_tool_usage', count(*) FROM board_tool_usage WHERE \"createdAt\" < now() - interval '${TOOL_USAGE_DAYS} days'
        UNION ALL SELECT 'checkin_sessions', count(*) FROM checkin_sessions WHERE \"startedAt\" < now() - interval '${CHECKIN_DAYS} days';"
echo "cleanup done"
