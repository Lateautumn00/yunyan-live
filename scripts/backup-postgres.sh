#!/usr/bin/env bash
# PostgreSQL 日备（GAP-O1 最小可用形态）。在部署机（Docker 可用）以 cron 调用：
#   0 3 * * * /path/to/yunyan-live/scripts/backup-postgres.sh /var/backups/yunyan-live
# 覆盖面说明：本脚本仅覆盖 PostgreSQL；Redis 已开 AOF（卷级），RabbitMQ DLQ 可重放，
# Janus 录像与课件落盘文件需另配文件级备份（见 README「备份与恢复」）。
set -euo pipefail

BACKUP_DIR="${1:-/var/backups/yunyan-live}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
CONTAINER="${POSTGRES_CONTAINER:-yunyan-live-postgres}"
DB="${POSTGRES_DB:-yunyan_live}"
DB_USER="${POSTGRES_USER:-postgres}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/pg-$DB-$STAMP.dump"

mkdir -p "$BACKUP_DIR"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -Fc "$DB" >"$FILE"

# 可选加密（与 backup-files.sh 同机制）：设 BACKUP_PASSPHRASE 后产物追加 .enc
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -in "$FILE" -out "$FILE.enc"
  rm -f "$FILE"
  FILE="$FILE.enc"
fi

find "$BACKUP_DIR" -name "pg-$DB-*.dump*" -mtime +"$RETENTION_DAYS" -delete
avail_pct=$(df -P "$BACKUP_DIR" | awk 'NR==2 {gsub("%","",$5); print 100-$5}')
if [ "$avail_pct" -lt 10 ]; then
  echo "WARN: 备份目录所在磁盘剩余 ${avail_pct}%（<10%）"
fi
echo "backup ok: $FILE ($(du -h "$FILE" | cut -f1)) avail=${avail_pct}%"
