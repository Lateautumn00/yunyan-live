# admin-service 服务说明

服务：`apps/admin/admin-service`，单进程 HTTP（NestJS + Express），监听 **3100**（`ADMIN_PORT`）。
端点清单见 [http.md](http.md)；指标 `/metrics` 同时挂在 3100 与 **9467**（`METRICS_PORT`，Prometheus 抓取口）。
数据面：直连共享库（`DATABASE_URL`），TypeORM 实体仅 `Admin` / `User`，`synchronize: false`（DDL 只走 `db/migrations/`）。

> 批次 7 起不再使用 gRPC：`admin.proto`、50056 监听、`GRPC_*` 环境变量、网关 `ADMIN_GRPC` 客户端与 `/admin/*` 路由均已移除。

## 运行

```bash
# 依赖基础设施（PostgreSQL / Redis / RabbitMQ）
docker compose -f init/docker-compose.yml up -d

# 启动服务（.env 从 .env.example 复制）
pnpm dev:admin-service
```

管理后台 Web 另起 `pnpm dev:admin`（vite，8848），其 `/api/*` 代理到本服务 3100。

## 环境变量

| 变量              | 默认                    | 说明                                       |
| ----------------- | ----------------------- | ------------------------------------------ |
| `ADMIN_PORT`      | `3100`                  | HTTP 监听端口                              |
| `DATABASE_URL`    | —                       | 共享库连接串                               |
| `JWT_SECRET`      | —                       | admin JWT 签名密钥（audience=admin）       |
| `JWT_EXPIRES_IN`  | `7d`                    | 令牌有效期                                 |
| `REDIS_HOST/PORT` | `127.0.0.1:6379`        | 封禁踢会话（`session:kick`）               |
| `RABBITMQ_URL`    | —                       | 审计事件管线；留空则审计事件丢弃并告警     |
| `JANUS_URL`       | `http://127.0.0.1:8088` | 删除直播间时销毁 Janus 房间（best-effort） |
| `CORS_ORIGINS`    | `http://localhost:8848` | 允许的浏览器来源                           |
| `METRICS_PORT`    | `9467`                  | 独立指标端口                               |

## 数据模型

### AdminData

| 字段        | 类型   | 说明                     |
| ----------- | ------ | ------------------------ |
| id          | string | 管理员 ID（uuid）        |
| username    | string | 登录名（唯一）           |
| email       | string | 邮箱，可为空             |
| role        | int32  | 1=超管，2=运营           |
| status      | string | `active` / `disabled`    |
| lastLoginAt | string | ISO8601，未登录过为 null |
| createdAt   | string | ISO8601                  |

### UserData

| 字段      | 类型   | 说明                               |
| --------- | ------ | ---------------------------------- |
| id        | string | 用户 ID（uuid）                    |
| username  | string | 用户名                             |
| email     | string | 邮箱                               |
| role      | int32  | 1=老师，2=学生                     |
| status    | string | 派生值：`bannedAt` 非空即 `banned` |
| bannedAt  | string | ISO8601，未封禁为 null             |
| bannedBy  | string | 封禁操作者（admin id），零外键     |
| createdAt | string | ISO8601                            |

## 关键约束

- **密码**：`admins.password_hash` 为 `scrypt:$131072-8-1$<salt-hex>$<hash-hex>`（`node:crypto`，salt 16B，key 64B）。与 `users.password_hash` 的 bcrypt 格式互不识别，防交叉登录。管理员密码不经 RSA 加密链路（内网直连，控制器原样接收明文）。
- **零外键**：`admins` 与 `users` 无任何外键关系，`users.banned_by` 只存管理员 id 字符串。
- **分页**：`page` 从 1 开始；列表 `pageSize` 钳制在 1–100（审计日志 1–200）。
- **登录限流**：进程内滑动窗口 5 次/60s（多实例不共享；如需全局限流再迁到 Redis）。
- **删除语义**：直播间软删（`live_rooms."deletedAt"`，先 best-effort 销毁 Janus 房间）；录像/课件物理删除，未命中返回 404。
- **SQL 注意**：`live_rooms` / `video_recordings` / `coursewares` 为 camelCase 引号列（`db/schema-baseline.sql:240-269,305-318,212-224`），`users` 为 snake_case；`u.id::text = r."liveUserId"` 需显式 cast。
- **审计**：动作常量见 `packages/nest-shared/src/audit/constants.ts`（点号命名，如 `admin.ban_user`），经 `AuditModule` 发 MQ；保留策略见 `docs/research/data-retention-policy.md`。
- **审计查询**：`audit_logs` 不建二级索引，查询强制带时间窗（默认近 7 天），排序固定 `ORDER BY id DESC`。

## 目录结构

```
src/
  main.ts                     # HTTP 引导：3100 + /metrics + 9467
  app.module.ts               # AdminHttpModule
  http/
    admin-http.module.ts      # TypeORM / Redis / Audit / Passport / JWT 装配
    admin-http.controller.ts  # 20 个端点
    login-throttle.guard.ts   # 登录限流（内存）
    janus.client.ts           # 删除房间时销毁 Janus room
  admin/                      # AdminService（账号、登录、封禁/角色）
  users-admin/                # 用户读模型
  live-admin/                 # 直播间 / 录像 / 课件读模型 + 删除
  dashboard/                  # 看板聚合
  audit-admin/                # 审计日志查询
  admins/                     # admins 表仓储（scrypt）
```
