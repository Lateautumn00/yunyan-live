# Janus Gateway Docker 部署

## 前置条件

- Docker >= 20.10
- Docker Compose >= 2.0
- WSL 环境（Windows）或 Linux 环境
- Node.js >= 24.13.0 + pnpm >= 10.28.2（前端开发需要）

## 快速部署

### 1. 构建并启动 Janus

```bash
cd init

# 构建镜像（首次约 2-3 分钟，从 Gitee 克隆源码）
docker compose build

# 启动基础设施（Janus + PostgreSQL/Redis/RabbitMQ + Prometheus/Alertmanager/node-exporter）
docker compose up -d

# 查看日志（确认 "WebSockets server started (port 8188)"）
docker logs janus-gateway --tail 20
```

### 2. 启动前端开发环境

```bash
cd ../..  # 回到项目根目录

# 同时启动后端服务（NestJS 网关 + 微服务）与 Electron 桌面端
pnpm dev:all
```

这会同时启动：
- **后端服务** -- NestJS API 网关（http://localhost:3001，`apps/server`）+ auth/live/mail/chat-ws/yjs-ws 微服务
- **Electron Desktop** -- 前端应用，自动连接网关与 Janus

### 3. 验证服务

```bash
# 安装 websocat（WebSocket 客户端，如果没有）
sudo apt install websocat

# 测试 Janus WebSocket 连接
echo '{"janus":"keepalive","transaction":"test1"}' | websocat --one-message ws://localhost:8188/janus
```

成功响应示例：
```json
{"janus": "ack", "transaction": "test1"}
```

> **注意**: `curl http://localhost:8188/info` 返回 403 是正常的 -- 8188 端口是 WebSocket 端口，只接受 WebSocket 升级请求，不响应 HTTP。

## 配置前端连接

在 `apps/desktop/.env.development` 中配置：

```bash
# NestJS API 网关
VITE_USER_API=http://localhost:3001/user
VITE_LIVE_API=http://localhost:3001/live

# 聊天 / 白板 WebSocket 服务
VITE_MESSAGE_WS=ws://localhost:50054
VITE_YJS_WS=ws://localhost:50055

# Janus WebSocket（Docker Desktop 已把端口中继到 Windows 回环，直接用 localhost）
VITE_LIVE_SERVER=ws://localhost:8188/janus
```

## 环境变量

通过 `docker-compose.yml` 的 `environment` 与 `entrypoint.sh` 默认值提供：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| GATEWAY_IP | 0.0.0.0 | Janus 绑定 IP（compose 硬编码，`.env` 中同名键不透传） |
| JANUS_STUN_SERVER | （空） | STUN 服务器；默认禁用——GFW 阻断 stun.l.google.com 会导致 Janus 启动 FATAL |
| STUN_PORT | 19302 | STUN 端口（仅启用 STUN 时生效） |
| RTP_PORT_RANGE | 20000-20100 | RTP 端口范围 |
| SERVER_NAME | JanusServer | 实例名称（entrypoint.sh 默认值，compose 不下发） |

## 端口说明

| 端口 | 协议 | 用途 |
|------|------|------|
| 8188 | WS | Janus WebSocket 信令（前端连接） |
| 8088 | HTTP | Janus HTTP API（录制控制） |
| 20000-20100 | UDP | RTP/RTCP 媒体流 |
| 3001 | HTTP/WS | NestJS API 网关（宿主 pnpm dev 运行） |
| 8080 | HTTP | 安装包下载/自动更新静态站（yunyan-live-download） |

## 插件说明

| 插件 | 用途 | 前端使用场景 |
|------|------|-------------|
| videoroom | 音视频实时通信 | 直播间音视频 |
| textroom | 数据通道信令 | 聊天、白板同步 |
| recordplay | 录制回放 | 历史回放 |
| echotest | 回声测试 | 连接测试 |
| streaming | 流媒体 | 一对多直播 |

## 构建说明

本项目使用多阶段 Dockerfile 构建 Janus 镜像：

### 架构

```
+-----------------------------------------+
|  Builder Stage (ubuntu:22.04)           |
|  - 安装编译工具链 + 开发库（apt）        |
|  - 从 Gitee 克隆 Janus 源码              |
|  - 编译安装 Janus 到 /opt/janus          |
+-----------------------------------------+
                    |
+-----------------------------------------+
|  Runtime Stage (ubuntu:22.04)           |
|  - 仅安装运行时共享库（apt）             |
|  - 复制编译好的 /opt/janus               |
|  - entrypoint.sh 生成配置文件            |
+-----------------------------------------+
```

### 依赖库

所有依赖通过 apt 安装，无需手动编译：

**构建时**: libjansson-dev, libssl-dev, libglib2.0-dev, libopus-dev, libogg-dev, libcurl4-openssl-dev, libconfig-dev, libnice-dev, libsrtp2-dev, libwebsockets-dev, libmicrohttpd-dev

**运行时**: libjansson4, libssl3, libglib2.0-0, libopus0, libogg0, libcurl4, libconfig9, libnice10, libsrtp2-1, libwebsockets16, libmicrohttpd12

### Janus 源码

使用 Gitee 镜像 [`sazima1/janus-gateway`](https://gitee.com/sazima1/janus-gateway)
（上游为 [janus-gateway/janus-gateway](https://github.com/janus-gateway/janus-gateway)，
解决 Docker 构建时访问 GitHub 被墙的问题）。

编译配置：
- `--enable-websockets` -- WebSocket 传输
- `--enable-rest` -- HTTP REST API
- `--enable-plugin-videoroom` -- 音视频房间
- `--enable-plugin-textroom` -- 文字聊天
- `--enable-plugin-recordplay` -- 录制回放
- `--enable-plugin-echotest` -- 回声测试
- `--enable-plugin-streaming` -- 流媒体

### 配置生成

`entrypoint.sh` 在容器启动时从环境变量生成配置文件：

- `janus.jcfg` -- 主配置（STUN、RTP 端口范围）
- `janus.transport.websockets.jcfg` -- WebSocket 传输（端口 8188，绑定 0.0.0.0）
- `janus.plugin.videoroom.jcfg` -- 预置 Demo Room（ID: 1234）
- `janus.plugin.textroom.jcfg` -- 文字聊天插件
- `janus.plugin.recordplay.jcfg` -- 录制回放插件

## 常见问题

### 1. 构建失败：GitHub 被墙

Docker 内 `git clone github.com` 会超时（GnuTLS recv error）。已使用 Gitee 镜像解决：

```dockerfile
git clone --depth 1 https://gitee.com/sazima1/janus-gateway.git
```

### 2. curl 返回 403

```bash
$ curl http://localhost:8188/info
<html><body><h1>403</h1></body></html>
```

这是正常的。8188 是 WebSocket 端口，只接受 WS 升级请求。用 websocat 测试：

```bash
echo '{"janus":"keepalive","transaction":"test1"}' | websocat --one-message ws://localhost:8188/janus
```

### 3. 端口 8188 无法连接

```bash
# 检查容器是否运行
docker ps -a --filter name=janus-gateway

# 检查端口监听
ss -tlnp | grep 8188

# 查看 Janus 日志
docker logs janus-gateway --tail 20
```

确保 `entrypoint.sh` 中 `ws_interface = "0.0.0.0"`（绑定所有接口）。

### 4. 音视频不通

- 确保 UDP 端口 20000-20100 已开放
- 检查 STUN 服务器是否可达：日志中应显示 `Our public address is xxx`
- 检查 `GATEWAY_IP` 是否设置为正确的 IP

### 5. Windows 无法通过 localhost 连接 Janus

Docker Desktop 会把已发布端口中继到 Windows 回环，`ws://localhost:8188/janus`
在 Windows 侧直接可用（已实测）。若个别环境不通，用 WSL IP 兜底：

```bash
# 获取 WSL IP
hostname -I | awk '{print $1}'

# 更新 apps/desktop/.env.development
VITE_LIVE_SERVER=ws://172.x.x.x:8188/janus
```

### 6. 重新构建

```bash
cd init
docker compose build --no-cache
docker compose up -d
```

## 停止服务

```bash
# 停止 Janus
cd init
docker compose down

# 完全清理（包括数据卷）
docker compose down -v --rmi all
```

## 下载/更新静态站（yunyan-live-download）

客户端安装包分发 + `electron-updater` 自动更新源。更新源地址唯一真源是
`apps/desktop/electron-builder.yml` 的 `publish.url`（打包时写入安装包 `resources/app-update.yml`）：

| 平台  | 更新源地址                         |
| ----- | ---------------------------------- |
| win   | `http://192.168.2.100:8080/win/`   |
| mac   | `http://192.168.2.100:8080/mac/`   |
| linux | `http://192.168.2.100:8080/linux/` |

### 启动

```bash
cd init/yunyan-live-download

# nginx:alpine，8080→80，挂载 ./dist 与 ./nginx.conf
docker compose up -d

# 验证（应返回 YAML 文本）
curl http://192.168.2.100:8080/win/latest.yml
```

### 目录约定

```
dist/
├── win/
│   ├── latest.yml                           # 更新清单（版本、文件名、sha512）
│   ├── yunyan-live_setup_x.y.z.exe          # NSIS 安装包
│   └── yunyan-live_setup_x.y.z.exe.blockmap # 差分更新块映射
├── mac/                                     # dmg + latest-mac.yml
└── linux/                                   # AppImage + latest-linux.yml
```

> **二进制不入库**：`.gitignore` 忽略 `exe/dmg/blockmap`，仓库内 `dist/{win,mac,linux}/` 仅 `.gitkeep` 占位；
> 安装包三件套在服务器上手动放置，本地产物在 `apps/desktop/dist-release/`。

### nginx 规则

- `exe/dmg/AppImage` — 强制 `Content-Disposition: attachment` 弹下载，关闭 gzip
- `yml/RELEASES` — **不加 attachment**（electron-updater 需直接读取），缓存 10m
- `js/css/png/.../html` — 静态资源缓存 7d

发版流程与本地联调详见 [`docs/release/desktop-update.md`](../docs/release/desktop-update.md)。

## 项目结构

```
init/
+-- Dockerfile                   # 多阶段构建：编译 Janus + 运行时镜像
+-- docker-compose.yml           # 容器编排（基础设施 + --profile app 业务服务 + 监控）
+-- entrypoint.sh                # 启动脚本：从环境变量生成配置 + 启动 Janus
+-- .env                         # 环境变量（GATEWAY_IP, STUN 等）
+-- .env.example                 # 环境变量模板
+-- monitoring/                  # Prometheus 告警规则 + Alertmanager 配置
+-- README.md                    # 本文档
+-- yunyan-live-download/        # 安装包下载/自动更新静态站（nginx）
|   +-- docker-compose.yml       # 8080→80，挂载 ./dist
|   +-- nginx.conf               # 下载头/缓存规则
|   +-- dist/{win,mac,linux}/    # 更新目录（仅 .gitkeep 占位，二进制不入库）
```
