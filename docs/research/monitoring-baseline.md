# O5 监控最小集 —— 指标命名与告警基线（批次 3 启动）

> GAP-O5 / GAP-O7 关联文档。**本文档是指标命名的单一事实源**：后续批次（O5 收尾、O7 结构化日志）不得另起命名口径；O7 接入时按 §4 字段约定对齐，避免二次返工。

## 1. 范围与阶段

| 阶段                 | 批次 | 交付                                                                                                                            |
| -------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------- |
| 启动（本文档落库时） | 3    | 基线命名 + 4 服务 `/metrics` 接入 + prometheus/alertmanager/node-exporter 进 compose + 首批 8 条告警规则 + promtool/amtool 校验 |
| 收尾                 | 5    | 告警演练触发→恢复双向留痕 + dashboard/UI 可用验收；外发渠道**本批拍板不做**（翻案条件见 §10）                                   |

- 覆盖服务：`server`(gateway)、`auth-service`、`live-service`、`chat-ws-service`（批次 3）
  - `mail-service`（批次 4b F9 通知指标）。yjs-ws-service 不在范围（无独立业务告警口径）。
- dashboard = Prometheus 内置 UI（`http://127.0.0.1:9090` 的 Graph/Alerts/Targets）；
  Grafana 不在本批范围，如需再议。

## 2. 指标命名规范（硬约定）

1. 指标名统一 `yunyan_` 前缀；**服务名不进指标名**，只做 label。
2. 单位后缀：计数 `_total`、秒 `_seconds`、字节 `_bytes`；gauge 带单位词（`_connections` / `_depth`）。
3. registry 级默认 label `service`（`registry.setDefaultLabels`）= 服务短名，
   值域固定：`server` | `auth-service` | `live-service` | `chat-ws-service`
   —— 与 prometheus `job_name` 同值（见 `init/monitoring/prometheus.yml`）。
4. **禁高基数 label**：`user_id` / `room_id` / `trace_id` 等个体级标识一律不得作 label
   （房间维度数据走 SQL 聚合接口 GAP-F1，不进指标系统）。
5. label 值封闭：`method`（HTTP 动词）、`route`（路由模板，未命中 `unmatched`）、
   `status`（HTTP 状态码字符串）、`rpc`（gRPC 方法短名）、
   `code`（grpc 状态名 `OK`/`DEADLINE_EXCEEDED`/…）、`queue`（`work`|`dlq`）。
6. `/metrics` 自身请求不计入 HTTP 计数（防自激）。

## 3. 指标清单

| 指标                             | 类型    | labels                | 上报方                                    | 用途                                                                            |
| -------------------------------- | ------- | --------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| `yunyan_http_requests_total`     | Counter | method, route, status | server                                    | HTTP 5xx 告警、QPS dashboard                                                    |
| `yunyan_grpc_requests_total`     | Counter | rpc, code             | auth-service, live-service                | gRPC 错误告警                                                                   |
| `yunyan_chat_online_connections` | Gauge   | —                     | chat-ws-service                           | ws 在线数告警（scrape 时实时求和 `rooms`）                                      |
| `yunyan_chat_queue_depth`        | Gauge   | queue                 | chat-ws-service                           | 队列/DLQ 深度告警（depth monitor 30s 采样写入，复用 §4.8 轮询零新增查询）       |
| `yunyan_audit_queue_depth`       | Gauge   | queue                 | live-service                              | S12 审计队列/DLQ 深度（consumer 30s 采样；dlq>0 即 error 日志）                 |
| `yunyan_notify_total`            | Counter | kind, result          | mail-service                              | F9 通知结果（sent/skipped_dedupe/skipped_rate/failed；failed 持续 → SMTP 故障） |
| `yunyan_notify_queue_depth`      | Gauge   | queue                 | mail-service                              | F9 通知队列/DLQ 深度（consumer 30s 采样；dlq>0 即 error 日志）                  |
| `process_*` / `nodejs_*`         | 默认集  | —                     | 全部服务（server/auth/live/chat-ws/mail） | `collectDefaultMetrics`（CPU/内存/句柄/启动时间）                               |

**实现位置**：共享模块 `packages/nest-shared/src/metrics.ts`
（`createServiceMetrics` / `httpMetricsMiddleware` / `metricsRequestHandler` / `startMetricsServer` / `GrpcMetricsInterceptor` / `grpcCodeName`），
可执行断言在 `packages/nest-shared/src/metrics.spec.ts`（指标名与值域的单测=基线防回归）。

## 4. 与 O7（结构化日志/tracing）的桥接约定

O7 延后但触发后不得改指标名，因此现在锁定：

- 指标 `service` label 值域 = 未来日志 `service` 字段值域（同一张表，见 §2.3）。
- O7 结构化日志最小字段：`timestamp`、`level`、`service`、`msg`、`trace_id`、`request_id`、
  `event`（可选）。其中 `trace_id`/`request_id` **只进日志、不进指标 label**（高基数）。
- 排障路径约定：告警（含 labels）→ 按 `service`+时间窗查结构化日志 → `trace_id` 串联单请求。
- O7 触发条件不变：O5 告警无上下文不可排障时启动（台账 GAP-O7）。

## 5. 端口与抓取拓扑

| 组件                       | 地址                   | 说明                                             |
| -------------------------- | ---------------------- | ------------------------------------------------ |
| server `/metrics`          | 127.0.0.1:3001/metrics | 挂 gateway 自有 HTTP                             |
| auth-service metrics       | 0.0.0.0:9464/metrics   | gRPC 服务无 HTTP，独立轻量端口（`METRICS_PORT`） |
| live-service metrics       | 0.0.0.0:9465/metrics   | 同上（`METRICS_PORT`）                           |
| mail-service metrics       | 0.0.0.0:9466/metrics   | 同上（`METRICS_PORT`，F9 通知队列/结果指标）     |
| chat-ws-service `/metrics` | 0.0.0.0:50054/metrics  | 挂 Koa 自有 HTTP，与 `/healthz` 同层             |
| prometheus                 | 127.0.0.1:9090         | 含 `--web.enable-lifecycle`（规则热加载）        |
| alertmanager               | 127.0.0.1:9093         | 首批 receiver 空集成（见 alertmanager.yml 注释） |
| node-exporter              | 127.0.0.1:9100         | 挂 `/` 只读，磁盘指标数据源                      |

**O3 容器化后（批次 5 对齐）**：5 个业务 target 改用 compose 网络服务名
（`gateway:3001` / `auth-service:9464` / `live-service:9465` / `mail-service:9466` / `chat-ws-service:50054`），
与业务服务同栈拉起时 7/7 active target 全 up（§9.1）。
宿主机 `pnpm dev` 单跑（不走 compose）时这些 target 不可达 → `up==0` → `ServiceDown`：
语义正确但属 dev 单跑预期噪声，dev 场景以 `/targets` 可达性为准。

## 6. 首批告警（8 条，`init/monitoring/alerts.yml`）

| 告警                | 阈值                   | for | severity | 口径来源                       |
| ------------------- | ---------------------- | --- | -------- | ------------------------------ |
| ChatQueueBacklog    | work > 10000           | 5m  | warning  | 对齐 monitor.ts `WORK_WARNING` |
| ChatDlqNonEmpty     | dlq > 0                | 2m  | critical | 对齐 §4.8 DLQ 线               |
| ChatWsNoConnections | online == 0            | 10m | warning  | 空房夜间为已知误报语境         |
| Http5xxBurst        | 5xx increase[5m] > 5   | 1m  | critical | 绝对量口径（低流量比率会误报） |
| GrpcErrorBurst      | 非 OK increase[5m] > 5 | 1m  | critical | 同上                           |
| ServiceDown         | up == 0                | 2m  | critical | 含容器死亡窗口                 |
| ServiceFlapping     | changes(up[15m]) > 0   | 0   | warning  | 容器重启痕迹                   |
| DiskSpaceLow        | avail/size < 10%       | 10m | warning  | 排除不可操作卷（§9.2）         |

## 7. 校验与操作

```bash
# 静态校验（CI/本地均可，无守护进程）
docker run --rm --entrypoint promtool -v $PWD/init/monitoring/alerts.yml:/etc/prometheus/alerts.yml:ro \
  prom/prometheus:v2.53.0 check rules /etc/prometheus/alerts.yml
docker run --rm --entrypoint promtool -v $PWD/init/monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro \
  -v $PWD/init/monitoring/alerts.yml:/etc/prometheus/alerts.yml:ro \
  prom/prometheus:v2.53.0 check config /etc/prometheus/prometheus.yml
docker run --rm --entrypoint amtool -v $PWD/init/monitoring/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro \
  prom/alertmanager:v0.27.0 check-config /etc/alertmanager/alertmanager.yml

# 起监控栈（与既有 infra 同文件）
docker compose -f init/docker-compose.yml up -d prometheus alertmanager node-exporter

# 规则改后热加载（不用重启）
curl -X POST http://127.0.0.1:9090/-/reload
```

> **单文件 bind 注意**：`init/monitoring/*.yml` 是容器单文件 bind mount，rename 式原子写
> （部分编辑工具的保存方式）会断挂载 → 容器内文件 ENOENT → `/-/reload` 报
> `couldn't load configuration ... no such file or directory`。两种安全改法：
>
> 1. truncate 写保 inode：`cat 新内容 > 文件`（或 `>>` 追加）后再 `/-/reload`；
> 2. 改完 `docker restart yunyan-live-prometheus`（重挂 + 冷加载）。

## 8. 验收锚点

- 批次 3（启动）：三份配置 promtool/amtool 全绿；`/targets` 中 4 个业务服务 target 可 up（服务启动时）；
  告警规则在 `/alerts` 可见；本文件命名规范有单测防回归。
- 批次 5（收尾）：触发→resolve 双向留痕（prom + alertmanager 双侧）+ dashboard/UI 可用验收
  —— **全部达成，证据见 §9**；外发渠道拍板不做（§10）。

## 9. 批次 5 收尾验收记录（2026-10-19）

### 9.1 拓扑修复（O3 容器化后的 ServiceDown）

- 背景：O3 业务服务容器化后仅发布 127.0.0.1，prometheus 旧 target（`host.docker.internal`）
  5 个业务 job 全 down → 4×ServiceDown 自 2026-10-18 持续 firing
  （activeAt：`2026-10-18T10:15:51Z` ×2、`2026-10-19T00:15:06Z` ×2，修复前已采）。
- 修复：prometheus.yml 5 target 改 compose 服务 DNS（§5）；单文件 bind 被编辑工具断挂载 →
  `docker restart yunyan-live-prometheus` 重挂（见 §7 注意）。
- 复验：7/7 active target `health=up`（gateway/auth/live/mail/chat/node/prometheus）；
  ServiceDown 经 5m 陈旧窗口后自然归零（约 09:05，无手动干预），
  `ALERTS{alertname="ServiceDown"}` 空。

### 9.2 DiskSpaceLow 口径修复（10 → 0）

- 修复前持续 firing 10 条（自 2026-10-18T09:43）：8×`/snap/*`（`fstype=fuse.snapfuse`，
  只读 squashfs 镜像，avail 恒 0）+ 2×`/usr/lib/linux-tools*|/usr/src/linux-headers*`
  （WSL 内核工具链目录，系统托管）—— 均为不可操作卷，非真实可清理盘压。
- 修复：DiskSpaceLow expr 追加排除 `fuse.snapfuse` fstype 与上述 mountpoint（alerts.yml 注释留档）。
- 复验：promtool 8 rules OK → 热加载 → `ALERTS{alertname="DiskSpaceLow"}` 0 条；
  真实盘压仍由根文件系统挂载覆盖（口径未削弱）。

### 9.3 告警演练（触发 → 恢复，prom + AM 双侧留痕）

- 方法：临时规则 `O5DrillAlwaysFiring`（`expr: vector(1) > 0`、`for: 0s`）经 shell
  truncate/append（保 bind inode，禁 rename 写）+ `/-/reload` 注入；采证后同法回滚，
  `diff` 与基线 IDENTICAL、文件 0 残留。
- 成功轮次时间线（UTC，第 3 次注入）：
  - 触发：reload `09:18:49` → `09:19:09` prom `ALERTS{...}` firing=1 **且 AM `/api/v2/alerts`
    可见**；AM 可见性 t+20s…t+120s 连续 11 采样全 =1（锚点：AM API 可见 firing ✓）。
  - 恢复：回滚 reload `09:21:19` → prom 30s 内 firing=0；AM 侧 endsAt 自然过期：
    `09:23:34` 仍在 → `09:24:34` 已移除（resolve 传播 ≤3m15s ≤ resolve_timeout 5m，属设计）。
  - 历史可查性：`ALERTS{alertname="O5DrillAlwaysFiring"} at T_FIRED=1792401216` → `value=[…,"1"]`；
    `at T_RESOLVED=1792401261` → 空集。
- 前两轮教训（复盘）：`prometheus_notifications_dropped_total` 时间线精确落在两轮 reload
  过渡窗（09:09:20、09:13:00、09:13:40，共 6 drops）——notifier 随 reload 重建 AM target 时
  在途批次被丢；转换事件一次性，窗口内 AM 收不到且不再补发。稳定态该计数零增长，
  `errors_total=0`、无 error 日志。
  **演练 SOP：reload 后等 ≥2 个 flush 周期（30s）再采 AM 侧证据，连续两窗确认稳定。**
- 终态 `/alerts`：5×`ChatWsNoConnections`——`yunyan_chat_online_connections` 由 5 个 job
  各报一条（全服务同注册该 gauge），空房=0 属 §6 已知误报语境，非本批新问题。

### 9.4 UI/dashboard 验收

- 页面：`/` →302→`/graph`；`/graph`、`/alerts`、`/targets`、`/rules`、`/config`、`/status`
  均 200；健康端点 `/-/healthy`、`/-/ready`、`/api/v1/status/buildinfo` 均 200。
  （`/-/status/flags` 实测 404，v2.53 非关键端点，以 buildinfo 为准。）

### 9.5 演练产物状态

- `init/monitoring/alerts.yml` diff 仅含 DiskSpaceLow 口径修复（临时规则 0 残留）；
  `init/monitoring/prometheus.yml` diff 仅含 5 target 拓扑对齐。
- 采证日志在 WSL `/tmp/o5-*.log`（本机留存不入库，关键数值已固化于本节）。

## 10. 外发渠道（邮件/webhook）—— 本批拍板不做

- 批次 5 拍板：不做。**翻案条件：出现无人值守告警需求**（如生产部署、夜间无人看护的
  长稳跑测），需要告警离开本机时启用。
- 启用路径：alertmanager.yml `receivers` 接邮件（mail-service 已有 SMTP 出口，见 F9）
  或 webhook；接入后 amtool check + 按 §9.3 SOP 做一次端到端留痕。
- 现状 receiver 空集成 = 合法（演练口径 = AM API/UI 可见 firing，alertmanager.yml 注释同步）。
