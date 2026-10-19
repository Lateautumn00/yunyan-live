# mail-service 接口（gRPC + MQ）

服务：`apps/mail-service`，gRPC 端口 **50053**，协议包 `mail.proto`（`package mail`），服务名 `MailService`。同时消费 RabbitMQ 事件。

## gRPC

### 1. SendCode

`rpc SendCode (SendCodeRequest) returns (CommonResponse)`

发送邮箱验证码邮件（验证码存 Redis，默认有效期 5 分钟）。

**请求：**

| 字段  | 类型   | 说明     |
| ----- | ------ | -------- |
| email | string | 收件邮箱 |

**响应 CommonResponse：** `code ("0" 成功), msg`。

### 2. VerifyCode

`rpc VerifyCode (VerifyCodeRequest) returns (VerifyCodeResponse)`

校验邮箱验证码（注册 / 重置密码时由 auth-service 调用）。

**请求：**

| 字段  | 类型   | 说明   |
| ----- | ------ | ------ |
| email | string | 邮箱   |
| code  | string | 验证码 |

**响应 VerifyCodeResponse：**

| 字段  | 类型   | 说明                             |
| ----- | ------ | -------------------------------- |
| code  | string | `"0"`=验证通过，`"1"`=无效或过期 |
| msg   | string | 提示信息                         |
| valid | bool   | 是否有效                         |

## MQ 事件（F9 通知邮件，exchange=`mail.notify`）

mail-service 是 **notify 消费端**（RabbitMQ 消费者，非 gRPC）：消费 `mail.notify` exchange 下
`mail.notify.work` 队列的三类系统通知，投递出口为 `MailService.notify()`（去重 + 频控 + SMTP）。
拓扑/重试阶梯/DLQ 与审计队列同口径（`packages/nest-shared/src/notify/`）。

| kind              | 触发点（发布方）                                       | 收件人             | 负载 payload                         |
| ----------------- | ------------------------------------------------------ | ------------------ | ------------------------------------ |
| `class_reminder`  | live-service `ReminderService`（开课前 10 分钟巡检）   | 教师 + 曾入房学生  | `title`, `startTime`(ISO)            |
| `recording_ready` | server `LiveController.transcodeRecording`（mp4 就绪） | 教师（操作者邮箱） | `recordingId`, `roomId`              |
| `checkin_ended`   | server `CheckinController.end`（签到结束）             | 教师（操作者邮箱） | `roomId`, `sessionId`, `signedCount` |

- 报文：`{eventId, occurredAtMs, kind, to, scope, dedupeKey, payload}`；
  **`dedupeKey = kind:scope:to`**，消费端 Redis `SET NX EX 7d` 去重（每收件人每场次每模板一次）。
- 重试：SMTP 失败 → 5s/30s/120s 阶梯重投，`x-retry ≥ 3` 进 `mail.notify.dlq`；损坏报文直进 DLQ。
- 频控：单用户单日 ≤5 次投递尝试（`NOTIFY_DAILY_LIMIT`，超限 skip 不重试）。
- `RABBITMQ_URL` 留空 → 消费端不启动，触发侧 publisher 恒丢弃并告警（应用照常起）。

## 相关环境变量

- `REDIS_HOST` / `REDIS_PORT`：验证码存储 + 通知去重/频控
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`：邮件发送
- `GRPC_PORT`：默认 50053
- `RABBITMQ_URL`：F9 通知消费端（留空则不启动）
- `METRICS_PORT`：默认 9466（`/metrics`）
