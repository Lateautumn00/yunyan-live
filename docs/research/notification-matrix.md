# 通知邮件触发矩阵（F9）

状态：**✅ 2026-10-19 落地**（批次 4b）｜签批：**S11③ 收信策略已签批**（见 §5）｜台账：GAP-F9
实现：`packages/nest-shared/src/notify/`（拓扑/发布端）+ `apps/mail-service/src/mail/`（模板/去重频控/消费端）+ 三个触发点（下表）

## 1. 触发点矩阵

| #   | kind（模板）      | 发布方（触发点）                                                   | 触发时机                                           | 收件人（范围）                                                                          | scope（场次去重键）       | payload                              |
| --- | ----------------- | ------------------------------------------------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------ |
| 1   | `class_reminder`  | live-service `ReminderService.tick`（每 15s 巡检）                 | `startTime ∈ [now, now+10min)`、status=1（未开播） | 教师（`liveUserId`）+ 曾入房学生（`live_participants`），**email 非空**，去重后逐收件人 | `roomId:<startTime 毫秒>` | `title`, `startTime`(ISO)            |
| 2   | `recording_ready` | server `LiveController.transcodeRecording`（try 内 ffmpeg 完成后） | 录制 mp4 转码就绪（失败分支不发）                  | 教师（**操作者 JWT 邮箱**，无邮箱跳过）                                                 | `rec-<录制 id>`           | `recordingId`, `roomId`              |
| 3   | `checkin_ended`   | server `CheckinController.end`（gRPC 结束成功后）                  | 签到结束                                           | 教师（**操作者 JWT 邮箱**）                                                             | `<签到 sessionId>`        | `roomId`, `sessionId`, `signedCount` |

- 收件人邮箱来源：JWT payload 自带 `email`（`AuthUser.email`，触发点零 DB 查询）；开课提醒走两条 raw SQL。
- 学生入房记录为空/无邮箱 → 该用户不收（`users.email` NOT NULL unique，空串=未填）。
- 打点 fire-and-forget：`publish` 不阻塞、不回滚业务（转码/签到结束照常返回）。

## 2. 报文 / 去重 / 重试

- 报文：`{eventId(uuid), occurredAtMs, kind, to, scope, dedupeKey, payload}`；exchange `mail.notify`（direct，durable）。
- **`dedupeKey = kind:scope:to`**（归一化时计算）= 每收件人 × 每场次 × 每模板 7 天一次。
- 消费端（`MailService.notify`）顺序：
  1. `GET notify_dedupe:{dedupeKey}` 命中 → skip（不占频控）
  2. `INCR notify_daily:{to}:{YYYY-MM-DD}` > 5（`NOTIFY_DAILY_LIMIT`）→ skip（按投递尝试计）
  3. `SET notify_dedupe:{dedupeKey} NX EX 604800`（并发兜底）
  4. SMTP 发送；**失败回滚 dedupe 键**后抛出（保证重试能真正发出）
- 队列阶梯（与 S12 审计同口径）：`mail.notify.work` → 失败 `x-retry+1` → `retry1`(TTL 5s)/`retry2`(30s)/`retry3`(120s) → 回 work；**`x-retry ≥ 3` → `mail.notify.dlq`**；损坏/校验失败报文直进 DLQ 不重试。

## 3. 降级路径（失败降级可观测）

| 故障                            | 行为                                                                | 可观测                                                                            |
| ------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `RABBITMQ_URL` 空               | 触发侧 publisher=disabled（恒丢弃，仅启动时告警一次）；消费端不启动 | 启动日志；无 `up` 序列                                                            |
| Redis down                      | 去重/频控 **fail-open**（放行发送，error 日志）                     | `notify_dedupe*/notify_daily* failed(fail-open)` 日志                             |
| SMTP down                       | 抛出 → 5s/30s/120s 重投 → DLQ（不无限重试）                         | `yunyan_notify_total{result=failed}` 递增；`yunyan_notify_queue_depth{queue=dlq}` |
| live-service 重启（内存去重丢） | 重发被消费端 7d NX 挡住（不重复发信）                               | `skipped_dedupe` 计数                                                             |
| 单用户单日超 5 封               | skip（当天该用户不再发）                                            | `yunyan_notify_total{result=skipped_rate}`                                        |

## 4. 指标与告警

- `yunyan_notify_total{kind,result}`：result ∈ `sent|skipped_dedupe|skipped_rate|failed`
- `yunyan_notify_queue_depth{queue=work|dlq}`：mail-service 30s 采样，dlq>0 即 error 日志
- mail-service metrics：`0.0.0.0:9466`（`METRICS_PORT`）；prometheus job `mail-service`
- 基线见 `docs/research/monitoring-baseline.md` §3/§5（已同步收录）

## 5. 签批记录（S11③ · 收信策略部分）

- **签批人**：用户（产品经理），2026-10-19 批次 4b 计划批准时拍板（推荐包通过）。
- **签批内容**：
  1. 仅**事务性通知**（开课提醒/录制完成/签到结束），不含任何营销邮件；
  2. 收件条件 = `users.email` 非空即发；**不做 `email_verified` 迁移**（schema 无该字段，验证态仅用于登录/注册流程）；
  3. 频控 = **≤5 封/天/用户** + **每场次每模板 7d 去重**（消费端 Redis 强制）；
  4. 开课提醒提前量 = 10 分钟（`NOTIFY_REMINDER_LEAD_MIN` 可调），对象 = 教师 + 曾入房学生有邮箱者；
  5. 现 schema 无年龄字段 → **不区分未成年人收信**（若后续引入年龄/监护人字段须复审本条）。
- **范围声明**：本签批仅覆盖 F9 收信策略；S11③ 中其余个保法事项（板书等场景的未成年人个人信息处理，`closure-checklist.md` §3）仍绑定 **S5 批次**，保持未勾选。
- **留痕**：本文件 + 台账 GAP-F9 / GAP-S11 行。

## 6. 配置速查

| 环境变量（服务）                                                 | 说明                                  |
| ---------------------------------------------------------------- | ------------------------------------- |
| `RABBITMQ_URL`（server/live/mail）                               | 空 → publisher 丢弃 / consumer 不启动 |
| `NOTIFY_REMINDER_LEAD_MIN`（live）                               | 开课提醒提前量，默认 10 分钟          |
| `METRICS_PORT`（mail）                                           | 默认 9466                             |
| `NOTIFY_DAILY_LIMIT` / `NOTIFY_DEDUPE_TTL_S`（nest-shared 常量） | 5 封/天、7d 去重                      |

相关用例：`packages/nest-shared/src/notify/notify.spec.ts`、`apps/mail-service/src/mail/{templates,mail.service,notify-consumer}.spec.ts`、`apps/server/src/live/{live.controller.download,checkin.controller}.spec.ts`（F9 段）、`apps/live-service/src/live/__tests__/reminder.spec.ts`。
