# 管理后台 HTTP 接口（admin-service）

服务：`apps/admin/admin-service`，控制器 `src/http/admin-http.controller.ts`，路由前缀 `/admin`，共 **20** 个端点。
监听 **3100**（`ADMIN_PORT`），指标 `/metrics` 同时挂在 3100 与 **9467**（`METRICS_PORT`，Prometheus 抓取口）。
数据面直连共享库（`DATABASE_URL`），TypeORM 实体仅 `Admin` / `User`，`synchronize: false`（DDL 只走 `db/migrations/`）。

> 批次 7 之后管理后台不再经网关：原 `apps/server` 的 `/admin/*` 路由与 `ADMIN_GRPC` 客户端、admin-service 的 gRPC 面（50056）已移除。
> 管理后台 Web（`apps/admin/web`）的 `/api/admin/*` 由 vite（开发）或 nginx（生产）剥掉 `/api` 前缀后直连本服务。

## Base URL

```
http://<host>:3100
```

## 鉴权与权限

- **管理端 JWT 独立**：`AdminJwtStrategy` 校验 `aud === 'admin'`，与用户 `JwtStrategy` 物理隔离；用户 token 调 `/admin/*` 一律 401，反之亦然。
- 令牌由 `POST /admin/login` **在本服务签发**，有效期 **7 天**（无 refresh 流程），载荷 `{ sub: adminId, username, role, aud: 'admin' }`。
- RBAC：`role` **1 = 超管**，**2 = 运营**。读端点（列表/详情/看板/审计）`@AdminRoles(1, 2)`；写端点（管理员管理、封禁/解封、改角色、删除）`@AdminRoles(1)`。越权 → 403。
- `POST /admin/login` 免鉴权，限流 **5 次 / 60s**（进程内滑动窗口，多实例不共享），超限 429。
- CORS 允许来源：环境变量 `CORS_ORIGINS`（缺省 `http://localhost:8848`）。

## 响应约定

- 所有响应经 `ResponseInterceptor` 统一包裹为 `{ code: 1000, msg: 'success', data: <下方「data」> }`。
- 错误由 `HttpExceptionFilter` 转为非 2xx：`{ code: <HTTP>, msg: '...' }`。
- 错误映射：`NOT_FOUND→404`、`UNAUTHENTICATED→401`、`PERMISSION_DENIED→403`、`ALREADY_EXISTS→409`、`INVALID_ARGUMENT→400`、`INTERNAL→500`、`UNAVAILABLE→503`；登录停用账号 `FAILED_PRECONDITION→403`（控制器内显式转换）。
- 前端 `apps/admin/web/src/utils/http` 在响应拦截器里统一解包，视图直接消费 `data`。

## 端点总览

| #   | 方法   | 路径                            | RBAC | 说明               |
| --- | ------ | ------------------------------- | ---- | ------------------ |
| 1   | POST   | `/admin/login`                  | 公开 | 管理员登录         |
| 2   | GET    | `/admin/me`                     | 1,2  | 当前管理员信息     |
| 3   | GET    | `/admin/admins`                 | 1    | 管理员列表         |
| 4   | POST   | `/admin/admins`                 | 1    | 新建管理员         |
| 5   | POST   | `/admin/admins/:id/role`        | 1    | 修改管理员角色     |
| 6   | POST   | `/admin/admins/:id/status`      | 1    | 启用/停用管理员    |
| 7   | GET    | `/admin/users`                  | 1,2  | 用户列表           |
| 8   | GET    | `/admin/users/:id`              | 1,2  | 用户详情           |
| 9   | POST   | `/admin/users/:id/ban`          | 1    | 封禁用户           |
| 10  | POST   | `/admin/users/:id/unban`        | 1    | 解封用户           |
| 11  | POST   | `/admin/users/:id/role`         | 1    | 修改用户角色       |
| 12  | GET    | `/admin/live/rooms`             | 1,2  | 全局直播间列表     |
| 13  | GET    | `/admin/live/rooms/:roomId`     | 1,2  | 直播间详情         |
| 14  | DELETE | `/admin/live/rooms/:roomId`     | 1    | 删除直播间（软删） |
| 15  | GET    | `/admin/live/recordings`        | 1,2  | 录像列表           |
| 16  | POST   | `/admin/live/recordings/delete` | 1    | 批量删除录像       |
| 17  | GET    | `/admin/live/coursewares`       | 1,2  | 课件列表           |
| 18  | DELETE | `/admin/live/coursewares/:id`   | 1    | 删除课件           |
| 19  | GET    | `/admin/dashboard/stats`        | 1,2  | 数据看板           |
| 20  | GET    | `/admin/audit/logs`             | 1,2  | 审计日志           |

---

## 1. 登录

`POST /admin/login`（免鉴权，5 次/60s）

| 字段     | 类型   | 必填 | 说明         |
| -------- | ------ | ---- | ------------ |
| username | string | 是   | 管理员登录名 |
| password | string | 是   | 明文密码     |

`data`：

```json
{
  "token": "<admin JWT，aud=admin，7d>",
  "expiresIn": 604800,
  "admin": {
    "id": "uuid",
    "username": "admin",
    "email": "ops@example.com",
    "role": 1,
    "status": "active"
  }
}
```

- 账号/密码错误 → 401；`status=disabled` → 403。
- 成功/失败均写审计：`admin.login.ok` / `admin.login.failed`（失败记录 `actor=提交的用户名`、`detail.reason='rejected'`）。

## 2. 当前管理员

`GET /admin/me`

`data`：`{ id, username, email, role, status, lastLoginAt }`。

## 3. 管理员列表

`GET /admin/admins`（仅超管）

| 查询参数 | 类型   | 默认 | 说明                      |
| -------- | ------ | ---- | ------------------------- |
| page     | number | 1    | 页码                      |
| pageSize | number | 20   | 每页条数（1–100）         |
| keyword  | string | ''   | 模糊匹配 username / email |

`data`：`{ total, items: [{ id, username, email, role, status, lastLoginAt, createdAt }] }`。

## 4. 新建管理员

`POST /admin/admins`（仅超管）

| 字段     | 类型   | 必填 | 说明                       |
| -------- | ------ | ---- | -------------------------- |
| username | string | 是   | 唯一，冲突 409             |
| email    | string | 否   | 缺省空串                   |
| password | string | 是   | 明文，服务端 scrypt 后落库 |
| role     | number | 否   | 1/2，缺省 2（运营）        |

`data`：新建的 `AdminItem`。审计 `admin.admin_create`。

## 5. 修改管理员角色

`POST /admin/admins/:id/role`（仅超管）

Body `{ "role": 1 | 2 }`。`data`：`{ code: "0", msg: "success" }`。审计 `admin.role_change`（`targetType=admin`）。

## 6. 启用/停用管理员

`POST /admin/admins/:id/status`（仅超管）

Body `{ "status": "active" | "disabled" }`。停用后该账号登录被拒（403）；已签发 token 不主动吊销。审计 `admin.status_change`。

## 7. 用户列表

`GET /admin/users`

| 查询参数 | 类型   | 默认 | 说明                      |
| -------- | ------ | ---- | ------------------------- |
| page     | number | 1    | 页码                      |
| pageSize | number | 20   | 每页条数（1–100）         |
| keyword  | string | ''   | 模糊匹配 username / email |
| role     | number | 全部 | 1=老师 / 2=学生           |
| status   | string | 全部 | `active` / `banned`       |

`data`：`{ total, items: [{ id, username, email, role, status, bannedAt, bannedBy, createdAt }] }`。
`status` 为派生值：`bannedAt` 非空即 `banned`。

## 8. 用户详情

`GET /admin/users/:id` → `data` 同上单条；不存在 404。

## 9. 封禁用户

`POST /admin/users/:id/ban`（仅超管）

Body `{ "reason"?: string }`（缺省 `admin.ban`，仅进审计 detail，不落库）。

行为三语义：

1. 写 `users.banned_at = now()`、`banned_by = <adminId>`（`AND banned_at IS NULL`，重复封禁幂等不改首次时间）；
2. 控制器同步调 `SessionService.revokeAllSessions(userId)`，经 Redis `session:kick` 踢掉在线 HTTP/WS 会话；
3. **不中断进行中的直播**（封禁只影响登录与新建房间）。

审计 `admin.ban_user`（`detail.reason`）。

## 10. 解封用户

`POST /admin/users/:id/unban`（仅超管）→ 清空 `banned_at` / `banned_by`。审计 `admin.unban_user`。

## 11. 修改用户角色

`POST /admin/users/:id/role`（仅超管）

Body `{ "role": 1 | 2 }`（1=老师 / 2=学生）。审计 `admin.role_change`（`targetType=user`）。

## 12. 全局直播间列表

`GET /admin/live/rooms`

| 查询参数  | 类型   | 默认 | 说明                                 |
| --------- | ------ | ---- | ------------------------------------ |
| page      | number | 1    | 页码                                 |
| pageSize  | number | 20   | 每页条数（1–100）                    |
| keyword   | string | ''   | 模糊匹配房间标题 / 主讲人用户名      |
| status    | number | 0    | `0` = 全部；其余精确匹配（2=直播中） |
| type      | number | -1   | `-1` = 全部                          |
| startTime | string | ''   | 开始时间下界（毫秒时间戳）           |
| endTime   | string | ''   | 开始时间上界（毫秒时间戳）           |

`data`：`{ total, items: [{ roomId, title, liveUserId, speakerName, joinCode, status, type, startTime, duration, liveNums, createdAt }] }`。
只含未软删房间；`speakerName` 来自 `users.username`（`u.id::text = r."liveUserId"`，uuid ↔ varchar 显式 cast）。

## 13. 直播间详情

`GET /admin/live/rooms/:roomId` → `data` 同上单条；软删或不存在 404。

## 14. 删除直播间

`DELETE /admin/live/rooms/:roomId`（仅超管）

本服务直接处理：先 best-effort 调 Janus `destroy`（`JANUS_URL`，失败仅告警不阻断），再 `UPDATE live_rooms SET "deletedAt" = now()`（`AND "deletedAt" IS NULL`），未命中 404。录像/课件不级联删除。`data`：`{}`。审计 `live.delete`（`detail.byAdmin=true`）。

## 15. 录像列表

`GET /admin/live/recordings`

| 查询参数 | 类型   | 默认 | 说明                               |
| -------- | ------ | ---- | ---------------------------------- |
| page     | number | 1    | 页码                               |
| pageSize | number | 20   | 每页条数（1–100）                  |
| keyword  | string | ''   | 模糊匹配文件名 / 房间标题 / 主讲人 |
| roomId   | string | ''   | 精确过滤                           |

`data`：`{ total, items: [{ id, roomId, roomTitle, fileName, filePath, fileSize, duration, recordType, teacherName, createdAt }] }`。

## 16. 批量删除录像

`POST /admin/live/recordings/delete`（仅超管）

| 字段 | 类型                | 必填 | 说明                                    |
| ---- | ------------------- | ---- | --------------------------------------- |
| by   | `'room' \| 'video'` | 是   | 按房间 id 删 / 按录像 id 删             |
| ids  | string[]            | 是   | 空数组直接返回 `{ deleted: 0 }`，不报错 |

`data`：`{ deleted: <实际删除行数> }`。审计：`by=video` → `video.delete_ids`；`by=room` → `video.delete_rooms`。

## 17. 课件列表

`GET /admin/live/coursewares`

| 查询参数 | 类型   | 默认 | 说明                      |
| -------- | ------ | ---- | ------------------------- |
| page     | number | 1    | 页码                      |
| pageSize | number | 20   | 每页条数（1–100）         |
| keyword  | string | ''   | 模糊匹配文件名 / 房间标题 |
| roomId   | string | ''   | 精确过滤                  |

`data`：`{ total, items: [{ id, roomId, roomTitle, filename, filext, filesize, fileurl, createUserId, createdAt }] }`。

## 18. 删除课件

`DELETE /admin/live/coursewares/:id`（仅超管）→ 物理删除，未命中 404。`data`：`{}`。审计 `courseware.delete`。

## 19. 数据看板

`GET /admin/dashboard/stats` → `data`：

| 字段             | 口径                                             |
| ---------------- | ------------------------------------------------ |
| totalUsers       | 用户总数                                         |
| todayNewUsers    | `created_at >= date_trunc('day', now())`         |
| bannedUsers      | `banned_at IS NOT NULL`                          |
| totalLiveRooms   | 未软删房间数                                     |
| activeLiveRooms  | 未软删且 `status = 2`（直播中）                  |
| totalRecords     | 录像总数                                         |
| totalCoursewares | 课件总数                                         |
| todayNewRooms    | 未软删且 `createdAt >= date_trunc('day', now())` |

"今日" 以数据库本地日为准。

## 20. 审计日志

`GET /admin/audit/logs`

| 查询参数 | 类型   | 默认 | 说明                             |
| -------- | ------ | ---- | -------------------------------- |
| page     | number | 1    | 页码                             |
| pageSize | number | 50   | 每页条数（1–200）                |
| action   | string | ''   | 精确匹配，如 `live.delete`       |
| actor    | string | ''   | 模糊匹配                         |
| from     | string | ''   | 时间窗下界（毫秒），缺省 `to-7d` |
| to       | string | ''   | 时间窗上界（毫秒），缺省 now     |

`data`：`{ total, items: [{ id, occurredAt, actor, action, targetType, targetId, requestId, ip, detail }] }`，`detail` 为解析后的 JSON（解析失败保留原字符串）。
`audit_logs` 不建二级索引，查询强制带时间窗（默认近 7 天），排序固定 `ORDER BY id DESC`。

## 审计动作映射

| 动作                                      | 触发端点                                                    |
| ----------------------------------------- | ----------------------------------------------------------- |
| `admin.login.ok` / `admin.login.failed`   | `POST /admin/login`                                         |
| `admin.admin_create`                      | `POST /admin/admins`                                        |
| `admin.role_change`                       | `POST /admin/admins/:id/role`、`POST /admin/users/:id/role` |
| `admin.status_change`                     | `POST /admin/admins/:id/status`                             |
| `admin.ban_user` / `admin.unban_user`     | `POST /admin/users/:id/ban`、`/unban`                       |
| `live.delete`                             | `DELETE /admin/live/rooms/:roomId`                          |
| `video.delete_ids` / `video.delete_rooms` | `POST /admin/live/recordings/delete`                        |
| `courseware.delete`                       | `DELETE /admin/live/coursewares/:id`                        |

动作枚举定义见 `packages/nest-shared/src/audit/constants.ts`，保留策略见 `docs/research/data-retention-policy.md`。
