# 认证接口 `/user/user`

控制器：`apps/server/src/auth/auth.controller.ts` → 转发到 `auth-service`（gRPC ：50051）。

所有成功响应均包裹为 `{ code: 1000, msg: "success", data }`，下文仅列出 `data` 结构。

## 1. 登录

`POST /user/user/login`

无需鉴权。

**请求体：**

| 字段     | 类型   | 必填 | 校验     |
| -------- | ------ | ---- | -------- |
| email    | string | 是   | 合法邮箱 |
| password | string | 是   | 长度 ≥ 6 |

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

| 字段     | 类型   | 必填 | 校验               |
| -------- | ------ | ---- | ------------------ |
| userName | string | 是   | 长度 2-50          |
| email    | string | 是   | 合法邮箱           |
| password | string | 是   | 长度 6-50          |
| code     | string | 是   | 邮箱验证码，长度 6 |
| role     | number | 否   | 1 或 2，默认 2     |

**响应 data：** gRPC `RegisterResponse` 直透（`code`/`msg`/`guid` 字段）。

## 3. 退出登录

`POST /user/user/logout`

无需鉴权。不做服务端状态清理，仅返回成功。

**响应 data：** `{ "success": true }`

## 4. 重置密码

`POST /user/user/resetPassword`

无需鉴权。

**请求体：**

| 字段     | 类型   | 必填 | 校验               |
| -------- | ------ | ---- | ------------------ |
| email    | string | 是   | 合法邮箱           |
| code     | string | 是   | 邮箱验证码，长度 6 |
| password | string | 是   | 长度 ≥ 6           |

## 5. 修改密码

`POST /user/user/changePassword`

需要 JWT。

**请求体：**

| 字段        | 类型   | 必填 | 校验               |
| ----------- | ------ | ---- | ------------------ |
| oldPassword | string | 是   | 无额外校验         |
| password    | string | 是   | 长度 ≥ 6（新密码） |

用户 ID 从 JWT 中取，通过 gRPC metadata `user-id` 传给 auth-service。

## 6. 获取当前用户信息

`GET /user/user/getUserMsg`

需要 JWT。返回并**签发新令牌**。

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

## 8. 按 ID 查询用户

`GET /user/user/getUserById?userId=xxx`

需要 JWT。

**查询参数：** `userId`（string，必填）

**响应 data：**

| 字段     | 类型   | 说明    |
| -------- | ------ | ------- |
| userId   | string | 用户 ID |
| userName | string | 用户名  |
