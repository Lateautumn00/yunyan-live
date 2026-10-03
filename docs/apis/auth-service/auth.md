# auth-service 接口（gRPC）

服务：`apps/auth-service`，端口 **50051**，协议包 `auth.proto`（`package auth`），服务名 `AuthService`。

内部服务仅供 Gateway 与其它微服务通过 gRPC 调用，不对外暴露 HTTP。

## 通用说明

- 所有 RPC 为 unary（请求-响应）。
- 成功响应 `code === "0"`。
- `ChangePassword` 需要 gRPC metadata `user-id` 为当前登录用户 ID（由 Gateway 鉴权后注入）。
- **密码字段**（`password` / `old_password` / `new_password`）为客户端 RSA-OAEP-SHA256 密文的
  base64 原样透传，auth-service 在内部用 `PASSWORD_PRIVATE_KEY` 私钥解密后再做 bcrypt 比对；
  明文或非法密文一律拒绝。解密实现见 `apps/auth-service/src/auth/password-crypto.ts`。

## 消息结构

### UserData

| 字段     | 类型   | 说明           |
| -------- | ------ | -------------- |
| id       | string | 用户 ID        |
| username | string | 用户名         |
| email    | string | 邮箱           |
| role     | int32  | 1=老师，2=学生 |

### AuthResponse

| 字段         | 类型   | 说明           |
| ------------ | ------ | -------------- |
| code         | string | `"0"` 成功     |
| msg          | string | 提示信息       |
| access_token | string | JWT 令牌       |
| expires_in   | int32  | 过期时间（秒） |
| guid         | string | 用户 ID        |
| role         | int32  | 角色           |

## RPC 列表

### 1. Login

`rpc Login (LoginRequest) returns (AuthResponse)`

**请求：**

| 字段     | 类型   | 说明 |
| -------- | ------ | ---- |
| email    | string | 邮箱 |
| password | string | 密码 |

### 2. Register

`rpc Register (RegisterRequest) returns (RegisterResponse)`

**请求：**

| 字段     | 类型   | 说明           |
| -------- | ------ | -------------- |
| username | string | 用户名         |
| email    | string | 邮箱           |
| password | string | 密码           |
| code     | string | 邮箱验证码     |
| role     | int32  | 1=老师，2=学生 |

**响应 RegisterResponse：** `code, msg, guid`。

### 3. ResetPassword

`rpc ResetPassword (ResetPasswordRequest) returns (CommonResponse)`

**请求：**

| 字段     | 类型   | 说明       |
| -------- | ------ | ---------- |
| email    | string | 邮箱       |
| code     | string | 邮箱验证码 |
| password | string | 新密码     |

### 4. ChangePassword

`rpc ChangePassword (ChangePasswordRequest) returns (CommonResponse)`

需要 metadata `user-id`。

**请求：**

| 字段         | 类型   | 说明                            |
| ------------ | ------ | ------------------------------- |
| user_id      | string | 用户 ID（必须与 metadata 一致） |
| old_password | string | 旧密码                          |
| new_password | string | 新密码                          |

### 5. GetUser

`rpc GetUser (GetUserRequest) returns (UserResponse)`

**请求：**

| 字段    | 类型   | 说明    |
| ------- | ------ | ------- |
| user_id | string | 用户 ID |

**响应 UserResponse：** `code, msg, data(UserData)`。

### 6. UpdateUserName

`rpc UpdateUserName (UpdateUserNameRequest) returns (CommonResponse)`

**请求：**

| 字段     | 类型   | 说明     |
| -------- | ------ | -------- |
| user_id  | string | 用户 ID  |
| username | string | 新用户名 |

### 7. BatchGetUsers

`rpc BatchGetUsers (BatchGetUsersRequest) returns (BatchGetUsersResponse)`

**请求：**

| 字段     | 类型            | 说明         |
| -------- | --------------- | ------------ |
| user_ids | repeated string | 用户 ID 数组 |

**响应 BatchGetUsersResponse：** `code, msg, data`（`repeated UserData`）。

### 8. SearchTeachers

`rpc SearchTeachers (SearchTeachersRequest) returns (SearchTeachersResponse)`

**请求：**

| 字段    | 类型   | 说明   |
| ------- | ------ | ------ |
| keyword | string | 关键字 |

**响应 SearchTeachersResponse：** `code, msg, data`（`repeated UserData`）。

## 示例（Gateway 调用）

```typescript
// apps/server/src/auth/auth.controller.ts
const result = await grpcCall(this.authService.login(dto));
return { token: result.access_token, guid: result.guid, role: result.role };
```
