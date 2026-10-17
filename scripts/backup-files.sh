#!/usr/bin/env bash
# 文件级备份（GAP-O1 完成项）：RabbitMQ 数据卷 + Janus 录像目录 + 课件/上传落盘。
# 与 backup-postgres.sh 同目录约定，部署机 cron 示例：
#   30 3 * * * /path/to/yunyan-live/scripts/backup-files.sh /var/backups/yunyan-live
#
# 加密：设置 BACKUP_PASSPHRASE 后产物追加 .enc（openssl aes-256-cbc -pbkdf2）；
#       密钥不入库，部署机存入仅 root 可读的密钥文件（见 README「备份与恢复」）。
# 覆盖缺口说明（README「备份与恢复」同口径）：
#   - Redis：AOF 卷级（init/docker-compose.yml appendonly yes），本脚本不重复覆盖
#   - Janus 录像/课件目录：按 env 路径打包，路径不存在时跳过并标注
set -euo pipefail

BACKUP_DIR="${1:-/var/backups/yunyan-live}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILES_DB="${POSTGRES_DB:-yunyan_live}"

# 课件/图片落盘（server 进程 cwd 下的 uploads）
UPLOADS_DIR="${UPLOADS_DIR:-apps/server/uploads}"
# Janus 录像宿主机目录
RECORDINGS_DIR="${RECORDINGS_DIR:-/home/janus/recordings}"
# RabbitMQ 数据卷
RABBITMQ_VOLUME="${RABBITMQ_VOLUME:-init_rabbitmqdata}"

mkdir -p "$BACKUP_DIR"

archive() {
  # archive <归档名不含扩展> <tar 内容描述> <tar 参数...>
  local name="$1"; shift
  local out="$BACKUP_DIR/$name.tar.gz"
  if tar -czf "$out" "$@" 2>/dev/null; then
    echo "  ok: $out ($(du -h "$out" | cut -f1))"
  else
    rm -f "$out"
    echo "  skip: $name（源不存在或为空）"
  fi
}

echo "files backup start: $STAMP"

# 1) RabbitMQ 数据卷（docker 卷 → tar）
if docker volume inspect "$RABBITMQ_VOLUME" >/dev/null 2>&1; then
  out="$BACKUP_DIR/rabbitmq-$STAMP.tar.gz"
  if docker run --rm -v "$RABBITMQ_VOLUME":/src:ro -v "$BACKUP_DIR":/dst alpine \
    tar -czf "/dst/rabbitmq-$STAMP.tar.gz" -C /src . 2>/dev/null; then
    echo "  ok: $out ($(du -h "$out" | cut -f1))"
  else
    rm -f "$out"
    echo "  FAIL: rabbitmq 卷备份失败（卷=$RABBITMQ_VOLUME）"
    exit 1
  fi
else
  echo "  skip: rabbitmq 卷 $RABBITMQ_VOLUME 不存在"
fi

# 2) Janus 录像目录（宿主机路径）
if [ -d "$RECORDINGS_DIR" ]; then
  archive "recordings-$STAMP" -C "$RECORDINGS_DIR" .
else
  echo "  skip: 录像目录 $RECORDINGS_DIR 不存在（部署机须配置 RECORDINGS_DIR）"
fi

# 3) 课件/上传落盘
if [ -d "$UPLOADS_DIR" ]; then
  archive "uploads-$STAMP" -C "$UPLOADS_DIR" .
else
  echo "  skip: uploads 目录 $UPLOADS_DIR 不存在"
fi

# 加密（可选）
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  for f in "$BACKUP_DIR"/*-"$STAMP".tar.gz; do
    [ -f "$f" ] || continue
    openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -in "$f" -out "$f.enc"
    rm -f "$f"
    echo "  enc: $f.enc"
  done
else
  echo "  note: BACKUP_PASSPHRASE 未设置，产物未加密（部署机应配置）"
fi

# 保留策略（日备 7 天，可调）
find "$BACKUP_DIR" -name "*.tar.gz*" -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "*.dump" -mtime +"$RETENTION_DAYS" -delete

# 磁盘水位：备份目录所在盘余量 <10% 时输出告警行（不阻断，供 cron 邮件/日志采集）
avail_pct=$(df -P "$BACKUP_DIR" | awk 'NR==2 {gsub("%","",$5); print 100-$5}')
if [ "$avail_pct" -lt 10 ]; then
  echo "WARN: 备份目录所在磁盘剩余 ${avail_pct}%（<10%），请扩容或缩短保留期"
fi

echo "files backup ok: dir=$BACKUP_DIR stamp=$STAMP avail=${avail_pct}%"
