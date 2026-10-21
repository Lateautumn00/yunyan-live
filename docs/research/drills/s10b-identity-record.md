# gRPC 身份可信演练记录（GAP-S10b 交付物）

规则：**无演练 = 假防线**。compose 网络布局或 gRPC 拦截器变更后必须复跑
`bash scripts/drill-s10b-identity.sh`（全 PASS 退出码 0）。记录逐次追加，只增不删。

| 日期       | 结论                       | 上下文                                                                                                   |
| ---------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| 2026-10-20 | **PASS 18/18**（首次全绿） | WSL docker 环境；compose 项目 `init`；三网络 edge/backend/egress 全部成员就位；janus 8088 修复后首跑通过 |

## 首次演练上下文（2026-10-20）

- 前置修复（详见 `docs/research/grpc-identity-trust.md` §5）：
  1. **postgres/redis 端口冲突**：宿主 5432/6379 被 poetry 项目容器占用，yunyan 两库卡 `Created`。
     演练期间临时 `docker stop poetry-rag-pg poetry-redis-master`，起 yunyan 两库并
     `--force-recreate` 使其正确挂载 edge+backend 双网络。
  2. **janus 8088**：entrypoint 从不生成 `janus.transport.http.jcfg`（既有缺陷，录制控制
     `JANUS_URL=http://janus-gateway:8088` 链路一直是断的）。补生成 + `ip="0.0.0.0"`
     （该 fork 的 `interface` 键只收网卡名，`interface="0.0.0.0"` 必 bind 失败）。
  3. **STUN FATAL**：`stun.l.google.com` 被 GFW 阻断 → janus `[FATAL] Invalid STUN address`
     退出 → 8088 起停循环。STUN 改 `JANUS_STUN_SERVER` 可配、默认禁用（entrypoint 挂 volume
     免重编镜像）。
- 演练矩阵全绿：成员 3 项（backend 含 auth / edge 不含 auth / egress 含 mail）、隔离矩阵
  14 项（含 `chat-ws→postgres:5432 ok`（edge 共享）、`live→janus:8088 ok`（edge+backend）、
  宿主不可达未发布 50051）、伪造 metadata 5 用例（bare-user-id/wrong-secret/stale-ts →
  code=16 UNAUTHENTICATED；valid-signature/no-user-id → code=13 放行）。
- 宿主端口冲突（已解决 2026-10-20）：poetry 与 yunyan 曾争抢 5432/6379（WSL 重启后
  败者 `Created`）。拍板后 yunyan compose 改发布 **15432/16379**，两项目可共存，
  复跑演练不再需要临时停 poetry。（**2026-10-21 回退**：确认无冲突后恢复标准口
  **5432/6379**，revert `9510543`。）
