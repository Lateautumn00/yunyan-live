# API Gateway（server）接口索引

Gateway（`apps/server`）是唯一对外 HTTP 入口，监听端口 **3001**。按控制器模块拆分为 4 份文档：

| 文档 | 路由前缀 | 控制器 | 端点数 |
| ---- | -------- | ------ | ------ |
| [auth.md](auth.md) | `/user/user` | AuthController | 8 |
| [live.md](live.md) | `/live/liveInfo` | LiveController | 24 |
| [mail.md](mail.md) | `/user/mail` | MailController | 1 |
| [upload.md](upload.md) | `/upload` | UploadController | 2 |
| [system.md](system.md) | `/health`、`/user/user` | AppController、UsersController | 3 |

## 公共约定

### Base URL

```
http://<host>:3001
```

### 响应包裹

所有响应经 `ResponseInterceptor` 统一包裹为 `{ code, msg, data }`，成功时 `code === 1000`：

```json
{ "code": 1000, "msg": "success", "data": { ... } }
```

### 鉴权方式

- **JWT 鉴权**：请求头 `Authorization: Bearer <token>`
- 令牌来源：`POST /user/user/login` 或 `POST /user/user/getUserMsg` 返回的 `token`
- 未带/无效令牌 → `401`
- CORS 允许请求头：`Content-Type, Authorization, token, guid`
- CORS 允许来源：环境变量 `CORS_ORIGINS`（默认 `http://localhost:5173, http://localhost:3000`）

### 错误响应

校验失败（`ValidationPipe`）：HTTP `400`，message 为字段级提示（中文）。

```json
{ "code": 400, "msg": "startTime 开始时间不能早于当前时间" }
```

### 静态资源

上传目录以 `/uploads` 前缀暴露：`http://<host>:3001/uploads/images/<file>`、`http://<host>:3001/uploads/ppt/<dir>/<page>.png`。

## 如何阅读

每个端点条目包含：请求方法/完整路径、鉴权、请求参数（字段 / 类型 / 必填 / 校验）、响应示例（`data` 部分按控制器实际返回结构）、业务说明。