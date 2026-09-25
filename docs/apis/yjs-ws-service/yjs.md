# yjs-ws-service 接口（WebSocket）

服务：`apps/yjs-ws-service`，端口 **50055**（默认，由 `YJS_WS_PORT` 控制）。基于 Koa + `ws` + `yjs`。用于白板实时协同，协议为 Yjs 的二进制编码（`y-protocols/sync` + `y-protocols/awareness`），消息为二进制而非 JSON。

## 连接

```
ws://<host>:50055?token=<JWT>&roomId=<docName>
```

| 查询参数 | 必填 | 说明                                               |
| -------- | ---- | -------------------------------------------------- |
| token    | 是   | JWT，用 `JWT_SECRET` 校验，无效则断开（code 4001） |
| roomId   | 否   | Yjs 文档名（docName），默认 `default`              |

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

- 文档按 `roomId` 在服务端内存中缓存（`Map<string, Y.Doc>`），无人连接时（`conns.size === 0`）销毁。
- 断开连接时移除该连接的 awareness 状态。

## 相关环境变量

| 变量        | 说明                                       |
| ----------- | ------------------------------------------ |
| YJS_WS_PORT | 端口，默认 50055                           |
| JWT_SECRET  | JWT 密钥，**必填**（未设置时服务拒绝启动） |
