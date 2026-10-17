#!/usr/bin/env bash
# GAP-O8: chat_messages 分区触发线监控。
# 触发线（chat-persistence-plan.md §4.3 C14，强制评审项）：
#   行数 >= 2000 万  或  关系总大小 >= 50GB（分区父表按 pg_partition_tree 叶子汇总）
# 超线 → 打印告警并 exit 1（供 cron / CI / 告警通道消费）。
#
# 用法：
#   scripts/check-chat-partition-trigger.sh                      # 默认触发线
#   scripts/check-chat-partition-trigger.sh --rows 1000 --bytes 1024   # 演练用低阈值
#   scripts/check-chat-partition-trigger.sh --table chat_messages --dsn "$DATABASE_URL"
#   scripts/check-chat-partition-trigger.sh --json               # 机器可读输出
set -euo pipefail

# 建议低频调度（如每日 cron）：行数为精确 count，对 2000 万级表为秒级全表扫描。
ROWS_LIMIT=20000000
BYTES_LIMIT=$((50 * 1024 * 1024 * 1024))
TABLE=chat_messages
DSN="${DATABASE_URL:-}"
JSON=0

while [ $# -gt 0 ]; do
  case "$1" in
    --rows) ROWS_LIMIT="$2"; shift 2 ;;
    --bytes) BYTES_LIMIT="$2"; shift 2 ;;
    --table) TABLE="$2"; shift 2 ;;
    --dsn) DSN="$2"; shift 2 ;;
    --json) JSON=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$DSN" ]; then
  echo "[chat-trigger] ERROR: DATABASE_URL / --dsn not provided" >&2
  exit 2
fi

# 部署机/CI 用原生 psql；开发机无客户端时回退 docker（--network host 保证 DSN 可达）
PSQL_BIN="$(command -v psql || true)"
if [ -z "$PSQL_BIN" ]; then
  command -v docker >/dev/null 2>&1 || {
    echo "[chat-trigger] ERROR: neither psql nor docker available" >&2
    exit 2
  }
  PSQL_BIN="docker run --rm --network host -e PGPASSWORD=\${PGPASSWORD:-} postgres:16-alpine psql"
fi

# 行数精确 count（reltuples 估算在未 ANALYZE 的新分区上=0 会漏报，演练实证）；
# 监控按低频运行（建议每日 cron）。大小对分区父表用 pg_partition_tree 汇总叶子
# （父表 pg_total_relation_size=0B，演练实证）。
read -r rows bytes < <(
  # shellcheck disable=SC2086
  $PSQL_BIN "$DSN" -X -q -A -t -F' ' \
    -c "SELECT (SELECT count(*) FROM ${TABLE}),
            CASE WHEN c.relkind = 'p'
              THEN (SELECT COALESCE(sum(pg_total_relation_size(pt.relid)),0)::bigint
                      FROM pg_partition_tree(c.oid) pt WHERE pt.isleaf)
              ELSE pg_total_relation_size(c.oid) END
         FROM pg_class c
         WHERE c.oid = to_regclass('${TABLE}') AND c.relkind IN ('r','p')"
)

if [ -z "${rows:-}" ] || [ -z "${bytes:-}" ]; then
  echo "[chat-trigger] ERROR: table '${TABLE}' not found or not a regular/partitioned table" >&2
  exit 2
fi

exceeded=0
[ "$rows" -ge "$ROWS_LIMIT" ] && exceeded=1
[ "$bytes" -ge "$BYTES_LIMIT" ] && exceeded=1

human_bytes() { numfmt --to=iec --suffix=B "$1" 2>/dev/null || echo "${1}B"; }

if [ "$JSON" = 1 ]; then
  printf '{"table":"%s","rows":%s,"rows_limit":%s,"bytes":%s,"bytes_limit":%s,"triggered":%s}\n' \
    "$TABLE" "$rows" "$ROWS_LIMIT" "$bytes" "$BYTES_LIMIT" "$([ "$exceeded" = 1 ] && echo true || echo false)"
fi

if [ "$exceeded" = 1 ]; then
  echo "[chat-trigger] ALERT: ${TABLE} hit partition trigger line: rows=${rows} (limit ${ROWS_LIMIT}), size=$(human_bytes "$bytes") (limit $(human_bytes "$BYTES_LIMIT"))" >&2
  echo "[chat-trigger] action: schedule partitioning (docs/research/runbooks/chat-messages-partitioning.md) + O1 backup first" >&2
  exit 1
fi

echo "[chat-trigger] OK: ${TABLE} rows=${rows}/${ROWS_LIMIT}, size=$(human_bytes "$bytes")/$(human_bytes "$BYTES_LIMIT")"
