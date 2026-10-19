# 数据库迁移机制（GAP-S9a 冻结落地）

> 本目录是**唯一**的 schema 变更入口。三轨并存（TypeORM `synchronize` / `init/schema.sql` /
> 手工 SQL）已于批次 2 关闭：`live-service` 默认 `synchronize: false`（`NODE_ENV=production`
> 下显式请求 `TYPEORM_SYNC=true` 直接拒启动），其余手工 SQL 目录封存。
> 批次 5 起 compose 建库改为直载 `db/schema-baseline.sql`（单一事实源），`init/schema.sql` 已移除。

## 目录与迁移序列

| 顺序 | 版本 ID | 文件 | origin | 说明 |
| --- | --- | --- | --- | --- |
| 1 | `00000000_baseline` | `db/schema-baseline.sql` | baseline | 期望态 schema 快照（初始为现网库 `pg_dump --schema-only`） |
| 2 | `20260907_create_user_watch_times` 等 4 个 | `apps/{live-service,chat-ws-service}/src/migrations/*.sql` | legacy | **已并入 baseline**：只登记 `merged`，永不执行；目录封存 |
| 3 | `0001_*` 起 | `db/migrations/*.sql` | migration | 今后新增迁移的唯一入口（数字前缀排序） |

记账表：`public.schema_migrations(version PK, file, origin, checksum, applied_at)`。
dump/比对时用 `pg_dump --exclude-table=schema_migrations` 排除记账表。

## 命令

```bash
pnpm db:migrate            # 空库：执行 baseline + 登记 legacy + 顺序执行 db/migrations 待办
pnpm db:migrate:status     # 只读状态：applied / merged / pending
node scripts/db-migrate.mjs --dry-run   # 列出将执行的迁移，不落库
node scripts/db-migrate.mjs --baseline  # 既有 schema 的库：登记 baseline+legacy（不执行 SQL）
```

连接串读取顺序：`DATABASE_URL` 环境变量 → 仓库根 `.env` → `apps/*/.env`。

## 规则（forward-only）

1. **迁移文件冻结**：已应用的 legacy / migration 文件禁改禁删——checksum 不符或文件缺失
   → runner `exit 1`。修复只准追加新迁移文件。
2. **legacy 目录封存**：`apps/*/src/migrations/` 只承认 4 个白名单历史文件，新增文件直接报错。
3. **baseline 是"期望态快照"（checksum 豁免）**：新增迁移的 PR **必须同步**重新 dump 更新
   `db/schema-baseline.sql`（否则 CI diff 门禁红）。它不是已执行迁移，只被登记/豁免校验。
4. **已有 schema 的库**（如现网）没有 `schema_migrations` 记录时，普通 `db:migrate` 拒绝执行，
   必须显式 `--baseline` 登记（防对既有库误放 baseline SQL）。

## CI 门禁（`.github/workflows/ci.yml` → `schema` job）

空库重放全部迁移 → `pg_dump --schema-only --exclude-table=schema_migrations` →
`scripts/normalize-schema-dump.sh` 规范化（剥离 `\restrict` 随机 token 与 pg_dump 版本行）→
与 `db/schema-baseline.sql` 做 `diff -u`，**任何漂移即红**（未走迁移直接动表、忘记同步
baseline、重放不完整都会被抓住）。

本地预演同一套命令：

```bash
DATABASE_URL=... node scripts/db-migrate.mjs
pg_dump ... --exclude-table=schema_migrations | ./scripts/normalize-schema-dump.sh > /tmp/got.sql
./scripts/normalize-schema-dump.sh db/schema-baseline.sql > /tmp/base.sql
diff -u /tmp/base.sql /tmp/got.sql
```

baseline 应与 `postgres:16.15-alpine`（CI 同款）的 pg_dump 生成，保证输出格式一致。

## 新增迁移 SOP

1. 写 `db/migrations/0001_<描述>.sql`（forward-only，一次写对，合并后不可再改）。
2. 本地空库验证：`docker run -p 55432:5432 postgres:16.15-alpine` → `pnpm db:migrate` →
   `pnpm db:migrate:status` 全绿。
3. 更新 baseline：对**已应用全链**的库执行
   `pg_dump --schema-only --no-owner --no-privileges --exclude-table=schema_migrations > db/schema-baseline.sql`
   （用 `scripts/normalize-schema-dump.sh` 先规范化亦可，门禁会规范化比对）。
4. 跑一遍上节"本地预演"，diff 为空后随 PR 提交（迁移文件 + baseline 同一个 PR）。
5. 部署时在启动服务前执行 `pnpm db:migrate`。

## 现网库一次性登记（运维步骤，非本仓库 CI 范围）

```bash
# 在可访问现网库的机器上，确认 status 显示无记录：
DATABASE_URL=postgres://...@192.168.2.100:5432/yunyan_live node scripts/db-migrate.mjs --status
# 登记（只写 schema_migrations，不执行任何 DDL）：
DATABASE_URL=... node scripts/db-migrate.mjs --baseline
# 复核：
DATABASE_URL=... node scripts/db-migrate.mjs --status   # 5 recorded, 0 pending
```

> 登记前确保现网库已有 O1 备份（`scripts/backup-postgres.sh`，见 README 备份节）。

## docker compose 全新起库（直载 db/schema-baseline.sql）

`init/docker-compose.yml` 的 postgres 首次启动直接装载本目录的 `schema-baseline.sql`
（docker-entrypoint-initdb.d；单一事实源，杜绝 `init/schema.sql` 与 baseline 的双轨漂移——
批次 5 实测旧便利轨缺 `audit_logs`/`board_tool_usage`/`chat_moderation` 3 表与
chat_messages 的 recall 列）。起库后登记两次即可纳入 runner 管理：

```bash
pnpm db:migrate -- --baseline   # 对已由 baseline 直载建表的库（登记 baseline+legacy）
pnpm db:migrate                 # 幂等重放 0001+（全部 IF NOT EXISTS，纯登记）
pnpm db:migrate:status          # 11 recorded, 0 pending
```

新表/新列一律走 `db/migrations/` SOP 并同步 `schema-baseline.sql`；compose 侧无需任何动作。

## 冻结生效开关（live-service）

| 环境 | `TYPEORM_SYNC` | 结果 |
| --- | --- | --- |
| 任意 | 未设 / `false` | `synchronize: false`（默认） |
| 非生产 | `true` | `synchronize: true`（本地开发逃生舱） |
| `NODE_ENV=production` | `true` | **启动即抛错**：`[GAP-S9a] TYPEORM_SYNC=true is forbidden…` |

`auth-service` 恒为 `synchronize: false`；`server` / `chat-ws-service` 不使用 TypeORM。
