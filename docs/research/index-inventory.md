# 索引清单（Index Inventory，GAP-S9b）

状态：批次 5 完成（2026-10-19）。单一事实源 = `db/schema-baseline.sql`
（CI `Schema baseline gate` 以同款 `pg_dump --schema-only --no-owner --no-privileges
--exclude-table=schema_migrations` + `normalize-schema-dump.sh` 重放 diff 守护）；
幂等重放链 = `db/migrations/0001-0006`（现网登记 11 recorded / 0 pending）。

EXPLAIN 证据：`docs/research/drills/f16-pagination-explain.md`（0001 五索引）、
`docs/research/drills/s9b-index-explain.md`（0006 六索引 + 保留/孤儿演练）。

巡检命令（当前库全量索引）：

```sql
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' ORDER BY tablename, indexname;
```

## 每表清单（14 表；★ = 0006 新增）

| 表                  | 索引 / 唯一键（PK 除外）                                                                                                          | 服务的查询（代码锚点）                                              | 判定                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| live_participants   | `idx_live_participants_user_joined`(userId,joinedAt,id)；★`idx_live_participants_room_joined`(roomId,joinedAt)；UQ(userId,roomId) | F16 学生列表 keyset；★`getParticipants` 花名册（live.service:382）  | 覆盖（0006 补口）                                                   |
| live_rooms          | `IDX_board…`→ 见下；`idx_live_rooms_teacher_created`(liveUserId,createdAt)；UQ(joinCode)                                          | 教师房间列表；分享码 join；学生侧经 participants join（F16）        | 覆盖                                                                |
| user_watch_times    | `idx_user_watch_times_created`(created_at,id)；`idx_user_watch_times_room_created`(room_id,created_at)                            | F16 watchtime 列表/聚合；batchLeave 按房定位（live.service:371）    | 覆盖（台账原假设，0001 已闭环）                                     |
| video_recordings    | `idx_video_recordings_room_created`(roomId,createdAt)                                                                             | 录像列表/删除按房（F16 getVideoList）                               | 覆盖（同上）                                                        |
| chat_messages       | `idx_chat_messages_room_time`(room_id,created_at,id)；`uq_chat_messages_msg_id`；★`idx_chat_messages_created`(created_at)         | 历史翻页 keyset（history.ts）；★保留批删全局时间窗                  | 覆盖（0006 补口）                                                   |
| coursewares         | ★`idx_coursewares_room_created`(roomId,createdAt)                                                                                 | `listCoursewares`（live.service:645，教室打开即拉）                 | 覆盖（0006 新增）                                                   |
| live_transfer_codes | UQ(code)；★`idx_live_transfer_codes_room_user`(roomId,targetUserId)                                                               | 领取/校验按 code；★撤销 update（live.service:407）                  | 覆盖（0006 新增）                                                   |
| checkin_sessions    | `IDX_checkin_sessions_room_started`(roomId,startedAt)；★`idx_checkin_sessions_started`(startedAt)                                 | 轮次列表按房；★保留窗全局驱动                                       | 覆盖（0006 新增）                                                   |
| checkin_records     | UQ(sessionId,userId)                                                                                                              | 计数/名单/结果按 sessionId（leading 命中）；保留经 session 级联     | 覆盖                                                                |
| chat_moderation     | `idx_chat_moderation_room_user_active`(partial)；`uq_chat_moderation_active`(partial)                                             | F3 禁言/踢出活跃判定                                                | 覆盖（0004）                                                        |
| board_snapshots     | `IDX_board_snapshots_room_created`(roomId,createdAt)                                                                              | 快照列表 cursor / 最新快照；滚动保留裁剪的 find（live.service:690） | 覆盖                                                                |
| board_tool_usage    | `idx_board_tool_usage_room_created`(roomId,createdAt)；★`idx_board_tool_usage_created`(createdAt)                                 | F12 按房按时间聚合；★保留批删全局时间窗                             | 覆盖（0006 新增）                                                   |
| audit_logs          | UQ(event_id)（+复合 PK (id,occurred_at) = 分区预留）                                                                              | 写入（批插 ON CONFLICT）；时间序回查走 PK                           | 无二级索引为**设计口径**（§1.5：>1 亿行前再补 (actor,occurred_at)） |
| users               | UQ(email)                                                                                                                         | 登录按 email、会话按 id                                             | 无二级索引可接受                                                    |

`live_rooms` 另有 `IDX_checkin…` 无关项不列；完整形态以上方巡检 SQL 为准。

## 0006 缺口核实过程（台账假设 vs 实况）

- 台账原文假设补 `user_watch_times`、`video_recordings` —— 两者已由 `0001_f16_list_indexes`
  闭环（见 f16 演练），**无需重复补**。
- 按实际查询路径核出 6 个真缺口（花名册/课件列表/转播码撤销/三表保留窗），全部落在
  `db/migrations/0006_s9b_hot_path_indexes.sql`，EXPLAIN 前后对照见 s9b 演练记录：
  热路径 ~8.7×/11.5×/34×；保留批删计划形态 Seq Scan → Bitmap Index Scan（批循环下总成本
  由"每批全表扫×批数"降为恒定索引定位）。
- 孤儿治理：11 表零外键（批次 5 拍板不做 FK），巡检 SQL `scripts/audit-orphans.sql` +
  runbook `docs/research/runbooks/orphan-audit.md`，自检证据（种3检3清零）入演练记录。
