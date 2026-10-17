#!/usr/bin/env bash
# PostgreSQL 恢复演练（GAP-O1 交付物：无演练=假备份）。
# 用一次性容器导入最近备份并冒烟查询；建议每月随 cron 备份后执行一次：
#   0 4 1 * * /path/to/yunyan-live/scripts/restore-drill.sh "$(ls -t /var/backups/yunyan-live/pg-yunyan_live-*.dump | head -1)"
set -euo pipefail

DUMP="${1:?usage: restore-drill.sh <dump file>}"
[ -f "$DUMP" ] || { echo "FAIL: dump not found: $DUMP" >&2; exit 1; }

TMP_NAME="yunyan-live-restore-drill-$$"
TMP_PG_PASSWORD="${TMP_PG_PASSWORD:-drill}"

cleanup() {
  docker rm -f "$TMP_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d --name "$TMP_NAME" \
  -e POSTGRES_PASSWORD="$TMP_PG_PASSWORD" \
  -e POSTGRES_DB=yunyan_live \
  postgres:16-alpine >/dev/null

for _ in $(seq 1 30); do
  if docker exec "$TMP_NAME" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker exec -i "$TMP_NAME" pg_restore -U postgres -d yunyan_live --no-owner <"$DUMP"

TABLES=$(docker exec "$TMP_NAME" psql -U postgres -d yunyan_live -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
USERS=$(docker exec "$TMP_NAME" psql -U postgres -d yunyan_live -tAc "SELECT count(*) FROM users")

echo "restore drill ok: tables=$TABLES users=$USERS"
if [ "$TABLES" -lt 11 ]; then
  echo "FAIL: expected >=11 tables, got $TABLES" >&2
  exit 1
fi
