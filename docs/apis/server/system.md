# 系统接口（健康检查 / 时间）

控制器：`apps/server/src/app.controller.ts`、`apps/server/src/users/users.controller.ts`。

## 1. 健康检查

`GET /health`

无需鉴权。返回 Gateway 自身状态。

**响应 data：**

| 字段      | 类型   | 说明                  |
| --------- | ------ | --------------------- |
| status    | string | `ok`                  |
| service   | string | `@yunyan-live/server` |
| timestamp | number | 当前时间戳            |

## 2. 微服务健康检查

`GET /health/services`

无需鉴权。通过 TCP 探测各下游 gRPC 服务端口（3001 无此列表）。

**探测目标：** auth-service:50051、live-service:50052、mail-service:50053。

**响应 data：**

| 字段      | 类型   | 说明                                           |
| --------- | ------ | ---------------------------------------------- |
| status    | string | `ok`（全部正常）/ `degraded`（至少一个不可达） |
| service   | string | `@yunyan-live/server`                          |
| timestamp | number | 当前时间戳                                     |
| services  | 数组   | 每项 `{ name, port, status: "ok"               | "unavailable" }` |

**示例：**

```json
{
  "code": 1000,
  "msg": "success",
  "data": {
    "status": "degraded",
    "service": "@yunyan-live/server",
    "timestamp": 1727000000000,
    "services": [
      { "name": "auth-service", "port": 50051, "status": "ok" },
      { "name": "live-service", "port": 50052, "status": "ok" },
      { "name": "mail-service", "port": 50053, "status": "unavailable" }
    ]
  }
}
```

## 3. 获取服务器时间

`GET /user/user/getNowTime`

无需鉴权。供客户端校准时间。

**响应 data：**

| 字段    | 类型   | 说明                                   |
| ------- | ------ | -------------------------------------- |
| nowTime | string | `Date.now()` 的字符串形式（Unix 毫秒） |

**示例：**

```json
{ "code": 1000, "msg": "success", "data": { "nowTime": "1727000000000" } }
```
