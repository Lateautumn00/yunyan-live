# 认证接口 `/user/user`

控制器：`apps/server/src/auth/auth.controller.ts` → 转发到 `auth-service`（gRPC ：50051）。

所有成功响应均包裹为 `{ code: 1000, msg: "success", data }`，下文仅列出 `data` 结构。

## 密码字段加密（必读）

登录 / 注册 / 重置密码 / 修改密码请求中的所有密码字段（`password`、`oldPassword`）必须为
**RSA-OAEP-SHA256 密文**（桌面端内置公钥加密，结果 base64 编码，RSA-2048 输出 344 字符）：

- 公钥内置在桌面端（`apps/desktop/.../utils/passwordPublicKey.ts`，由 `pnpm gen:keys` 生成）。
- Gateway 仅透传与校验长度（≤ 1024 字符），**auth-service 内使用私钥解密**后再走 bcrypt 比对。
- 旧版客户端发送的明文密码会被拒绝（返回密码解密失败），无兼容模式。

## 单端登录（会话管理）

同一账号仅允许一个客户端在线，会话记录存于 Redis（键 `session:<guid>` → `sid`，TTL 7 天）：

- 登录时签发带 `sid` 声明的 JWT，并踢出该账号的旧会话（通过 `session:kick` 频道通知 WS 服务断开旧连接）。
- 除 `login`/`register`/`resetPassword` 外的鉴权接口会校验 `sid`，不匹配时返回 **401 + `code: 4002`**。
- token 缺失 `sid`（旧版令牌）或会话不存在 → 401 + `code: 4001`，需重新登录。
- Redis 不可用时校验**放行**（fail-open），仅记录错误日志。

**错误码（HTTP 401 响应体）：**

| code | 含义                             |
| ---- | -------------------------------- |
| 4001 | 登录已过期 / 会话不存在 / 无 sid |
| 4002 | 账号已在其他设备登录（被踢）     |

## 1. 登录

`POST /user/user/login`

无需鉴权。

**请求体：**

| 字段     | 类型   | 必填 | 校验                           |
| -------- | ------ | ---- | ------------------------------ |
| email    | string | 是   | 合法邮箱                       |
| password | string | 是   | RSA-OAEP base64 密文，长度 ≥ 6 |

**响应 data：**

| 字段  | 类型   | 说明           |
| ----- | ------ | -------------- |
| token | string | JWT 令牌       |
| guid  | string | 用户 ID        |
| role  | number | 1=老师，2=学生 |

**示例：**

```json
{ "code": 1000, "msg": "success", "data": { "token": "eyJ...", "guid": "1", "role": 1 } }
```

## 2. 注册

`POST /user/user/register`

无需鉴权。

**请求体：**

| 字段     | 类型   | 必填 | 校验                              |
| -------- | ------ | ---- | --------------------------------- |
| userName | string | 是   | 长度 2-50                         |
| email    | string | 是   | 合法邮箱                          |
| password | string | 是   | RSA-OAEP base64 密文，长度 6-1024 |
| code     | string | 是   | 邮箱验证码，长度 6                |
| role     | number | 否   | 1 或 2，默认 2                    |

**响应 data：** gRPC `RegisterResponse` 直透（`code`/`msg`/`guid` 字段）。

## 3. 退出登录

`POST /user/user/logout`

需要 JWT。校验会话 `sid` 后**删除 Redis 中的该会话**，使当前 token 立即失效（再次使用返回 401 + `code: 4001`）。

**响应 data：** `{ "success": true }`

## 4. 重置密码

`POST /user/user/resetPassword`

无需鉴权。

**请求体：**

| 字段     | 类型   | 必填 | 校验                           |
| -------- | ------ | ---- | ------------------------------ |
| email    | string | 是   | 合法邮箱                       |
| code     | string | 是   | 邮箱验证码，长度 6             |
| password | string | 是   | RSA-OAEP base64 密文，长度 ≥ 6 |

## 5. 修改密码

`POST /user/user/changePassword`

需要 JWT。

**请求体：**

| 字段        | 类型   | 必填 | 校验                                       |
| ----------- | ------ | ---- | ------------------------------------------ |
| oldPassword | string | 是   | RSA-OAEP base64 密文（旧密码）             |
| password    | string | 是   | RSA-OAEP base64 密文（新密码，解密后 ≥ 6） |

用户 ID 从 JWT 中取，通过 gRPC metadata `user-id` 传给 auth-service。

## 6. 获取当前用户信息

`GET /user/user/getUserMsg`

需要 JWT。返回并**签发新令牌**（保留原 `sid`，不会踢出自身；同时刷新会话 TTL）。

**响应 data：**

| 字段     | 类型   | 说明           |
| -------- | ------ | -------------- |
| token    | string | 新 JWT         |
| guid     | string | 用户 ID        |
| userName | string | 用户名         |
| email    | string | 邮箱           |
| role     | number | 1=老师，2=学生 |

## 7. 修改用户名

`POST /user/user/updateUserName`

需要 JWT。

**请求体：**

| 字段     | 类型   | 必填 | 校验      |
| -------- | ------ | ---- | --------- |
| userName | string | 是   | 长度 2-50 |
