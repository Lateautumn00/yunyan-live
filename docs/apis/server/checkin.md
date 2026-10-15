# 签到接口 `/live/checkin`

控制器：`apps/server/src/live/checkin.controller.ts` → 转发到 `live-service`（gRPC：50052）；gRPC 成功后由 Gateway 发布到 Redis 频道 `live:checkin`，chat-ws-service 订阅后向课堂广播（见 [chat.md](../chat-ws-service/chat.md) 的 `checkin` 帧）。**发布失败仅记录告警，不影响签到结果**。

所有成功响应均包裹为 `{ code: 1000, msg: "success", data }`，下文仅列出 `data` 结构。全部端点需要 JWT（`Authorization: Bearer <token>`）。

## 口径说明

- **三态派生**（无 status 落库列）：`status=1` 进行中（`endedAt` 为空且当前时间 < `deadlineAt`）；`status=2` 已关闭（教师手动结束或超时）。
- `method`：1=窗口内正常签到，2=补签（makeup）。
- **分母（应到）**：发起时同事务快照 `user_watch_times` 中该房间 `left_at IS NULL` 的用户并**排除教师**；发起后进房的学生不改分母，但可签到（明细记为 `inDenominator=false` 的分母外签到）。
- **出勤率** = 已签 ∩ 应到 / 应到（`attendedCount / attendeeCount`）；应到为 0 → 客户端显示 `—`。
- 超时由客户端按 `deadlineAt`（配合服务器时间校准）本地关闭轮次；服务端在 respond 时校验窗口，无清理任务。
- 错误体为 `{ code, msg, data: null }`；gRPC `FAILED_PRECONDITION`（业务窗口错误）当前未在状态映射表中，落到 HTTP `500`，以 `msg` 为准。

## 1. 发起签到

`POST /live/checkin/start`（仅房间所有者）

**请求体：**

| 字段     | 类型   | 必填 | 校验                           |
| -------- | ------ | ---- | ------------------------------ |
| roomId   | string | 是   | 房间 ID                        |
| duration | number | 是   | 签到窗口秒数，仅 30 / 60 / 120 |

**响应 data：** 签到会话结构（见「附：签到会话结构」）。

**行为与校验：**

- 归属校验 `room.liveUserId === 当前用户`，否则 `403 仅房间所有者可操作签到`；房间不存在 → `404 房间不存在`。
- 同事务自动关闭未结束的上一轮（新发起即接管），随后快照分母插入新轮次。
- 成功后广播 `{ action: "started", sessionId, deadlineAt }`。
- 重复发起 = 开新一轮（幂等口径：旧轮自动 ended，不是无操作）。

## 2. 学生签到

`POST /live/checkin/respond`

**请求体：**

| 字段      | 类型    | 必填 | 校验                                    |
| --------- | ------- | ---- | --------------------------------------- |
| roomId    | string  | 是   | 房间 ID                                 |
| sessionId | string  | 是   | 签到轮次 ID                             |
| makeup    | boolean | 否   | true=补签（窗口关闭后生效），默认 false |

**响应 data：**

| 字段          | 类型    | 说明                                 |
| ------------- | ------- | ------------------------------------ |
| signedCount   | number  | 本轮累计已签人数（全量重算，非增量） |
| alreadySigned | boolean | 此前已签（幂等返回，不重复计数）     |
| makeup        | boolean | 本次是否按补签记账                   |

**业务规则：**

- 仅教室内学生（`live_participants` 存在），否则 `403 仅教室内学生可签到`。
- 轮次不存在或不属于该房间 → `404 签到不存在`。
- 窗口内（未手动结束且未过 `deadlineAt`）→ `method=1`。
- 已关闭时：`makeup` 非 true → `500 签到已截止`；`makeup=true` 但教师未开补签 → `500 本轮未开启补签`；否则 `method=2`。
- 幂等：重复提交（含并发）返回 `alreadySigned=true`，`signedCount` 不变（唯一约束 + `ON CONFLICT DO NOTHING`）。
- 成功后广播 `{ action: "update", signedCount }`；客户端对同一 `sessionId` 的 `signedCount` 只接受更大值（单调不回退）。

## 3. 结束本轮

`POST /live/checkin/end`（仅房间所有者）

**请求体：** `roomId`（必填）、`sessionId`（必填）。

**响应 data：** 签到会话结构（`endedAt` 已回写，`status=2`）。

- 非所有者 → `403`；轮次不存在 → `404`。
- 幂等：已结束的轮次不回写。
- 成功后广播 `{ action: "ended", signedCount }`。

## 4. 开启补签

`POST /live/checkin/openMakeup`（仅房间所有者）

**请求体：** `roomId`（必填）、`sessionId`（必填）。

**响应 data：** 签到会话结构（`makeupOpen=true`）。

- 仅允许对**已关闭**轮次开启；轮次进行中 → `500 签到进行中，无需补签`。
- 成功后广播 `{ action: "makeup" }`（无 `signedCount`，客户端不动计数）。

## 5. 签到初态

`GET /live/checkin/state/:roomId`

**响应 data：**

| 字段       | 类型           | 说明                                                        |
| ---------- | -------------- | ----------------------------------------------------------- |
| hasSession | boolean        | 该房间是否存在轮次                                          |
| isOwner    | boolean        | 调用者是否房间所有者                                        |
| session    | object \| null | 签到会话结构（含 `mySigned` / `myMethod`）；无轮次为 `null` |

- 权限：房间所有者或教室内成员；有轮次时非成员 → `403 无权查看该签到`。
- 房间不存在 → `404 房间不存在`。
- 供桌面端进房水合（断线重连 / 刷新后初态一致），不触发广播。

## 6. 轮次列表（分页）

`GET /live/checkin/sessions/:roomId?page=1&pageSize=10`（仅房间所有者）

**查询参数：** `page`（默认 1）、`pageSize`（默认 10）。

**响应 data：**

| 字段  | 类型   | 说明                                  |
| ----- | ------ | ------------------------------------- |
| items | array  | 签到会话结构数组，按 `startedAt` 倒序 |
| total | number | 总轮次数                              |

- 非所有者 → `403`；房间不存在 → `404`。

## 7. 签到明细（报表，只读）

`GET /live/checkin/records/:sessionId`（仅房间所有者）

**响应 data：**

| 字段          | 类型   | 说明                                    |
| ------------- | ------ | --------------------------------------- |
| items         | array  | 明细行，见下                            |
| total         | number | 行数                                    |
| attendeeCount | number | 应到（分母，发起时快照）                |
| signedCount   | number | 已签总人数（含分母外签到）              |
| attendedCount | number | 已签 ∩ 应到（出勤率分子，分母外不计入） |

**明细行：**

| 字段          | 类型    | 说明                                         |
| ------------- | ------- | -------------------------------------------- |
| userId        | string  | 用户 ID                                      |
| nickName      | string  | 用户名（auth-service 批量解析，失败回退 ID） |
| inDenominator | boolean | 是否在应到分母内                             |
| signed        | boolean | 是否已签                                     |
| method        | number  | 1=正常，2=补签（未签为 0）                   |
| respondedAt   | string  | 签到时间（ISO8601，未签为空串）              |

- 行集 = 应到名单全部行（已签/未签）∪ 分母外**已签**行（`inDenominator=false`，附加列出但不计入出勤率）。
- 非所有者 → `403 无权查看签到明细`；轮次不存在 → `404`。

## 附：签到会话结构

1–6 端点的会话对象（camelCase）：

| 字段          | 类型           | 说明                                   |
| ------------- | -------------- | -------------------------------------- |
| sessionId     | string         | 轮次 ID（UUID）                        |
| roomId        | string         | 房间 ID                                |
| teacherId     | string         | 发起教师（房间所有者）                 |
| startedAt     | string         | 发起时间（ISO8601）                    |
| deadlineAt    | string         | 截止时间 = 发起 + duration（ISO8601）  |
| endedAt       | string \| null | 手动结束时间，未结束为 `null`          |
| attendeeCount | number         | 应到（分母快照人数）                   |
| signedCount   | number         | 已签人数（含分母外）                   |
| makeupOpen    | boolean        | 是否已开启补签                         |
| status        | number         | 1=进行中，2=已关闭（派生，非落库列）   |
| mySigned      | boolean        | 当前用户是否已签                       |
| myMethod      | number         | 当前用户方式（0=未签，1=正常，2=补签） |

## 广播帧

签到动作成功后，Gateway 向 Redis 频道 `live:checkin` 发布，chat-ws-service 转发给房间全员：

```json
{
  "type": "checkin",
  "data": { "roomId": "R1", "action": "started", "sessionId": "…", "deadlineAt": "…" }
}
```

`action` ∈ `started | update | ended | makeup`；字段随动作携带（`deadlineAt` 仅 started，`signedCount` 在 update/ended）。完整契约见 [chat.md](../chat-ws-service/chat.md)。

## 手动验收清单

1. 教师发起 → 学生弹窗 + 广播计数；重复点签到幂等。
2. 截止瞬间边界（useServerTime）：截止后 respond 被拒；面板超时自行关闭。
3. 两个学生并发签到 → 计数不回退（单调守卫）。
4. 发起后新进房学生可签 → 不改应到，报表列分母外签到。
5. 分母空（无人在线）→ 应到 `—`。
6. 教师永不出现在应到名单（快照 + `<> teacherId` 双保证）。
7. 再次发起 → 上一轮自动 ended；手动「结束本轮」生效。
8. 补签：仅窗口关闭后、仅教室内、method=makeup 标记。
9. 非 owner 发起/结束 → 403；非成员 respond → 403。
10. 断线重连 / 刷新 → HTTP hydration 初态一致。
11. Redis 宕机时签到仍成功（publish try/catch），仅广播缺失。
12. 报表只读；出勤率 = 已签 ∩ 应到 / 应到。
