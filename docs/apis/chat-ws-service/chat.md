# chat-ws-service 接口（WebSocket）

服务：`apps/chat-ws-service`，端口 **50054**（默认，由 `CHAT_WS_PORT` 控制）。基于 Koa + `ws`，无 HTTP 路由（`GET /` 返回 `{ status: "ok", service: "chat-ws" }`）。

## 连接

```
ws://<host>:50054?token=<JWT>&roomId=<roomId>&liveUserId=<userId>&nickName=<nickName>
```

| 查询参数   | 必填 | 说明                                                       |
| ---------- | ---- | ---------------------------------------------------------- |
| token      | 是   | JWT，用 `JWT_SECRET` 校验，无效则断开（code 4001）         |
| roomId     | 否   | 房间 ID，默认 `default`                                    |
| liveUserId | 否   | 房间/主播 ID（仅展示用途，鉴权以 JWT 的 `sub`+`sid` 为准） |
| nickName   | 否   | 昵称                                                       |

连接建立时会校验 JWT 中的会话 `sid`（Redis `session:<guid>`）：不匹配 → `close 4002`，会话过期/不存在 → `close 4001`，Redis 故障时放行（fail-open）。

连接建立后服务端主动推送两条消息：

1. `{ "type": "pong" }`
2. `{ "type": "msg", "data": { "liveMsg": { "liveNums": <房间在线人数>, "forbid": 0 } } }`

## 消息协议

客户端与服务端交互均为 JSON 文本帧。字段：`type`（string）+ `data`（object，可选）。

### 1. ping / pong（心跳）

- 客户端发：`{ "type": "ping" }`
- 服务端回：`{ "type": "pong" }`

### 2. msg（人数统计与禁言态）

- 客户端发：`{ "type": "msg" }`
- 服务端回：`{ "type": "msg", "data": { "liveMsg": { "liveNums": <在线人数>, "forbid": 0 | 1 } } }`
- `forbid`：`0`=禁言、`1`=可发言（`readForbid` 失败时 fail-open 回 `1`）；客户端据此切换输入框可用态

### 3. bullet（弹幕）

广播给同房间所有客户端（含发送者）。信封由服务端**重建后**广播，客户端原始信封不透传。

客户端发：

```json
{
  "type": "bullet",
  "data": {
    "liveMsg": {
      "msg": "大家好",
      "roomId": "r1",
      "name": "小明",
      "mentions": [{ "userId": "u2", "userName": "李四" }]
    },
    "info": { "type": 1, "isTeacher": false, "liveUserId": "u1" }
  }
}
```

服务端处理（`bullet.ts`，纯函数 + 连接期身份上下文）：

| 步骤     | 规则                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 解析     | JSON 非法 / 非对象 / `type !== "bullet"` / `msg` 非字符串或空 → 拒发 `invalid`                                                              |
| 禁言     | 房间禁言态为 `0`（`FORBID_FORBIDDEN`）且 JWT 角色非教师 → 拒发 `forbidden`；未设置（`undefined`）fail-open 放行                             |
| mentions | 缺省视为 `[]`；非数组 → 整条拒发 `invalid`；非法条目丢弃；单条 `userName` 截断至 64；总数超 50 截断；`userId === "all"` 且非教师 → 该条剥离 |
| 昵称     | 连接期 `nickName`（URL 查询参数）优先，其次 `liveMsg.name`；剔除控制字符并截断至 64                                                         |
| 身份     | `info.isTeacher` 以 JWT `payload.role === 1` 为权威重建；`liveUserId` 以连接 URL 为权威                                                     |
| 长度     | `msg` 超过 200（UTF-16 code unit）**截断至 200**（不拒发，兼容无 maxlength 的旧客户端）                                                     |
| 注入     | `time = Date.now()`（服务端权威）；`msgId =` 服务端 UUID v4（**覆盖客户端传入值**）；`mentions` 为空数组时省略该键                          |

广播信封（服务端重建后）：

```json
{
  "type": "bullet",
  "data": {
    "liveMsg": {
      "msg": "大家好",
      "roomId": "r1",
      "name": "小明",
      "time": 1793300000000,
      "mentions": [{ "userId": "u2", "userName": "李四" }]
    },
    "info": { "isTeacher": false, "liveUserId": "u1" },
    "msgId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

- `msgId`：服务端生成的 UUID v4，客户端去重与消息列表稳定键的事实源；落库主键，历史回放条目同构
- `time`：消息时间戳，客户端展示与 5 分钟分组的唯一事实源（缺失时客户端回退本地接收时刻）
- `mentions`：仅含通过清洗的条目；渲染高亮与 `@我` 徽标均以该数组为准（与在线成员名单解耦，离线成员同样高亮）
- `data.info` 中不含客户端传入的 `type` 之外的可伪造字段：`isTeacher` 恒为 JWT 权威值

拒发回执（仅回发送者，不广播）：

```json
{ "type": "bullet_rejected", "reason": "forbidden" }
```

| reason         | 触发条件                                |
| -------------- | --------------------------------------- |
| `not_joined`   | 发送者不在任何房间（未完成入房流程）    |
| `forbidden`    | 房间禁言且发送者非教师                  |
| `invalid`      | 解析失败 / 非法信封 / `mentions` 非数组 |
| `too_long`     | 预留；当前超长走截断，不触发            |
| `rate_limited` | 单连接令牌桶耗尽（5 条/秒，突发 10）    |

被拒的 bullet 不出本连接（房间内其他成员不可见）。限流为**连接级令牌桶**：稳定速率 5 条/秒、突发容量 10，仅作用于 `bullet`；`history`/`getHistory` 等协议帧不经限流。

#### 发布顺序与双向降级

- **发布顺序：客户端先发、服务端后发**；回滚顺序相反（先回滚服务端）。纯增量字段 + 外层信封不变，双向可降级。
- 混跑兼容矩阵：

| 组合                | 行为                                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新客户端 + 旧服务端 | 旧服务端裸透传，`mentions`/`time` 随信封原样到达，提及高亮与时间戳（回退接收时刻）仍可用；**无 JWT 身份重建、无超长截断、无禁言强制**（信任边界降级，混跑窗口需知悉） |
| 旧客户端 + 新服务端 | 旧客户端忽略 `time`/`mentions` 增量字段正常渲染；`bullet_rejected` 走 `default: break` 安全忽略（仅表现为消息无回执）；超长被服务端截断至 200                         |
| 新客户端 + 新服务端 | 完整契约生效                                                                                                                                                          |
| 旧客户端 + 旧服务端 | 原行为不变                                                                                                                                                            |

**历史回放混跑矩阵**：

| 组合                | 行为                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| 新客户端 + 旧服务端 | 旧服务端对 `getHistory` 走 `default: break` 无响应 → 客户端 3s 超时置 `hasMore=false`，优雅降级纯实时，无异常 |
| 旧客户端 + 新服务端 | 旧客户端不发 `getHistory`；未知 `history`/`historyPage`/`historyError` 帧走 `default: break` 安全忽略         |
| 新客户端 + 新服务端 | 完整回放与翻页                                                                                                |

### 4. updateForbid（禁言状态广播）

- 触发：网关 `POST /live/push/updateForbid`（仅教师可调）写入 Redis 并 publish 到房间频道
- 服务端广播：`{ "type": "updateForbid", "status": 0 | 1 }`（`0`=禁言 `1`=可发言）
- 客户端收到后立即切换输入框可用态；同时该值写入 `roomForbid` 缓存供 bullet 校验

### 5. whiteBoard（白板状态同步）

- 客户端发：`{ "type": "whiteBoard", "data": { "liveMsg": { "msg": <白板内容> } } }`
- 服务端：将该 `msg` 存入房间级内存（新成员加入时可通过 `getwhiteBoard` 拉取），然后广播给**除发送者外**的所有客户端

### 6. getwhiteBoard（拉取白板状态）

- 客户端发：`{ "type": "getwhiteBoard" }`
- 服务端回：`{ "type": "getWhiteBoard", "data": { "liveMsg": { "msg": <存储的白板内容或 null> } } }`

### 7. over / live_started（直播状态事件）

- 客户端发：`{ "type": "over" }` 或 `{ "type": "live_started", ... }`
- 服务端：向房间全员广播该原始 JSON

### 8. history（进场回放推送）

连接握手完成后（`pong`/`msg` 之后）服务端主动推送一次：

```json
{
  "type": "history",
  "data": {
    "messages": [
      {
        "msgId": "m-1",
        "liveMsg": { "msg": "第一条", "name": "甲", "time": 1770000001000 },
        "info": { "isTeacher": false, "liveUserId": "u1" }
      }
    ],
    "nextCursor": "1770000001000|2001"
  }
}
```

- `messages`：**升序**（最旧在前），最多 50 条（`CHAT_HISTORY_PAGE_SIZE`）；条目与 bullet 广播信封的 `data` 同构
- `nextCursor`：向更早翻页的游标；已到头为 `null`
- 查询失败/超时（默认 3s，`CHAT_HISTORY_TIMEOUT_MS`）→ **不推该帧**（严禁空 history 覆盖前端实时状态）
- 持久化关闭 → 无 history 帧，聊天按纯实时模式运行

### 9. getHistory / historyPage / historyError（向更早翻页）

客户端发（`data` 可省略；无 `cursor` → 取最近 50 条）：

```json
{ "type": "getHistory", "data": { "cursor": "1770000001000|2001" } }
```

服务端回：

```json
{ "type": "historyPage", "data": { "messages": [], "nextCursor": "1769999990000|1001" } }
```

| 规则                   | 说明                                                                          |
| ---------------------- | ----------------------------------------------------------------------------- |
| cursor                 | `毫秒时间戳                                                                   | 行id` 严格格式，参数化 keyset 查询；`nextCursor: null` = 没有更早消息（客户端停止翻页） |
| 单飞                   | 连接级：请求 in-flight 期间的重复 `getHistory` 静默忽略，只回一帧             |
| `invalid_cursor`       | cursor 格式非法 → `historyError` **终态**（客户端置 hasMore=false，不再请求） |
| `unavailable`          | 查询失败/超时 → `historyError`（可重试）                                      |
| `persistence_disabled` | 持久化未开启 → `historyError` **终态**                                        |

`historyError` 形状：`{ "type": "historyError", "data": { "reason": "<reason>" } }`。

### 10. GET /healthz

`GET /healthz` → 200 JSON：

```json
{ "status": "ok", "mq": 1, "pg": 1, "queueDepth": 0, "dlqDepth": 0 }
```

- `status`：`ok`（双依赖可用）/ `degraded`（任一不可用）/ `disabled`（持久化未开启，`mq`/`pg` 恒 0）
- `queueDepth`/`dlqDepth`：MQ 不可用时为 `null`；结果缓存 60s（排障时以 rabbitmqctl 为准）

## 断开

- `close 4001` + reason：token 缺失/无效，或会话过期
- `close 4002` + reason：**单端登录踢出**（账号已在其他设备登录，服务端订阅 `session:kick` 频道后主动断开）
- `close 1001`：服务端关闭
- 连接关闭时自动从房间列表移除；房间无人时删除房间级内存（在线名单、禁言缓存、白板状态）

## 相关环境变量

| 变量                    | 说明                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| CHAT_WS_PORT            | 端口，默认 50054                                                                             |
| JWT_SECRET              | JWT 密钥，**必填**（未设置时服务拒绝启动）                                                   |
| REDIS_HOST              | Redis 地址，用于会话校验与踢出，默认 127.0.0.1                                               |
| REDIS_PORT              | Redis 端口，默认 6379                                                                        |
| DATABASE_URL            | PG 连接串；与 `RABBITMQ_URL` **同启同停**，缺一 → ERROR 日志并按关闭处理（半配置不静默启动） |
| RABBITMQ_URL            | AMQP 连接串；同上，均未配置 → 持久化关闭（纯实时模式）                                       |
| CHAT_HISTORY_TIMEOUT_MS | history 查询 fail-open 超时（ms），默认 3000                                                 |

## 附录：拓扑与 DLQ 重放 runbook

服务启动时断言拓扑（幂等）：exchange `chat.persist`（durable），routing keys `chat.work` / `chat.retry1` / `chat.retry2` / `chat.retry3` / `chat.dlq`；队列 `chat.persist.work` / `chat.persist.retry1`（TTL 5s）/ `chat.persist.retry2`（30s）/ `chat.persist.retry3`（120s）/ `chat.persist.dlq`（均 durable）。消费者 confirm-before-ack；单批 INSERT 毒行（SQLSTATE 22xxx/23xxx）逐行隔离进 DLQ，好行照常 ack；`x-retry ≥ 3` → DLQ。

**重放步骤**：

1. 观测：`docker compose exec -T rabbitmq rabbitmqctl list_queues -q`（关注 `chat.persist.dlq` 深度；`/healthz` 的 `dlqDepth` 同源）。
2. 取出：管理台（`127.0.0.1:15672`）→ Queues → `chat.persist.dlq` → Get messages（Nack requeue=false）。
3. **清除 `x-retry` / `x-death` 头后**，重新 publish 到 routing key `chat.work`（exchange `chat.persist`）。
4. 依赖 `ON CONFLICT (msg_id)` 幂等断言每条恰落 1 行，对账：`SELECT count(*) FROM chat_messages WHERE room_id='...'`。

> 带旧头直接重放会再次满足 `x-retry ≥ 3` 立即回 DLQ（死循环），第 3 步为必须步骤。
