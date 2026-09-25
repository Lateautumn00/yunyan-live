# 邮件接口 `/user/mail`

控制器：`apps/server/src/mail/mail.controller.ts` → 转发到 `mail-service`（gRPC ：50053）。

## 1. 发送邮箱验证码

`POST /user/mail/reqEmailCode`

无需鉴权。

**请求体：**

| 字段  | 类型   | 必填 | 校验     |
| ----- | ------ | ---- | -------- |
| email | string | 是   | 合法邮箱 |

**响应 data：** gRPC `SendCode` 直透（`code`/`msg`）。`code === "0"` 表示发送成功，验证码存储在 mail-service 的 Redis 中（默认 5 分钟有效）。

**示例：**

```json
{ "code": 1000, "msg": "success", "data": { "code": "0", "msg": "success" } }
```
