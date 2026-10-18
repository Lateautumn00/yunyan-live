# O5 监控最小集 —— 指标命名与告警基线（批次 3 启动）

> GAP-O5 / GAP-O7 关联文档。**本文档是指标命名的单一事实源**：后续批次（O5 收尾、O7 结构化日志）不得另起命名口径；O7 接入时按 §4 字段约定对齐，避免二次返工。

## 1. 范围与阶段

| 阶段                 | 批次 | 交付                                                                                                                            |
| -------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------- |
| 启动（本文档落库时） | 3    | 基线命名 + 4 服务 `/metrics` 接入 + prometheus/alertmanager/node-exporter 进 compose + 首批 8 条告警规则 + promtool/amtool 校验 |
| 收尾                 | 5    | 告警演练触发一次记录 + dashboard 可用验收 + 按需外发渠道（邮件/webhook）                                                        |

- 覆盖服务：`server`(gateway)、`auth-service`、`live-service`、`chat-ws-service`。
  yjs-ws-service / mail-service 不在本批范围（台账「4 后端服务」口径）。
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

| 指标                             | 类型    | labels                | 上报方                     | 用途                                                                      |
| -------------------------------- | ------- | --------------------- | -------------------------- | ------------------------------------------------------------------------- |
| `yunyan_http_requests_total`     | Counter | method, route, status | server                     | HTTP 5xx 告警、QPS dashboard                                              |
| `yunyan_grpc_requests_total`     | Counter | rpc, code             | auth-service, live-service | gRPC 错误告警                                                             |
| `yunyan_chat_online_connections` | Gauge   | —                     | chat-ws-service            | ws 在线数告警（scrape 时实时求和 `rooms`）                                |
| `yunyan_chat_queue_depth`        | Gauge   | queue                 | chat-ws-service            | 队列/DLQ 深度告警（depth monitor 30s 采样写入，复用 §4.8 轮询零新增查询） |
| `process_*` / `nodejs_*`         | 默认集  | —                     | 全部 4 服务                | `collectDefaultMetrics`（CPU/内存/句柄/启动时间）                         |

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
| chat-ws-service `/metrics` | 0.0.0.0:50054/metrics  | 挂 Koa 自有 HTTP，与 `/healthz` 同层             |
| prometheus                 | 127.0.0.1:9090         | 含 `--web.enable-lifecycle`（规则热加载）        |
| alertmanager               | 127.0.0.1:9093         | 首批 receiver 空集成（见 alertmanager.yml 注释） |
| node-exporter              | 127.0.0.1:9100         | 挂 `/` 只读，磁盘指标数据源                      |

compose 容器经 `host.docker.internal`（`host-gateway`）回访宿主机上的开发服务；
宿主机服务未启动时 `up==0` 会被 `ServiceDown` 告警 —— 本地语境下属正确语义（服务确实没在跑）。

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
| DiskSpaceLow        | avail/size < 10%       | 10m | warning  | node-exporter                  |

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

## 8. 验收锚点

- 批次 3（启动）：三份配置 promtool/amtool 全绿；`/targets` 中 4 个业务服务 target 可 up（服务启动时）；
  告警规则在 `/alerts` 可见；本文件命名规范有单测防回归。
- 批次 5（收尾）：告警演练触发一次留痕（改阈值/灌数据择一，恢复后复验 resolve）+ dashboard 可用验收。
