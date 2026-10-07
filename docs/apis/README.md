# 云砚直播（Yunyan Live）接口文档总索引

本文档覆盖 `yunyan-live-electron` monorepo 中全部 6 个微服务的对外接口，按微服务分目录归档。

## 服务与端口

| 微服务 | 目录 | 协议 | 端口 | 说明 |
| ------ | ---- | ---- | ---- | ---- |
| server（API Gateway） | [server/](server/README.md) | HTTP/REST | 3001 | 唯一对外入口，聚合下游 gRPC |
| auth-service | [auth-service/auth.md](auth-service/auth.md) | gRPC | 50051 | 认证 / 用户 |
| live-service | [live-service/live.md](live-service/live.md) | gRPC | 50052 | 直播房间 / 录制 |
| mail-service | [mail-service/mail.md](mail-service/mail.md) | gRPC + MQ | 50053 | 邮件验证码 |
| chat-ws-service | [chat-ws-service/chat.md](chat-ws-service/chat.md) | WebSocket | 50054 | 聊天 / 白板状态转发 |
| yjs-ws-service | [yjs-ws-service/yjs.md](yjs-ws-service/yjs.md) | WebSocket | 50055 | Yjs 白板协同 |

## 通用约定

### 1. 响应包裹

所有 HTTP 接口经 Gateway 的 `ResponseInterceptor` 统一包裹：

```json
{ "code": 1000, "msg": "success", "data": {} }
```

- `code === 1000` 表示成功，其余为业务/系统错误。

### 2. 鉴权

需要登录的接口通过 `Authorization: Bearer <JWT>` 传递令牌（部分历史端也接受 `token` / `guid` 请求头）。登录接口在 `POST /user/user/login` 返回 `token`。

### 3. 密码传输加密

所有涉及密码的接口（登录 / 注册 / 重置密码 / 修改密码）中，密码字段均为
**RSA-OAEP-SHA256 + base64 密文**（公钥内置桌面端），auth-service 解密后再做 bcrypt 比对；
明文密码一律拒绝。详见 [server/auth.md](server/auth.md) 与 [auth-service/auth.md](auth-service/auth.md)。

### 4. gRPC 响应

内部 gRPC 服务统一返回 `{ code: "0", msg: "success", ... }`，`code === "0"` 表示成功。Gateway 通过 `grpcCall` 将其映射为 HTTP 状态码。

| gRPC code | HTTP |
| --------- | ---- |
| NOT_FOUND | 404 |
| UNAUTHENTICATED | 401 |
| PERMISSION_DENIED | 403 |
| ALREADY_EXISTS | 409 |
| INVALID_ARGUMENT | 400 |
| INTERNAL | 500 |
| UNAVAILABLE | 502 |

### 4. 参数校验

Gateway 启用全局 `ValidationPipe`（`whitelist: true, forbidNonWhitelisted: true`），未知字段会触发 400。

## 状态码速查

| code | 含义 |
| ---- | ---- |
| 1000 | 成功 |
| 400 | 参数校验失败 / 业务参数错误 |
| 401 | 未登录 / 令牌无效 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 2002 | 录制转码中（`downloadRecording` 转码状态），非 HTTP 状态码 |

## 相关资源

- WebRTC 直播：Janus 信令走 `VITE_LIVE_SERVER`（如 `ws://localhost:8188/janus`），不在本文档范围。
- 部署与启动：见根目录 `README.md` 与 `init/`。