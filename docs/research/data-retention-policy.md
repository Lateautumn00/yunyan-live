# 数据保留策略（Data Retention Policy）

状态：**S12（审计表）章节已定稿**；S9b 三表（chat-messages / checkin / board_tool_usage）章节批次 5 合流补齐。
台账：`docs/research/system-gap-analysis.md` GAP-S12 / GAP-S9b。

---

## 1. audit_logs（S12，2026-10-18 起生效）

### 1.1 表形态与分区预留（DoD 复核点）

- `BIGINT GENERATED ALWAYS AS IDENTITY` + `occurred_at TIMESTAMPTZ DEFAULT now()`
- **PK = `(id, occurred_at)` 复合** —— 即未来 `PARTITION BY RANGE (occurred_at)` 所需分区键形态：
  转分区表不重建主键。
- `event_id uuid UNIQUE` —— 消费端批插幂等锚点；**转分区时需改含分区键**
  （`UNIQUE (event_id, occurred_at)`）。消费 SQL 使用**无目标 `ON CONFLICT DO NOTHING`**，
  冲突目标变更不影响写入语义（迁移 `db/migrations/0003_audit_logs.sql` 注释同口径）。
- 追加即不可变：行级触发器 `trg_audit_logs_immutable` RAISE 禁 UPDATE/DELETE。
  **TRUNCATE 不触发行级触发器**（测试清场唯一允许的批量清除）。
- 现阶段为普通表；转分区与热 90 天 `DROP PARTITION` 运维步骤归 S9b 保留期批次执行。
  在转分区之前，**没有任何自动删除路径**（触发器禁 DELETE 是有意为之：审计不可篡改优先）。

### 1.2 事件通道

| 环节     | 口径                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------ |
| 生产者   | gateway（唯一能拿到 `req.user`/`ip`/`request-id` 的层）→ nest-shared `createAuditPublisher`            |
| 通道     | exchange `audit.persist`（direct, durable），rk `audit.work`；与 chat 的 `chat.persist` **隔离故障域** |
| 报文     | `{eventId, occurredAtMs, actor, action, targetType, targetId, requestId, ip, detail}`                  |
| 消费者   | live-service `createAuditConsumer`：攒批 100 条/200ms → `INSERT … ON CONFLICT DO NOTHING`              |
| 失败分流 | 瞬时（非 22/23xxx）→ retry 阶梯 5s/30s/120s → ≥3 次入 `audit.persist.dlq`；毒行直进 DLQ                |
| 降级     | `RABBITMQ_URL` 缺省 → publisher 恒丢弃计数（单次告警）、consumer 不启动；**打点永不阻断业务响应**      |
| 指标     | `yunyan_audit_queue_depth{queue=work                                                                   | dlq}`（live-service 30s 采样，dlq>0 打 error 日志） |

### 1.3 action 枚举与记录点（S12 DoD：登录/踢人/改密/删除/导出）

| action                 | 触发点（gateway）                                             | actor              | detail（白名单收口）                                |
| ---------------------- | ------------------------------------------------------------- | ------------------ | --------------------------------------------------- |
| `auth.login.ok`        | POST user/user/login 上游认证成功                             | guid               | —                                                   |
| `auth.login.failed`    | login 上游 gRPC 拒绝（捕获后重抛，不吞）                      | email              | `reason=rejected`, `status`（HTTP 码）              |
| `session.kick`         | login 时旧会话被顶下线（`createSession` 回传 oldSid 非空）    | guid               | `reason=replaced_by_login`（sid 不落库）            |
| `user.reset_password`  | POST resetPassword 成功后                                     | guid（缺省 email） | `sessionsRevoked`                                   |
| `user.change_password` | POST changePassword 成功后                                    | userId             | `sessionsRevoked=true`                              |
| `live.delete`          | DELETE deleteLive 成功后                                      | userId             | —（target=room）                                    |
| `video.delete_rooms`   | DELETE deleteVideo 按房间删，**逐房一条**                     | userId             | —（target=room）                                    |
| `video.delete_ids`     | DELETE deleteVideoByIds 按视频删，**逐 id 一条**              | userId             | —（target=video）                                   |
| `courseware.delete`    | DELETE deleteCourseware 成功后                                | userId             | —（target=courseware）                              |
| `recording.export`     | downloadRecording `download=true` 且 mp4 就绪、**流式输出前** | userId             | `roomId`, `bytes`（转码轮询 `download=false` 不记） |

- **降级留痕（拍板）**：板书导出（F6.1 `exportBoard`）是纯客户端导出，无服务端端点，
  **不可审计**——经拍板不为打点新增端点，该记录点以此文档降级说明收口。
- `request_id` 取中间件 `requestIdMiddleware`（入站 `x-request-id` 截断 64，否则生成 uuid，响应回写同名头）。
  **O7 桥接**：`trace_id`/`request_id` 只进日志不进指标 label。

### 1.4 detail 脱敏（白名单漏斗，唯一入口 `sanitizeAuditDetail`）

1. 调用侧可传 `allowedKeys` 只留顶层指定键；**publisher 入口强制过漏斗**（防绕过）。
2. 任意深度剥离敏感键（比较前剥非字母数字并小写）：token/access_token/refresh_token/
   password/passwd/pwd/old|new_password/secret/authorization/cookie/captcha/verifycode/
   smscode/otp/sid/oldsid/sessionid/invitecode/code。
3. 深度 >8 分支丢弃；detail 序列化 >4096 字符 → `{_truncated:true}`（宁截断不丢事件）。
4. 列宽在 publisher 侧截断对齐（actor/action 100、target_type 50、target_id 100、request_id 64、ip 45），
   防 22xxx 超长毒行。

### 1.5 保留与销毁

| 阶段            | 策略                                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 现在 → 转分区前 | 永久追加（append-only）；无自动删除；TRUNCATE 仅测试/演练环境                                                                                  |
| S9b 保留期批次  | 转 `PARTITION BY RANGE (occurred_at)` 按月/按季分区；**热 90 天 DROP PARTITION**（绕过行触发器，合法销毁路径）；冷归档导出至对象存储后再弃分区 |
| 审计回查        | 时间序走 PK `(id DESC, occurred_at DESC)`；按 actor/action 过滤依赖时间序扫描（当前量级可接受，>1 亿行前补 `(actor, occurred_at)` 复合索引）   |

---

## 2. S9b 三表保留章节（批次 5 合流，占位）

- chat_messages：2000 万行滚动保留 + 分区化（`docs/research/runbooks/chat-messages-partitioning.md`）
- checkin_*：签到批次数据保留期
- board_tool_usage：工具使用明细保留期（F12/F3 触发条件聚合的上游）
