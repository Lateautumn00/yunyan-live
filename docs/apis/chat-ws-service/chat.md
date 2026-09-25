# chat-ws-service 接口（WebSocket）

服务：`apps/chat-ws-service`，端口 **50054**（默认，由 `CHAT_WS_PORT` 控制）。基于 Koa + `ws`，无 HTTP 路由（`GET /` 返回 `{ status: "ok", service: "chat-ws" }`）。

## 连接

```
ws://<host>:50054?token=<JWT>&roomId=<roomId>&liveUserId=<userId>&nickName=<nickName>
```

| 查询参数   | 必填 | 说明                                               |
| ---------- | ---- | -------------------------------------------------- |
| token      | 是   | JWT，用 `JWT_SECRET` 校验，无效则断开（code 4001） |
| roomId     | 否   | 房间 ID，默认 `default`                            |
| liveUserId | 否   | 用户 ID，默认 `anonymous`                          |
| nickName   | 否   | 昵称                                               |

连接建立后服务端主动推送两条消息：

1. `{ "type": "pong" }`
2. `{ "type": "msg", "data": { "liveMsg": { "liveNums": <房间在线人数>, "forbid": 0 } } }`

## 消息协议

客户端与服务端交互均为 JSON 文本帧。字段：`type`（string）+ `data`（object，可选）。

### 1. ping / pong（心跳）

- 客户端发：`{ "type": "ping" }`
- 服务端回：`{ "type": "pong" }`

### 2. msg（人数统计）

- 客户端发：`{ "type": "msg" }`
- 服务端回：`{ "type": "msg", "data": { "liveMsg": { "liveNums": <在线人数>, "forbid": 0 } } }`

### 3. bullet（弹幕）

广播给同房间所有客户端（含发送者）。

- 客户端发：原始 JSON 原样透传（`type: "bullet"`）
- 服务端：向房间全员广播该 JSON

### 4. whiteBoard（白板状态同步）

- 客户端发：`{ "type": "whiteBoard", "data": { "liveMsg": { "msg": <白板内容> } } }`
- 服务端：将该 `msg` 存入房间级内存（新成员加入时可通过 `getwhiteBoard` 拉取），然后广播给**除发送者外**的所有客户端

### 5. getwhiteBoard（拉取白板状态）

- 客户端发：`{ "type": "getwhiteBoard" }`
- 服务端回：`{ "type": "getWhiteBoard", "data": { "liveMsg": { "msg": <存储的白板内容或 null> } } }`

### 6. over / live_started（直播状态事件）

- 客户端发：`{ "type": "over" }` 或 `{ "type": "live_started", ... }`
- 服务端：向房间全员广播该原始 JSON

## 断开

- `close 4001` + reason：token 缺失或无效
- `close 1001`：服务端关闭
- 连接关闭时自动从房间列表移除，房间无人时删除房间

## 相关环境变量

| 变量         | 说明                                       |
| ------------ | ------------------------------------------ |
| CHAT_WS_PORT | 端口，默认 50054                           |
| JWT_SECRET   | JWT 密钥，**必填**（未设置时服务拒绝启动） |
