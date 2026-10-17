# chat_messages 分区迁移 Runbook（GAP-O8）

> **触发线（强制评审项，非可选）**：行数 ≥ 2000 万 **或** 关系总大小 ≥ 50GB
> （`chat-persistence-plan.md` §4.3 C14 / §8 C-15）。监控与告警由
> `scripts/check-chat-partition-trigger.sh` 承担（建议每日 cron）。
>
> **当前状态（2026-10-17）**：现网 `chat_messages` = **3 行 / 64 KB**，远未触发 ——
> 本文为**预案性 runbook**。全流程已本地演练通过：[`drills/chat-partitioning-drill.md`](../drills/chat-partitioning-drill.md)，
> 可重复执行 `scripts/drill-chat-partitioning.sh`（小数据量全阶段复现）。

## 0. 语义前置（结论已随仓库发布，步骤必须先满足）

分区迁移的两个硬约束已由**步骤 0 兼容代码**解除，**迁移前必须确认该版本已部署**：

| 问题                                                                                                                                      | 事实                                                                                                                                                                                      | 处置                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ON CONFLICT (msg_id)` 在分区表上直接报错（演练实证 `there is no unique or exclusion constraint matching the ON CONFLICT specification`） | 旧子句只匹配全局唯一约束，分区后不存在                                                                                                                                                    | `persist.ts` 已改为**无目标** `ON CONFLICT DO NOTHING`（普通表命中 `(msg_id)`，分区表命中 `(msg_id, created_at)`，两态通吃）→ 切表与代码发布**解耦**，无需原子绑定 |
| "降级为分区内去重"是否弱化幂等                                                                                                            | `created_at` 是消息固有属性（`row.createdAtMs` → `to_timestamp(ms/1000)`，**非 NOW()**；plan §4.3 明令禁止静默 NOW()）：同一 `msg_id` 重放必带同一 `created_at` → 必落同分区 → 冲突仍命中 | **幂等无损**。残余风险仅当未来引入"同 msg_id 改写 created_at"的写入——已由 plan 设计禁死                                                                            |
| `id` 不再全局唯一（PK 改 `(id, created_at)`）                                                                                             | 读写路径无按 `id` 单查：persist 仅按 `msg_id` upsert；history 走 `(room_id, created_at DESC, id DESC)` keyset，复合 PK 覆盖                                                               | 无影响面                                                                                                                                                           |

**步骤 0 检查**：

```bash
grep -q "ON CONFLICT DO NOTHING" apps/chat-ws-service/src/persist.ts && echo OK
# 且确认线上 chat-ws 部署版本包含该提交（发布顺序不再强制 DDL→代码倒置，见 plan §4.3 M2）
```

## 1. 前置门禁（停写窗口开始前全部勾掉）

- [ ] O1 备份成功（`scripts/backup-postgres.sh` 最近日备 + 恢复演练记录在案）
- [ ] `scripts/check-chat-partition-trigger.sh` 输出已人工复核（行数/大小实测）
- [ ] 触发线评审完成（DBA + 架构，50GB 回填窗口排期）
- [ ] 步骤 0 兼容代码已在生产 chat-ws 运行
- [ ] 目标分区范围规划：按月分区 + `DEFAULT` 兜底（演练采用 2026-08..10 + default）
- [ ] 停写窗口通告：窗口内 chat-ws 停实例，新消息堆在 durable work queue（重启即续，DLQ 兜底重放），窗口目标 **≤ 10 分钟**（回填在线、窗口只补 delta）

## 2. 阶段 1 — 建目标分区表（不动原表）

```sql
-- LIKE 关键：INCLUDING DEFAULTS INCLUDING IDENTITY 保留 id 自增；
-- EXCLUDING INDEXES 避免把旧 PK(id)/UQ(msg_id) 复制进分区父表直接冲突（演练实证）
CREATE TABLE chat_messages_p (LIKE chat_messages
  INCLUDING DEFAULTS INCLUDING IDENTITY EXCLUDING INDEXES)
  PARTITION BY RANGE (created_at);

CREATE TABLE chat_messages_p_2026_11 PARTITION OF chat_messages_p
  FOR VALUES FROM ('2026-11-01+08') TO ('2026-12-01+08');
-- ……按月建至规划末端
CREATE TABLE chat_messages_p_default PARTITION OF chat_messages_p DEFAULT;

ALTER TABLE chat_messages_p ADD PRIMARY KEY (id, created_at);
CREATE UNIQUE INDEX UQ_chat_messages_p_msg_time ON chat_messages_p (msg_id, created_at);
CREATE INDEX IDX_chat_messages_p_room_time
  ON chat_messages_p (room_id, created_at DESC, id DESC);
```

default 分区会吸收未来新月份 —— 每月预建分区写入维护任务；default 被使用时监控告警（`pg_class` default 分区行数 > 0 即提醒）。

## 3. 阶段 2 — 在线分批回填（原表照常写入）

```sql
-- 每批建议 ≤ 500 万行或 ≤ 1 个月；大批量 INSERT..SELECT 避开高峰
INSERT INTO chat_messages_p
SELECT * FROM chat_messages
 WHERE created_at >= '2026-11-01+08' AND created_at < '2026-12-01+08';
-- 进度：
SELECT count(*) FROM chat_messages;      -- 原表（含回填期间新写）
SELECT count(*) FROM chat_messages_p;
```

重复执行安全：`ON CONFLICT DO NOTHING`（无目标）可整批重跑补齐漏批。

## 4. 阶段 3 — 停写窗口：补 delta

1. 停 chat-ws（`docker compose stop chat-ws` 或对应部署单元）。
2. 抓 delta（窗口开始以来的新行）并补入：

```sql
INSERT INTO chat_messages_p
SELECT * FROM chat_messages c
 WHERE c.id > (SELECT coalesce(max(id), 0) FROM chat_messages_p)
ON CONFLICT DO NOTHING;

SELECT (SELECT count(*) FROM chat_messages)  AS old,
       (SELECT count(*) FROM chat_messages_p) AS new,
       (SELECT count(*) FROM chat_messages) - (SELECT count(*) FROM chat_messages_p) AS diff;  -- 必须 = 0
```

> **50GB 规模提示**：回填已在阶段 2 在线完成，delta 量级 = 窗口内消息量（分钟级、
> 万行级）。若因故回填未完成才进窗口，**回退到阶段 2**，不要在窗口内做全量回填。

## 5. 阶段 4 — 原子切换 + 验证 + 重启

```sql
ALTER TABLE chat_messages    RENAME TO chat_messages_old;   -- 索引/约束/分区自动跟随
ALTER TABLE chat_messages_p  RENAME TO chat_messages;
```

验证清单（全部通过才重启）：

```sql
-- ① 幂等复验（步骤 0 代码语义）
--    同 msg_id+created_at 插两次 ON CONFLICT DO NOTHING → 恰 1 行
-- ② 约束就位
\d chat_messages     -- Partition key: RANGE (created_at)；Primary key (id, created_at)；
                     -- Unique (msg_id, created_at)；room_time 索引在
-- ③ 历史查询可走索引（见 §7 性能注意事项）
```

重启 chat-ws → 消费积压 → 观察 error 日志与 DLQ 深度 → 触发线脚本再跑（表名未变，应转绿）。

## 6. 观察期与收尾

- **观察期 ≥ 7 天**（回滚窗口）：`chat_messages_old` 保留。
- 回滚（观察期内任意时点，步骤 0 代码两态通吃 → 双向可切）：

```sql
ALTER TABLE chat_messages     RENAME TO chat_messages_new;
ALTER TABLE chat_messages_old RENAME TO chat_messages;
-- 重启 chat-ws，回滚窗口内新消息（在新表）按 delta 路径反向补一次
```

- 观察期满：`DROP TABLE chat_messages_old;`（务必先确认 O1 新备份成功）。

## 7. 性能注意事项（演练实证）

keyset 翻页的行比较 `(created_at, id) < ($1,$2)` **不能触发分区静态裁剪** ——
`EXPLAIN` 显示 Append 扫全部分区（各分区内部仍走索引，但多分区时寻路退化）。
拆出**独立 `created_at` 上界谓词**即可裁剪（演练对照：4 分区 → 3 分区，10 月分区被裁掉）：

```sql
SELECT id, created_at, content FROM chat_messages
 WHERE room_id = $1
   AND created_at < $2                      -- ← 独立谓词，供分区裁剪
   AND (created_at, id) < ($2, $3)
 ORDER BY created_at DESC, id DESC LIMIT 50;
```

历史查询 SQL 改造随 F16/后续优化落地；**切换前后的查询正确性不受影响**（只是多扫分区）。

## 8. 触发线监控

```bash
# 每日 cron（低频：行数为精确 count，2000 万级为秒级扫描）
DATABASE_URL=postgres://… scripts/check-chat-partition-trigger.sh
# 超线 → stderr 告警 + exit 1（接 cron 邮件/告警通道）
```

脚本对**分区父表**同样有效（`pg_partition_tree` 叶子汇总大小；精确 `count(*)` 含全部分区）。
低阈值红/默认绿双路径已演练（见演练记录步骤 10）。

## 9. 演练

```bash
scripts/drill-chat-partitioning.sh   # 起临时 PG → S9a runner 建库 → 20 万行全流程 → 自动清理
```

阶段 0-11 全绿才算 runbook 可用；最近一次记录：
[`drills/chat-partitioning-drill.md`](../drills/chat-partitioning-drill.md)（2026-10-17 PASSED）。
