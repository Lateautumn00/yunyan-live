# mail-service 接口（gRPC + MQ）

服务：`apps/mail-service`，gRPC 端口 **50053**，协议包 `mail.proto`（`package mail`），服务名 `MailService`。同时消费 RabbitMQ 事件。

## gRPC

### 1. SendCode

`rpc SendCode (SendCodeRequest) returns (CommonResponse)`

发送邮箱验证码邮件（验证码存 Redis，默认有效期 5 分钟）。

**请求：**

| 字段  | 类型   | 说明     |
| ----- | ------ | -------- |
| email | string | 收件邮箱 |

**响应 CommonResponse：** `code ("0" 成功), msg`。

### 2. VerifyCode

`rpc VerifyCode (VerifyCodeRequest) returns (VerifyCodeResponse)`

校验邮箱验证码（注册 / 重置密码时由 auth-service 调用）。

**请求：**

| 字段  | 类型   | 说明   |
| ----- | ------ | ------ |
| email | string | 邮箱   |
| code  | string | 验证码 |

**响应 VerifyCodeResponse：**

| 字段  | 类型   | 说明                             |
| ----- | ------ | -------------------------------- |
| code  | string | `"0"`=验证通过，`"1"`=无效或过期 |
| msg   | string | 提示信息                         |
| valid | bool   | 是否有效                         |

## MQ 事件

### mail.send_code

**发布方：** auth-service（发送验证码邮件时异步 emit，不等待结果）。

**消费方：** mail-service（`@EventPattern('mail.send_code')`）。

**事件负载：**

```json
{ "email": "user@example.com" }
```

行为等同于调用 gRPC `SendCode`。

## 相关环境变量

- `REDIS_HOST` / `REDIS_PORT`：验证码存储
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`：邮件发送
- `GRPC_PORT`：默认 50053
