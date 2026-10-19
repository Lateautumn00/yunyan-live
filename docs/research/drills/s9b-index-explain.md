# S9b 索引治理 + 保留期清理 + 孤儿巡检：综合演练记录（GAP-S9b 交付物）

规则：**无演练 = 不可用交付**。本记录随相关迁移/SQL 修订重跑追加，只增不删。
脚本：`scripts/drill-s9b-explain.sh`（docker postgres:16-alpine + db-migrate runner 建库，端口 55435）。

| 日期       | 脚本                           | 数据量                                                                                                  | 结论 | 执行人                 |
| ---------- | ------------------------------ | ------------------------------------------------------------------------------------------------------- | ---- | ---------------------- |
| 2026-10-19 | `scripts/drill-s9b-explain.sh` | participants 30万 / coursewares 20万 / transfer 10万 / chat 100万 / tool_usage 50万 / checkin 10万+30万 | PASS | 本地演练（一次性容器） |

覆盖台账原文的两块：① 索引基线清单+EXPLAIN 证据（`docs/research/index-inventory.md`）；
② 零外键方案的孤儿巡检 SQL + 保留策略首个清理任务
（`scripts/audit-orphans.sql`、`scripts/cleanup-retention.sh`，策略见 `data-retention-policy.md` §2）。

## 迁移演练（0006_s9b_hot_path_indexes）

| 步骤 | 内容                                                            | 结果 |
| ---- | --------------------------------------------------------------- | ---- |
| 1    | 空库 migrate：baseline + 0001-0006 全部 applied                 | PASS |
| 2    | 造数后 DROP 0006 六索引取"无索引基线"，再 `psql -f 0006` 重放   | PASS |
| 3    | 六索引 `pg_stat_user_indexes.idx_scan` 全部 ≥ 1（计划真实引用） | PASS |

注：原始台账缺口假设为 `user_watch_times`/`video_recordings`——两者已由
`0001_f16_list_indexes` 覆盖（见 f16 演练）；0006 的六个索引是按**实际查询路径**
（getParticipants / listCoursewares / 转播码撤销 / 三表保留窗口）另行核实出来的缺口。

## EXPLAIN 证据（EXPLAIN (ANALYZE, BUFFERS)，对照 = 同查询 drop 0006 索引前 vs 应用后）

### 热路径（教室打开即触发的查询）

| 场景                     | 数据量           | 无索引（基线）                                  | 0006 应用后                                                       | 加速       |
| ------------------------ | ---------------- | ----------------------------------------------- | ----------------------------------------------------------------- | ---------- |
| getParticipants 花名册   | 30万（热房5000） | **17.3 ms** Parallel Seq Scan（滤掉 14.75万×2） | **1.99 ms** Bitmap Index Scan `idx_live_participants_room_joined` | **~8.7×**  |
| listCoursewares 课件列表 | 20万（热房5000） | **25.2 ms** Seq Scan（滤掉 19.5万）             | **2.18 ms** Bitmap Index Scan `idx_coursewares_room_created`      | **~11.5×** |
| 转播码撤销 UPDATE        | 10万（命中1）    | **8.5 ms** Seq Scan（滤掉 99999）               | **0.25 ms** Index Scan `idx_live_transfer_codes_room_user`        | **~34×**   |

热路径在真实教室规模下均为打开即调用；无索引时随表增长线性恶化，应用后恒定毫秒级。

### 保留期删除驱动（cleanup-retention.sh 的查询形态）

| 场景                              | 数据量              | 无索引（基线）                               | 0006 应用后                                                                     |
| --------------------------------- | ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| chat 批删（365天窗外 LIMIT 5000） | 100万（窗外8.75万） | 21.1 ms，Seq Scan（每批从头扫、滤 52194 行） | 17.2 ms，Bitmap Index Scan `idx_chat_messages_created`（索引段 read 879→76 块） |
| tool_usage 批删（同形）           | 50万（窗外4.4万）   | 21.1 ms Seq Scan                             | 10.0 ms Bitmap Index Scan `idx_board_tool_usage_created`                        |
| checkin 窗驱动 SELECT（730天）    | 10万（窗外1.9万）   | 5.0 ms Seq Scan                              | 1.4 ms Bitmap Index Scan `idx_checkin_sessions_started`                         |

**诚实结论**：单批 EXPLAIN 的绝对时间差不大（批上限 5000 框住了工作量），但计划形态
是本质差异——无索引时**每一批都从头全表扫**，批数线性放大总成本（台账目标 2000 万行
量级下 = 每批 2000 万行扫描 × 批数）；有索引后每批成本恒定为"索引定位 + 删 5000"。
删除本身（行锁/undo/WAL）两侧相同，不可比；可比的是**行定位成本**（Buffers read 段）。

## 孤儿巡检自检（scripts/audit-orphans.sql）

造 3 个孤儿（participants/chat_messages 指向不存在的 `room-ghost`、records 指向不存在的 session）：

| 阶段   | 11 条门禁关系                                           | 观察项 `rooms.liveUserId→users`         |
| ------ | ------------------------------------------------------- | --------------------------------------- |
| 检出   | 01/03/06 各 =1，其余 0（**恰好检出全部 3 个，无漏报**） | 20001（drill 未造 users，**预期非零**） |
| 清理后 | 11 行全 0（**PASS**）                                   | 20001（不变，不阻断）                   |

结论：11 条门禁 SQL 检出/归零行为符合预期；观察项按 runbook 口径单独评估不设门禁。

## 保留期清理任务演练（scripts/cleanup-retention.sh）

dry-run 统计（CHAT_DAYS=365 / CHECKIN_DAYS=730 / TOOL_USAGE_DAYS=365）：

| 表                  | 窗外行数 |
| ------------------- | -------- |
| chat_messages       | 87500    |
| board_tool_usage    | 43750    |
| checkin_sessions    | 18870    |
| checkin_records(旧) | 56610    |

有界 apply（`--apply --batch 5000 --max-batches 2`）→ 复查统计：

| 表               | apply 前 | 2 批后 | 差值                              |
| ---------------- | -------- | ------ | --------------------------------- |
| chat_messages    | 87500    | 77500  | −10000（2×5000 ✓）                |
| board_tool_usage | 43750    | 33750  | −10000 ✓                          |
| checkin_sessions | 18870    | 8870   | −10000 ✓                          |
| checkin_records  | 56610    | 26610  | −30000（每 session 级联 ~3 条 ✓） |

结论：dry-run 不删数据、`--apply` 批量循环精确、级联关系正确、达上限时提示下轮继续 —— **PASS**。
保留期限数值为**草案**（待 S11⑤ 签批转正，见 `data-retention-policy.md` §2）。
