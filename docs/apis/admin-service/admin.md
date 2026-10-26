# admin-service 接口（gRPC）

服务：`apps/admin/admin-service`，端口 **50056**（`GRPC_PORT`），协议包 `admin.proto`（`package admin`），服务名 `AdminService`。
指标：`/metrics` 监听 **9467**（`METRICS_PORT`）。数据面：直连共享库（`DATABASE_URL`），TypeORM 实体仅 `Admin` / `User`，`synchronize: false`（DDL 只走 `db/migrations/`）。

内部服务仅供 Gateway 通过 gRPC 调用，不对外暴露 HTTP。管理后台的 HTTP 面见 [../server/admin.md](../server/admin.md)。

## 通用说明

- 所有 RPC 为 unary（请求-响应）。
- 成功响应为 `{ code: "0", msg: "success", ... }`；失败抛 `RpcException`，由 Gateway `grpcCall` 映射为 HTTP 状态码（401/403/404/409/400/500/502）。
- **身份 metadata**（S10b，两套 key 互不相通）：
  - `user-id` / `user-ts` / `user-sig`：签名域 `HMAC-SHA256("{userId}:{ts}")`，5 分钟防重放窗。**admin-service 的写 RPC 用这一套**（Gateway 把管理员 id 写进 `user-id`），`actorFrom()` 缺失即 `UNAUTHENTICATED`。
  - `admin-id` / `admin-ts` / `admin-sig`：签名域 `HMAC-SHA256("admin:{adminId}:{ts}")`，仅用于 Gateway → live-service 的管理端删除（房主校验旁路），admin-service 不消费。
- 未配置 `GRPC_SHARED_SECRET` 时跳过验签（本地开发）；未携带身份 metadata 的调用按 `absent` 放行，因此**写 RPC 自身仍做 fail-closed 断言**。
- **密码**：`admins.password_hash` 为 `scrypt:$131072-8-1$<salt-hex>$<hash-hex>`（`node:crypto`，salt 16B，key 64B）。与 `users.password_hash` 的 bcrypt 格式互不识别，防交叉登录。管理员密码不经 RSA 加密链路（与用户登录不同，Gateway 原样透传明文，仅限内网 gRPC）。
- **零外键**：`admins` 与 `users` 无任何外键关系，`users.banned_by` 只存管理员 id 字符串。
- 分页：`page` 从 1 开始；列表 `page_size` 钳制在 1–100（审计日志 1–200）。

## 消息结构

### AdminData

| 字段          | 类型   | 说明                     |
| ------------- | ------ | ------------------------ |
| id            | string | 管理员 ID（uuid）        |
| username      | string | 登录名（唯一）           |
| email         | string | 邮箱，可为空             |
| role          | int32  | 1=超管，2=运营           |
| status        | string | `active` / `disabled`    |
| last_login_at | string | ISO8601，未登录过为 null |
| created_at    | string | ISO8601                  |

### UserData

| 字段       | 类型   | 说明                                |
| ---------- | ------ | ----------------------------------- |
| id         | string | 用户 ID（uuid）                     |
| username   | string | 用户名                              |
| email      | string | 邮箱                                |
| role       | int32  | 1=老师，2=学生                      |
| status     | string | 派生值：`banned_at` 非空即 `banned` |
| banned_at  | string | ISO8601，未封禁为 null              |
| banned_by  | string | 封禁操作者（admin id），零外键      |
| created_at | string | ISO8601                             |

### CommonResponse

`{ code: "0", msg: "success" }`，写操作不带数据。

## RPC 列表

### 1. AdminLogin

| 字段     | 类型   | 必填 | 说明             |
| -------- | ------ | ---- | ---------------- |
| username | string | 是   | 管理员登录名     |
| password | string | 是   | 明文密码（内网） |

校验 scrypt 哈希 + `status === 'active'`；成功写 `last_login_at`，返回 `access_token: ""`、`expires_in: 0`，管理员信息放 `data`（`AdminData`）。
**JWT 由 Gateway 签发**（`aud: 'admin'`，7 天），admin-service 不持有 `JWT_SECRET`。
失败：账号/密码错误 → `UNAUTHENTICATED`；`status=disabled` → `FAILED_PRECONDITION`（Gateway 映射 412）。

### 2. GetAdmin

| 字段     | 类型   | 必填 | 说明      |
| -------- | ------ | ---- | --------- |
| admin_id | string | 是   | 管理员 ID |

不存在 → `NOT_FOUND`。

### 3. ListAdmins

| 字段      | 类型   | 必填 | 说明                          |
| --------- | ------ | ---- | ----------------------------- |
| page      | int32  | 否   | 默认 1                        |
| page_size | int32  | 否   | 默认 20，钳制 1–100           |
| keyword   | string | 否   | 模糊匹配 `username` / `email` |

返回 `total` + `items: AdminData[]`。

### 4. CreateAdmin

| 字段     | 类型   | 必填 | 说明                           |
| -------- | ------ | ---- | ------------------------------ |
| username | string | 是   | 唯一，冲突 → `ALREADY_EXISTS`  |
| email    | string | 否   | 空串表示不填                   |
| password | string | 是   | 明文，服务端 scrypt 后落库     |
| role     | int32  | 否   | 1/2，非法 → `INVALID_ARGUMENT` |

需要 `user-id` 验签 metadata（`actorFrom`）。返回新建的 `AdminData`。

### 5. UpdateAdminRole

| 字段     | 类型   | 必填 | 说明       |
| -------- | ------ | ---- | ---------- |
| admin_id | string | 是   | 目标管理员 |
| role     | int32  | 是   | 1/2        |

需要验签 metadata；目标不存在 → `NOT_FOUND`；role 非法 → `INVALID_ARGUMENT`。

### 6. SetAdminStatus

| 字段     | 类型   | 必填 | 说明                  |
| -------- | ------ | ---- | --------------------- |
| admin_id | string | 是   | 目标管理员            |
| status   | string | 是   | `active` / `disabled` |

需要验签 metadata。停用后该管理员再登录 → `FAILED_PRECONDITION`；已签发的 JWT 不主动吊销（7 天自然过期，端点侧按 `status` 校验）。

### 7. ListUsers

| 字段      | 类型   | 必填 | 说明                                  |
| --------- | ------ | ---- | ------------------------------------- |
| page      | int32  | 否   | 默认 1                                |
| page_size | int32  | 否   | 默认 20，钳制 1–100                   |
| keyword   | string | 否   | 模糊匹配 `username` / `email`         |
| role      | int32  | 否   | 1=老师 / 2=学生；`-1` 或 0 = 全部     |
| status    | string | 否   | `active` / `banned`；空或 `-1` = 全部 |

返回 `total` + `items: UserData[]`。

### 8. GetUser

| 字段    | 类型   | 必填 | 说明    |
| ------- | ------ | ---- | ------- |
| user_id | string | 是   | 用户 ID |

不存在 → `NOT_FOUND`。

### 9. BanUser

| 字段    | 类型   | 必填 | 说明                                    |
| ------- | ------ | ---- | --------------------------------------- |
| user_id | string | 是   | 目标用户                                |
| reason  | string | 否   | 仅用于审计 detail，admin-service 不落库 |

需要验签 metadata：`banned_at = now()`、`banned_by = actor`，`AND banned_at IS NULL`（重复封禁幂等，不改首次时间）。
**封禁三语义**：① 禁登录（auth-service Login 前查 `banned_at`）② 踢在线会话（Gateway 端点侧 `SessionService.revokeAllSessions`，不在本 RPC 内）③ 进行中直播不中断。

### 10. UnbanUser

| 字段    | 类型   | 必填 | 说明     |
| ------- | ------ | ---- | -------- |
| user_id | string | 是   | 目标用户 |

需要验签 metadata：清空 `banned_at` / `banned_by`。

### 11. SetUserRole

| 字段    | 类型   | 必填 | 说明            |
| ------- | ------ | ---- | --------------- |
| user_id | string | 是   | 目标用户        |
| role    | int32  | 是   | 1=老师 / 2=学生 |

需要验签 metadata；role 非法 → `INVALID_ARGUMENT`；用户不存在 → `NOT_FOUND`。

### 12. ListLiveRooms

全局只读直播间列表（管理面读模型，跨房主）。

| 字段          | 类型   | 必填 | 说明                                 |
| ------------- | ------ | ---- | ------------------------------------ |
| page          | int32  | 否   | 默认 1                               |
| page_size     | int32  | 否   | 默认 20，钳制 1–100                  |
| keyword       | string | 否   | 模糊匹配房间标题 / 主讲人用户名      |
| status        | int32  | 否   | `0` = 全部；其余精确匹配             |
| type          | int32  | 否   | `-1` = 全部                          |
| start_time_ms | string | 否   | 房间开始时间下界（毫秒时间戳字符串） |
| end_time_ms   | string | 否   | 房间开始时间上界                     |

约束：`"deletedAt" IS NULL`（软删房间不出现）；`LEFT JOIN users ON u.id::text = r."liveUserId"`（uuid ↔ varchar 必须显式 cast）；排序 `"createdAt" DESC, "roomId" DESC`。

### 13. GetLiveRoom

| 字段    | 类型   | 必填 | 说明    |
| ------- | ------ | ---- | ------- |
| room_id | string | 是   | 房间 ID |

软删房间 → `NOT_FOUND`。

### 14. ListRecordings

| 字段      | 类型   | 必填 | 说明                               |
| --------- | ------ | ---- | ---------------------------------- |
| page      | int32  | 否   | 默认 1                             |
| page_size | int32  | 否   | 默认 20，钳制 1–100                |
| keyword   | string | 否   | 模糊匹配文件名 / 房间标题 / 主讲人 |
| room_id   | string | 否   | 精确过滤                           |

只返回未软删房间下的录像（`LEFT JOIN live_rooms` + `"deletedAt" IS NULL`）。

### 15. ListCoursewares

| 字段      | 类型   | 必填 | 说明                      |
| --------- | ------ | ---- | ------------------------- |
| page      | int32  | 否   | 默认 1                    |
| page_size | int32  | 否   | 默认 20，钳制 1–100       |
| keyword   | string | 否   | 模糊匹配文件名 / 房间标题 |
| room_id   | string | 否   | 精确过滤                  |

同上：只含未软删房间的课件。

### 16. GetDashboardStats

无请求字段。返回 `data: DashboardStatsData`（8 项 `int64`）：

| 字段              | 口径                                               |
| ----------------- | -------------------------------------------------- |
| total_users       | `COUNT(*) FROM users`                              |
| today_new_users   | `created_at >= date_trunc('day', now())`           |
| banned_users      | `banned_at IS NOT NULL`                            |
| total_live_rooms  | `"deletedAt" IS NULL`                              |
| active_live_rooms | 未软删且 `status = 2`（直播中）                    |
| total_records     | `COUNT(*) FROM video_recordings`                   |
| total_coursewares | `COUNT(*) FROM coursewares`                        |
| today_new_rooms   | 未软删且 `"createdAt" >= date_trunc('day', now())` |

"今日" 以数据库本地时区为准（单条 SQL，8 个子查询一次往返）。

### 17. ListAuditLogs

| 字段      | 类型   | 必填 | 说明                                  |
| --------- | ------ | ---- | ------------------------------------- |
| page      | int32  | 否   | 默认 1                                |
| page_size | int32  | 否   | 默认 50，钳制 1–200                   |
| action    | string | 否   | 精确匹配，如 `live.delete`；空 = 全部 |
| actor     | string | 否   | 模糊匹配                              |
| from_ms   | string | 否   | 时间窗下界（毫秒）；空 = `to - 7d`    |
| to_ms     | string | 否   | 时间窗上界（毫秒）；空 = now          |

硬约束（`docs/research/index-inventory.md`）：`audit_logs` **不建二级索引**，查询一律带时间窗（缺省近 7 天），排序固定 `ORDER BY id DESC`（走复合 PK 前缀 = 写入序），**禁止**按 `occurred_at` 排序。`detail` 为 JSON 字符串，Gateway 侧 `JSON.parse` 后下发。

## 示例（Gateway 调用）

```ts
// 登录：管理员信息在 data 里，token 由网关签发
const result = await grpcCall(this.adminService.adminLogin({ username, password }));
const admin = result.data; // AdminData

// 写操作：必须带验签 metadata（管理员 id 写入 user-id）
await grpcCall(
  this.adminService.banUser({ user_id: userId, reason }, userIdMetadata(req.user.adminId))
);
```
