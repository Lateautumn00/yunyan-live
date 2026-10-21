# gRPC 身份可信（GAP-S10b）设计与交付记录

状态：**✅ 2026-10-20 完成**。台账见 `system-gap-analysis.md` GAP-S10b 行；
演练证据见 `drills/s10b-identity-record.md`（18/18 ALL PASS）。
后续项 S4 域层下沉**已于 2026-10-21 完成**（commit `6e9e418`，见台账 GAP-S4 行）。

## 1. 背景与范围裁定

原案「mTLS 全量」被 CTO 裁定为过度工程。收敛范围：

- **共享密钥 HMAC 签名 metadata**（服务间 gRPC 调用携带 `user-id` 时强制验签）
- **compose 网络边界**（edge / backend / egress 三网络，`backend` 为 `internal: true`）
- 完成后 S4 的归属校验可从「网关补偿控制」下沉为域层 synchronous authority（~~后续独立批次~~ **✅ 2026-10-21 完成**）

## 2. 签名协议

携带 `user-id` 的 gRPC 调用自动附带（`packages/nest-shared/src/grpc/metadata.ts`）：

| metadata key | 内容                                         |
| ------------ | -------------------------------------------- |
| `user-id`    | 用户 UUID                                    |
| `user-ts`    | `Date.now()` 毫秒字符串                      |
| `user-sig`   | `HMAC-SHA256(secret, "${userId}:${ts}")` hex |

- **时间窗 ±5 分钟**（`USER_SIG_MAX_AGE_MS`）防重放
- 比较用 `timingSafeEqual`，**先比长度**再比内容（防 length 泄露）
- secret 读 `GRPC_SHARED_SECRET`；**未配置时保持裸 `user-id`**（本地开发零变化），
  服务端相应返回 `no-secret` 放行

`verifyUserCall()` 六态（纯函数，便于单测）：

| 结果            | 语义                         | Guard 判定           |
| --------------- | ---------------------------- | -------------------- |
| `absent`        | 未携带 `user-id`（系统调用） | 放行                 |
| `no-secret`     | 服务端未配置密钥（本地开发） | 放行                 |
| `ok`            | 验签通过                     | 放行                 |
| `missing`       | 有 user-id 但缺 ts/sig       | 拒绝 UNAUTHENTICATED |
| `stale`         | 时间戳超窗                   | 拒绝 UNAUTHENTICATED |
| `bad-signature` | HMAC 不匹配                  | 拒绝 UNAUTHENTICATED |

**决策 ①**：有 `user-id` 才验签——无 `user-id` 视为系统调用（服务间内部 RPC）。

## 3. 拦截器（有意偏差：Interceptor 非 Guard）

`GrpcAuthGuard`（`auth-guard.ts`）实现为 **NestInterceptor 而非 Guard**：

- Guard 先于拦截器执行，拒绝会被注册在外层的 `GrpcMetricsInterceptor` 漏计
- Interceptor 才能计入 `yunyan_grpc_requests_total{code:"UNAUTHENTICATED"}`
- 注册顺序（auth/live/mail 三 main.ts 相同）：
  ```ts
  app.useGlobalInterceptors(new GrpcMetricsInterceptor(metrics), new GrpcAuthGuard());
  ```

metadata 提取 duck-type 防御：`.get` 直接用 → `.metadata` 回退 → 否则按 `absent` 放行
（兼容一元/流式/异常三种 context 布局）。

**副发现**（仅记文档）：NestJS `getRpcMethodName` 不存在，`GrpcMetricsInterceptor` 的
rpc label 生产环境恒为 `"unknown"`——与 S10b 无关，留待 metrics 专项。

## 4. 交叉校验（决策 ②）

`CheckRoomAccess`（live.controller.ts:534）除验签外，**body `user_id` 与 metadata
`user-id` 交叉校验**：签名身份为准，body 不一致 → `PERMISSION_DENIED`。
yjs-ws `access.ts` 的 `checkRoomAccess` 调用已改用 `userIdMetadata(userId)` 内签。

## 5. compose 三网络边界（决策 ③④⑤）

```
edge     宿主端口发布 + 出网（chat-ws/gateway/yjs-ws/janus/alertmanager/node-exporter/postgres/redis/rabbitmq/prometheus）
backend  internal: true（auth/live/mail/gateway/yjs-ws/janus/postgres/redis/rabbitmq/prometheus）——无外网出口
egress   仅 mail-service（SMTP 出网专用，业务容器不可达 mail:50053）
```

- 5 个 gRPC 服务 + gateway 强制 `${GRPC_SHARED_SECRET:?}`（compose 校验缺 secret 直接报错）
- `init/.env.example` 补 `GRPC_SHARED_SECRET`；`ci.yml:139` 补同名 secret
- 隔离目标：edge-only 容器（chat-ws/alertmanager/node-exporter）不可达
  `auth-service:50051` / `live-service:50052` / `mail-service:50053`

## 6. 演练期间顺带修复的既有缺陷

1. **janus 8088 HTTP API 从未监听**：`entrypoint.sh` 只生成 websockets jcfg。
   live-service `JANUS_URL=http://janus-gateway:8088`（录制控制）链路此前一直是断的。
   补生成 `janus.transport.http.jcfg`，注意该 gitee fork 的 `interface` 键只收**网卡名**，
   IP 要用 `ip` 键（`interface="0.0.0.0"` 必 bind 失败）。
2. **STUN FATAL 退出**：`stun.l.google.com` 被 GFW 阻断 → janus `[FATAL] Invalid STUN
address` 退出 → 8088 起停循环。STUN 改 `JANUS_STUN_SERVER` 可配、**默认禁用**
   （entrypoint 空值时不写 `stun_server` 行）；entrypoint.sh 挂 volume 进容器，免重编镜像。
3. **宿主端口冲突**（已解决 2026-10-20）：poetry 项目与 yunyan 争抢 5432/6379。
   **拍板：yunyan compose 改发布 15432/16379**（容器网络内仍为 `postgres:5432` /
   `redis:6379`，业务配置零改动）；`.env.example` 模板与 README 端口表同步。
   **2026-10-21 回退**：确认无冲突后拍板恢复标准口 **5432/6379**（revert `9510543`）。

## 7. 测试与验证

- 单测：`metadata-sign.spec.ts`（10 例）+ `auth-guard.spec.ts`（8 例）
- e2e：`auth-guard.e2e.spec.ts`（5 例，真实 gRPC server 端口 50651）
- live.controller spec：CheckRoomAccess 交叉校验 3 例（含缺身份/不一致）
- 演练：`scripts/drill-s10b-identity.sh` 18/18（成员 3 + 隔离矩阵 14 + 伪造 5）
- 全仓：build 15/15、test 22/22、typecheck 23/23、lint 11/11、format:check 全绿
