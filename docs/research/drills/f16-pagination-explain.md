# F16 列表接口 SQL 化：迁移 + EXPLAIN 演练记录（GAP-F16 交付物）

规则：**无演练 = 不可用交付**。本记录随 F16 相关迁移/SQL 修订重跑追加，只增不删。
脚本：`scripts/drill-f16-explain.sh`（docker postgres:16-alpine + S9a runner 建库）。

| 日期       | 脚本                           | 数据量                                                          | 结论 | 执行人                                            |
| ---------- | ------------------------------ | --------------------------------------------------------------- | ---- | ------------------------------------------------- |
| 2026-10-18 | `scripts/drill-f16-explain.sh` | rooms 2万 / participants 30万 / watch_times 100万 / videos 20万 | PASS | 本地演练（一次性 postgres:16-alpine，端口 55434） |

## 迁移演练（0001_f16_list_indexes）

环境：`postgres:16.15-alpine`（CI 同款镜像）空库。

| 步骤 | 内容                                                                                        | 结果 |
| ---- | ------------------------------------------------------------------------------------------- | ---- |
| 1    | 空库 `pnpm db:migrate`：baseline + 4 legacy merged + `0001_f16_list_indexes` applied        | PASS |
| 2    | 5 个索引全部创建（`pg_indexes` 核对）                                                       | PASS |
| 3    | `pg_dump --schema-only` + normalize 与旧 baseline diff = **恰好 5 个索引行**（无意外漂移）  | PASS |
| 4    | 刷新 `db/schema-baseline.sql` 后重放预演（dropdb/createdb → migrate → dump → diff）= **空** | PASS |

注意：演练中曾用 `DROP SCHEMA public; CREATE SCHEMA public` 复位导致 dump 多出
`COMMENT ON SCHEMA public` 一行——是复位手法污染而非迁移漂移；**预演复位必须用
dropdb/createdb**（或全新容器），不能 drop/recreate schema。

## EXPLAIN 证据（EXPLAIN (ANALYZE, BUFFERS)，数据见上表）

### getStudentRooms（student-0 重用户 2 万行）

| 场景              | 执行时间    | 计划                                                                                                 |
| ----------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| page1（OFFSET 0） | **0.29 ms** | `Index Scan using idx_live_participants_user_joined`，取 10 行即停                                   |
| 深 OFFSET 19990   | **24.6 ms** | 优化器放弃索引：Bitmap Index Scan（UQ 唯一键）+ Hash Join + quicksort 全排序 20000 行再丢前 19990 行 |
| keyset cursor     | **0.35 ms** | 与 page1 同形：`Index Scan using idx_live_participants_user_joined`，10 行即停                       |

深翻页 **~70×**（24.6 ms → 0.35 ms）。OFFSET 越深，"先扫 OFFSET+N 再丢弃"的浪费线性放大；
keyset 恒定为索引定位 + 取 10 行。

### getUserWatchTimeList（100 万行，全量在线房间）

| 场景                                  | 执行时间    | 计划                                                       |
| ------------------------------------- | ----------- | ---------------------------------------------------------- |
| page1                                 | **0.57 ms** | `Index Scan using idx_user_watch_times_created`，10 行即停 |
| 深 OFFSET 999900                      | **1038 ms** | 同索引但被迫走完 999910 行（Memoize 循环 99.9 万次）       |
| keyset cursor                         | **0.43 ms** | 同 page1 形态，10 行即停                                   |
| 全量聚合 Q2（total + totalTime 下推） | **285 ms**  | Parallel Seq Scan + Partial Aggregate，**返回 1 行**       |

深翻页 **~2400×**（1038 ms → 0.43 ms），F16 三接口中收益最大（无用户过滤、纯时间排序）。
聚合下推对照：旧实现把 100 万行捞进 Node 内存 reduce；新实现 285 ms 单查询返回 1 行，
且 total_time 的 `left_at IS NULL` 计 now 分支留在 SQL（与旧 JS 语义等价，spec 钉死）。

### getVideoList（20 万录像 / 2 万房间，INNER JOIN 口径）

| 场景            | 执行时间   | 计划                                                       |
| --------------- | ---------- | ---------------------------------------------------------- |
| page1           | **148 ms** | HashAggregate 全量 2 万组 + top-N heapsort                 |
| 深 OFFSET 19990 | **132 ms** | 同形全量聚合                                               |
| keyset cursor   | **101 ms** | 同形；因 keyset 过滤 `createdAt` 范围少聚合约 25% 行而略快 |
| count 子查询    | **97 ms**  | HashAggregate 一层计数                                     |

**诚实结论**：GROUP BY 聚合列表的深翻页收益有限——聚合必须全量完成，OFFSET/keyset 都
排在聚合之后，差距只来自 keyset 缩小聚合输入。该接口的 F16 收益主要来自 count/min
下推 SQL（旧实现全量捞内存按房间 reduce）而非 keyset。`idx_video_recordings_room_created`
在全表等值场景被 seq scan 替代属优化器正确选择，选择性 `roomId` 查询时才体现价值。

### 索引命中（步骤 9）

`idx_live_participants_user_joined` / `idx_user_watch_times_created` 被上述计划直接引用；
`idx_user_watch_times_room_created`、`idx_video_recordings_room_created` 在按 roomId
选择性条件路径命中（各 8 次）；`idx_live_rooms_teacher_created` 在本演练数据分布下未被
引用（优化器对 2 万行表选 seq scan），留作 `live_user_id` 过滤路径保险。

## 造数踩坑（已修入脚本）

`live_participants` 有 `UNIQUE(userId, roomId)`：朴素 `g % 8000` × `g % 20000` 组合在
LCM=40000 处必然撞唯一键。改为 student-0 重用户 2 万房各一次（供深翻页场景）+
其余用户每人 15 房，(userId, roomId) 全程唯一。
