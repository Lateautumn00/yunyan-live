# 分区迁移演练记录（GAP-O8 交付物）

规则：**无演练 = 不可用 runbook**。runbook（`docs/research/runbooks/chat-messages-partitioning.md`）
每有实质修订，重跑一次 `scripts/drill-chat-partitioning.sh` 并逐次追加，只增不删。

| 日期       | 脚本                                 | 数据量  | 阶段        | 结论 | 执行人                                                  |
| ---------- | ------------------------------------ | ------- | ----------- | ---- | ------------------------------------------------------- |
| 2026-10-17 | `scripts/drill-chat-partitioning.sh` | 20 万行 | 0–11 全通过 | PASS | 本地演练（一次性 postgres:16-alpine + S9a runner 建库） |

## 演练上下文（2026-10-17）

- 环境：Docker `postgres:16-alpine`，端口 55433，库由 `scripts/db-migrate.mjs` 从
  `db/schema-baseline.sql` 重建（复用真实 DDL/索引/uuid-ossp 扩展），演练后容器自动清理。
- 数据：20 万行跨 2026-08/09/10 三个月 + 步骤 0 探针行 + 1000 行窗口 delta。
- 基线现况：现网 `chat_messages` 3 行 / 64 KB，**远未触发分区线**（预案性 runbook）。

### 逐阶段证据

| 阶段 | 内容                                                                                                                         | 结果 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- | ---- |
| 0    | S9a runner 建库                                                                                                              | PASS |
| 1    | 造数 20 万（min 2026-07-31 / max 2026-10-31）                                                                                | PASS |
| 2    | 步骤 0 代码：无目标 `ON CONFLICT DO NOTHING` 普通表幂等（重放后同 msg_id = 1 行）                                            | PASS |
| 3    | 建分区父表 + 复合 PK/UNIQUE + keyset 索引（3 月分区 + default）                                                              | PASS |
| 4    | 分批回填，old=new=200001                                                                                                     | PASS |
| 5    | 停写窗口 delta 1000 行，diff=0                                                                                               | PASS |
| 6    | RENAME 原子切换                                                                                                              | PASS |
| 7    | 新分区表上无目标 ON CONFLICT 幂等复验（= 1 行）                                                                              | PASS |
| 8    | 旧子句 `ON CONFLICT (msg_id)` 在分区表**按预期报错**（`no unique or exclusion constraint matching…`）→ 证明步骤 0 必须先部署 | PASS |
| 9    | 约束/索引就位；EXPLAIN 对照见下                                                                                              | PASS |
| 10   | 触发线监控：默认绿（201002/2000万、56MB/50GB）+ 低阈值红（exit 1）                                                           | PASS |
| 11   | 回滚 RENAME 双向回切（rolled_back=201001，回滚窗口可回退）                                                                   | PASS |

### EXPLAIN 对照（runbook §7 依据）

- **9a 现行 keyset**（仅 `(created_at,id) < …` 行比较）：Append 扫**全部 4 分区** —— 行比较
  不触发静态裁剪。
- **9b 拆出独立 `created_at < $2` 谓词**：Append 只剩 3 分区（2026-10 分区被裁掉）——
  静态裁剪生效。切换前后查询正确性不受影响，仅性能形态差异（改造点已记 runbook §7）。

### 演练中修正的问题（脚本/监控真实性问题，均已修复并复跑全绿）

1. `docker run` 缺 `-i` → heredoc 静默丢失（空输入 psql 退出 0，假成功）。
2. `LIKE … INCLUDING DEFAULTS` **不复制 IDENTITY** → 切换后新行 `id` 为 NULL 违约；
   改为 `INCLUDING DEFAULTS INCLUDING IDENTITY EXCLUDING INDEXES`（`EXCLUDING INDEXES`
   同时避免把旧 PK/UQ 复制进分区父表冲突）。
3. 监控脚本三处实证修正：分区父表 `pg_total_relation_size`=0B → 改 `pg_partition_tree`
   叶子汇总（列名是 `relid`+`isleaf`，**不存在** `leafrelid`）；行数 reltuples 估算在
   未 ANALYZE 分区上=0（漏报）→ 改精确 `count(*)`；`FROM ONLY` 对分区父表不计子分区 →
   去掉 ONLY。监控频率定为低频（每日 cron）。

## 生产触发线检查（现网，只读）

```text
$ scripts/check-chat-partition-trigger.sh --dsn postgres://…@192.168.2.100:5432/yunyan_live
[chat-trigger] OK: chat_messages rows=3/20000000, size=64KB/50GB   → exit 0
```

结论：**触发线未到，预案与监控就绪**；接入 cron 后超线自动 exit 1 告警。
