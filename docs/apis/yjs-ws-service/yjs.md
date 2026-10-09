# yjs-ws-service 接口（WebSocket）

服务：`apps/yjs-ws-service`，端口 **50055**（默认，由 `YJS_WS_PORT` 控制）。基于 Koa + `ws` + `yjs`。用于白板实时协同，协议为 Yjs 的二进制编码（`y-protocols/sync` + `y-protocols/awareness`），消息为二进制而非 JSON。

## 连接

```
ws://<host>:50055?token=<JWT>&roomId=<docName>
```

| 查询参数 | 必填 | 说明                                               |
| -------- | ---- | -------------------------------------------------- |
| token    | 是   | JWT，用 `JWT_SECRET` 校验，无效则断开（code 4402） |
| roomId   | 否   | Yjs 文档名（docName），默认 `default`              |

连接建立时会校验 JWT 中的会话 `sid`（Redis `session:<guid>`）：不匹配 → `close 4401`，会话过期/不存在 → `close 4402`，Redis 故障时放行（fail-open）。

> **关闭码落在 4400–4499 区间是刻意设计**：y-websocket 的 `defaultShouldReconnect` 对该区间的关闭码停止重连并发出 `closed` 事件，客户端据此区分「被踢/过期」与可重试的网络错误。

`connection.binaryType = 'arraybuffer'`。

连接建立后服务端按顺序发送：

1. 同步第 1 步（sync step 1，含文档状态 `stateVector`）
2. 当前 awareness 状态（若房间有在线成员）
3. 同步第 2 步（sync step 2，含完整文档内容 `diff`）

## 二进制消息协议

每个消息帧为二进制编码，首个 varuint 为消息类型：

| 消息类型值 | 常量             | 方向 | 说明                                     |
| ---------- | ---------------- | ---- | ---------------------------------------- |
| 0          | messageSync      | 双向 | Yjs 文档同步（`y-protocols/sync`）       |
| 1          | messageAwareness | 双向 | 光标/在线状态（`y-protocols/awareness`） |

### messageSync (0)

编码：`writeVarUint(0) + syncProtocol 载荷`。服务端处理 `syncProtocol.readSyncMessage` 后回写需要的同步增量；文档 `update` 事件触发时向其它连接广播同步消息。

### messageAwareness (1)

编码：`writeVarUint(1) + writeVarUint8Array(awarenessUpdate)`。服务端应用后向其它连接广播相同负载。

> 消息载荷均为 y-protocols 标准二进制格式。客户端集成应使用 `y-protocols/sync`、`y-protocols/awareness`、`lib0/encoding`、`lib0/decoding` 编解码。

## 状态

- 文档按 `roomId` 在服务端内存中缓存（`Map<string, Y.Doc>`）。房间创建/首次写入时从 board_snapshot 服务拉取最新快照恢复（`LIVE_GRPC_URL` 为空则禁用恢复）；快照拉取失败仍可进房（fail-open），但该房间禁止写入快照，避免空文档覆盖历史。
- 空房（`conns.size === 0`）在宽限期（`SNAPSHOT_EMPTY_GRACE_MS`，默认 60s）后：**先把脏文档写入快照，成功后销毁内存文档**；写入失败则保留内存并按 `SNAPSHOT_FAIL_RETRY_MS` 退避重试。
- 定时（`SNAPSHOT_INTERVAL_MS`，默认 5min）与进程退出（SIGTERM）也会把脏文档写入快照。
- 断开连接时移除该连接的 awareness 状态；空房宽限期内重连会取消销毁。

## 断开

- `close 4401`：**单端登录踢出**（服务端订阅 `session:kick` 频道后主动断开）
- `close 4402`：token 缺失/无效，或会话过期
- `close 1001`：服务端关闭

## 相关环境变量

| 变量                    | 说明                                                        |
| ----------------------- | ----------------------------------------------------------- |
| YJS_WS_PORT             | 端口，默认 50055                                            |
| JWT_SECRET              | JWT 密钥，**必填**（未设置时服务拒绝启动）                  |
| REDIS_HOST              | Redis 地址，用于会话校验与踢出，默认 127.0.0.1              |
| REDIS_PORT              | Redis 端口，默认 6379                                       |
| LIVE_GRPC_URL           | board_snapshot 所在 live-service 的 gRPC 地址；置空禁用快照 |
| SNAPSHOT_INTERVAL_MS    | 定时快照间隔，默认 300000（下限 1000）                      |
| SNAPSHOT_EMPTY_GRACE_MS | 空房销毁前宽限期，默认 60000                                |
| SNAPSHOT_FAIL_RETRY_MS  | 快照写入失败的退避重试间隔，默认 10000                      |
