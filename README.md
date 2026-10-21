# 云砚直播 (Yunyan Live)

[![CI](https://github.com/Lateautumn00/yunyan-live/actions/workflows/ci.yml/badge.svg)](https://github.com/Lateautumn00/yunyan-live/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24.13.0-brightgreen.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D10.28.2-orange.svg)](https://pnpm.io/)
[![Platform](https://img.shields.io/badge/platform-Win%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()

**简体中文** | [English](README.en.md)

> 基于 Electron + Vue 3 + Nest.js + Janus WebRTC 的开源直播教学平台。数据完全自托管，一站式搭建线上教室。

## 核心特性

- 🎥 **大小班直播授课** —— 基于 Janus WebRTC，支持大班一对多直播与小班互动课堂，教师推流、学生实时订阅
- 📝 **实时协作白板** —— Yjs + y-websocket 多端同步，手绘规整、图形、数学/化学/电路/分子等学科工具
- 📊 **PPT 课件直播** —— 上传后 LibreOffice 转 PDF、pdf.js 按页渲染，支持素材收藏、截图与板书导出
- 📼 **录制与回放** —— Janus 录制自动转码 MP4，后台管理回放列表，支持在线观看与下载
- 🏗️ **全栈自托管** —— Docker Compose 一键启动 PostgreSQL / Redis / RabbitMQ / Janus，数据完全自持
- 💻 **三平台桌面端** —— Electron 打包 Windows / macOS / Linux，支持 electron-updater 自动更新
- 🔧 **微服务后端** —— NestJS 网关 + gRPC 微服务（认证/直播/邮件/聊天/白板），TypeScript 全栈

## 界面预览

| 后台管理 | 教室（课件直播） |
| ------- | ---------------- |
| ![后台管理](docs/assets/screenshot-admin.png) | ![教室课件直播](docs/assets/screenshot-classroom.png) |

**课件工具**：素材收藏、媒体、上传图片、截图、我的课件、导出板书

![课件工具菜单](docs/assets/screenshot-courseware-menu.png)

## 技术栈

| 层级   | 技术                                                                |
| ------ | ------------------------------------------------------------------- |
| 桌面端 | Electron, Vue 3, Vite, Element Plus, Pinia, Konva (白板)            |
| 后端   | Nest.js, TypeORM, PostgreSQL, WebSocket (ws), LibreOffice (PPT转换) |
| 微服务 | gRPC (认证/直播/邮件), Redis (缓存), FFmpeg (视频转码)              |
| WebRTC | Janus Gateway (Docker), janus-pp-rec (录制转码)                     |
| 工具链 | pnpm, Turborepo, TypeScript, ESLint, Prettier, Husky, Commitlint    |
| 部署   | Docker Compose                                                      |

## 目录结构

```
yunyan-live/
├── apps/
│   ├── desktop/                          # Electron 桌面端
│   │   ├── src/renderer/src/
│   │   │   ├── pages/
│   │   │   │   ├── index.vue             # 首页（登录/参加码）
│   │   │   │   ├── classroom/            # 教室页面
│   │   │   │   │   ├── smallteacher.vue  # 小班-教师端
│   │   │   │   │   ├── smallstudent.vue  # 小班-学生端
│   │   │   │   │   ├── largeteacher.vue  # 大班-教师端
│   │   │   │   │   └── largestudent.vue  # 大班-学生端
│   │   │   │   └── backstage/            # 后台管理
│   │   │   └── components/
│   │   │       └── ClassRoom/
│   │   │           ├── Small/Video.vue   # 小班视频组件
│   │   │           ├── Small/Chat.vue    # 小班聊天组件
│   │   │           ├── Video.vue         # 大班视频组件
│   │   │           ├── Chat.vue          # 大班聊天组件
│   │   │           └── WhiteBoard.vue    # 白板组件
│   │   ├── .env.example                     # 桌面端环境模板（入库）
│   │   ├── .env.development                 # 开发用，pnpm dev:desktop 读取（不提交）
│   │   └── .env.production                  # 打包用，pnpm build:desktop 读取（不提交）
│   │
│   ├── server/                           # API 网关 (NestJS)
│   │   └── src/
│   │       ├── auth/                     # JWT 认证模块
│   │       ├── users/                    # 用户模块
│   │       ├── live/                     # 直播模块（房间 CRUD + 录制下载）
│   │       ├── gateway/                  # WebSocket Chat Gateway
│   │       ├── janus/                    # Janus HTTP API 客户端
│   │       ├── upload/                   # 文件上传（图片/PPT）
│   │       └── common/                   # 公共模块（拦截器/守卫/装饰器）
│   │
│   ├── auth-service/                     # 认证微服务 (gRPC :50051)
│   ├── live-service/                     # 直播微服务 (gRPC :50052)
│   ├── chat-ws-service/                  # 聊天 WebSocket (:50054)
│   ├── yjs-ws-service/                   # 白板 WebSocket (:50055)
│   └── mail-service/                     # 邮件微服务 (gRPC :50053)
│
├── packages/
│   ├── config/                           # 前端环境变量配置
│   ├── http/                             # Axios 请求封装 + 拦截器
│   ├── ipc/                              # Electron IPC 通信
│   ├── types/                            # TypeScript 类型定义
│   ├── utils/                            # 通用工具函数
│   ├── validation/                       # 表单校验规则
│   └── shared/                           # 共享代码
│
├── init/                               # Docker 部署（Janus + PostgreSQL + Redis）
│   ├── Dockerfile                      # 多阶段构建 Janus 镜像
│   ├── docker-compose.yml              # 容器编排
│   ├── entrypoint.sh                   # 启动脚本（生成 Janus 配置）
│   ├── .env.example                    # Docker 环境变量模板
│   └── yunyan-live-download/           # 安装包下载/自动更新静态站（nginx :8080）
│       ├── docker-compose.yml
│       ├── nginx.conf
│       └── dist/{win,mac,linux}/       # 更新目录（.gitkeep 占位，二进制不入库）
│
├── package.json                          # 根 package.json（pnpm workspace）
├── pnpm-workspace.yaml                   # pnpm 工作区配置
└── turbo.json                            # Turborepo 任务配置
```

## 环境要求

- **Node.js** >= 24.13.0
- **pnpm** >= 10.28.2
- **Docker** >= 20.10 + Docker Compose >= 2.0（运行 Janus + PostgreSQL + Redis）
- **Windows** 10/11（桌面端开发）
- **LibreOffice + 中文字体**（PPT 课件转 PDF 功能依赖）

### PPT 转 PDF 依赖（LibreOffice + 字体）

PPT 上传转换管线：LibreOffice 直接转 PDF，前端用 pdf.js 按页渲染（无需 poppler/pdftoppm）。

**Windows：**

1. 下载安装 [LibreOffice](https://www.libreoffice.org/download/download/)
2. 默认安装路径：`C:\Program Files\LibreOffice\program\soffice.exe`
3. 如果安装在非默认路径，在 `apps/server/.env` 中配置：
   ```
   SOFFICE_PATH=D:\your\custom\path\soffice.exe
   ```

**Linux (Ubuntu)：**

```bash
sudo apt update
sudo apt install libreoffice-impress fonts-noto-cjk fonts-liberation
fc-cache -f   # 刷新 fontconfig 缓存
```

- **必须是 `libreoffice-impress` 而非 `libreoffice-core`**：core-only 安装缺 Impress 导入过滤器
  `libsdlo.so`，任何 ppt 都会报 `source file could not be loaded`（转换接口返回 `convertError.stage=convert`）
- `fonts-noto-cjk` **必需**：服务器缺少中文字体时，转换出的 PDF 中文会全部变成豆腐块（乱码）
- `fonts-liberation`：西文度量兼容字体（最小字体集）

验证安装：

```bash
soffice --version
fc-list :lang=zh | head -3 # 应能看到 Noto Sans CJK 等中文字体
```

> Linux 下 `soffice` 可能不在 `PATH`（`command -v soffice` 找不到但 `/usr/bin/libreoffice` 存在），
> 请在 `apps/server/.env` 配置 `SOFFICE_PATH=/usr/bin/libreoffice`。

> **升级 LibreOffice 前须跑保真样例集回归**（`COURSEWARE_FIDELITY=1`，见
> `apps/server/test/fixtures/courseware/README.md`；该回归另需 `poppler-utils`，
> 与"生产转换链路无需 poppler"不矛盾——poppler 仅回归比对用）。
> 课件指定的小众字体未安装时会近似替换，属预期，不承诺保真。

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
# 复制各服务的环境变量模板（.env.example → .env）
cp apps/server/.env.example           apps/server/.env
cp apps/auth-service/.env.example     apps/auth-service/.env
cp apps/live-service/.env.example     apps/live-service/.env
cp apps/mail-service/.env.example     apps/mail-service/.env
cp apps/chat-ws-service/.env.example  apps/chat-ws-service/.env
cp apps/yjs-ws-service/.env.example   apps/yjs-ws-service/.env
cp apps/desktop/.env.example          apps/desktop/.env.development
cp apps/desktop/.env.example          apps/desktop/.env.production   # 仅 pnpm build 打包时需要
cp init/.env.example                  init/.env

# 按需编辑，填入你的服务器地址与密钥（各 .env 均已被 gitignore）

# 生成密码加密密钥对（首次或轮换时执行一次）
pnpm gen:keys --write-env   # RSA-2048：公钥内置桌面端，私钥写入 apps/auth-service/.env
```

**密钥分发（服务端与桌面端不在同一台机器时）**

公钥随代码走：`passwordPublicKey.ts` 已入库，桌面端零配置。私钥只放运行 `auth-service` 的机器。
典型场景：服务端部署在 VM/远程 Ubuntu，本地执行 `pnpm dev:desktop`：

1. 本地 `.env` 中 `PASSWORD_PRIVATE_KEY=...` 整行复制到 **VM 的 `apps/auth-service/.env`**
   （scp 或手动粘贴，禁止提交 git），然后在 VM 重启 auth-service。
2. 验证：桌面端登录一次——返回 `用户不存在` / `密码错误` / 登录成功即密钥匹配；
   返回 `密码解密失败，请使用最新版客户端重试` 说明私钥与桌面端公钥不匹配。

> **不要在 VM 上执行 `pnpm gen:keys --force`**：会覆盖已提交的公钥文件，导致所有桌面端失配。
> 轮换流程：本地 `pnpm gen:keys --force --write-env` → 新私钥同步到 VM `.env` → 提交新公钥 → 重启服务。

前端环境变量示例：

```bash
# Nest.js Server API
VITE_USER_API=http://192.168.x.x:3001/user
VITE_LIVE_API=http://192.168.x.x:3001/live

# WebSocket Chat
VITE_MESSAGE_WS=ws://192.168.x.x:50054

# Yjs 白板 WebSocket
VITE_YJS_WS=ws://192.168.x.x:50055

# Janus WebSocket 信令
VITE_LIVE_SERVER=ws://192.168.x.x:8188/janus

# 文件上传
VITE_UPLOAD_IMAGE_URL=http://192.168.x.x:3001/upload/image
VITE_UPLOAD_PPT_URL=http://192.168.x.x:3001/upload/ppt
```

桌面端（`apps/desktop/`）有两个环境文件，`electron-vite` 按运行模式自动加载，无需手动指定；
两者都由 `.env.example` 复制而来，键完全一致，只是填入的地址不同：

| 文件                 | 触发命令                                                               | 用途                             |
| -------------------- | ---------------------------------------------------------------------- | -------------------------------- |
| `.env.development` | `pnpm dev:desktop`（mode=development）                               | 日常开发，指向本地/内网服务      |
| `.env.production`  | `pnpm build:desktop` / `pnpm build:desktop:win`（mode=production） | 打包进产物的地址，指向生产服务器 |

覆盖规则（优先级从高到低）：`.env.[mode].local` > `.env.[mode]` > `.env.local` > `.env`。
除 `.env.example` 外均已 gitignore，可放心填真实地址。

### 3. 启动 Docker 服务

```bash
cd init

# 首次启动会自动建表（直载 db/schema-baseline.sql）
docker compose up -d --build

# 查看 PostgreSQL 日志，确认表已创建
docker logs yunyan-live-postgres --tail 20
```

数据库初始化说明：

- PostgreSQL 容器首次启动时，直载 `db/schema-baseline.sql` 创建 14 张表（与 CI schema 门禁同一事实源）
- 已有数据的容器不会重复执行（`pgdata` 卷存在时跳过）
- 重置数据库：`docker compose down -v && docker compose up -d`

### 4. 启动开发环境

```bash
# 回到项目根目录
cd ..

# 同时启动 Server + Desktop
pnpm dev:all

# 或分别启动
pnpm dev:server    # 所有后端服务 (Gateway + 微服务)
pnpm dev:desktop   # Electron 桌面端
```

### 5. 注册账号

打开桌面端 → 注册页面 → 输入邮箱、用户名、密码 → 选择角色（老师/学生）→ 注册成功后自动登录。

## 架构

```
┌─────────────────────────────────────────────────────────┐
│  Docker                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │ PostgreSQL   │ │ Redis        │ │ Janus Gateway    │ │
│  │ :15432       │ │ :16379       │ │ :8188 (WS)       │ │
│  │              │ │              │ │ :8088 (HTTP API) │ │
│  │              │ │              │ │ :20000-20100/UDP │ │
│  └──────────────┘ └──────────────┘ └──────────────────┘ │
│  录制文件: /home/janus/recordings                        │
└─────────────────────────────────────────────────────────┘
         ↑                              ↑
         │ TCP                          │ WebSocket + HTTP
         ↓                              ↓
┌─────────────────────────────────────────────────────────┐
│  Server (后端服务)                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Gateway  │ │ Auth     │ │ Live     │ │ Mail     │   │
│  │ :3001    │ │ gRPC     │ │ gRPC     │ │ gRPC     │   │
│  │ HTTP API │ │ :50051   │ │ :50052   │ │ :50053   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│  ┌──────────┐ ┌──────────┐                              │
│  │ Chat WS  │ │ Yjs WS   │                              │
│  │ :50054   │ │ :50055   │                              │
│  └──────────┘ └──────────┘                              │
└─────────────────────────────────────────────────────────┘
         ↑
         │
         ↓
┌─────────────────────────────────────────────────────────┐
│  Desktop (Electron)                                      │
│  Vue 3 + Element Plus + Janus Client                     │
└─────────────────────────────────────────────────────────┘
```

## Docker 部署

### 启动容器

```bash
cd init

# 构建并启动
docker compose up -d --build

# 查看状态
docker compose ps

# 查看日志
docker logs janus-gateway --tail 20
docker logs yunyan-live-postgres --tail 20
docker logs yunyan-live-redis --tail 20
```

### 数据库自动初始化

PostgreSQL 容器使用 `/docker-entrypoint-initdb.d/` 机制：

- 首次启动时自动执行挂载的 `db/schema-baseline.sql`，创建 14 张表
- 通过 `docker-compose.yml` 中的 volume 挂载实现：
  ```yaml
  volumes:
    - pgdata:/var/lib/postgresql/data
    - ../db/schema-baseline.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
  ```

**重置数据库**（删除所有数据并重新建表）：

```bash
cd init
docker compose down -v    # 删除数据卷
docker compose up -d      # 重新启动，自动执行 schema-baseline.sql
```

**存量数据库升级（唯一入口 = 迁移 runner，GAP-S9a）**：全新库由 baseline 直载建表后登记；
已有 schema 且无迁移记录的库（如现网首次纳入）先登记再升级：

```bash
pnpm db:migrate:status                                       # 查看待办/登记状态
node scripts/db-migrate.mjs --baseline                       # 既有 schema：只登记，不执行 DDL
pnpm db:migrate                                              # 应用 db/migrations/ 下全部待办
```

机制、规则与新增迁移 SOP 见 [`db/README.md`](db/README.md)。
`apps/*/src/migrations/` 已封存——**禁止**再手工执行 SQL，新表/新列一律走
`db/migrations/` 并同步更新 `db/schema-baseline.sql`（CI schema diff 门禁强制）。

> **备份基线**：PostgreSQL 日备、文件级备份与恢复演练脚本已入库
> （`scripts/backup-postgres.sh` / `scripts/backup-files.sh` / `scripts/restore-drill.sh`），
> 部署机需配置 cron，见下方「备份与恢复」。恢复演练记录存档于
> [`docs/research/drills/restore-drill-record.md`](docs/research/drills/restore-drill-record.md)。

### 验证服务

```bash
# PostgreSQL
docker exec yunyan-live-postgres pg_isready -U postgres

# Redis
docker exec yunyan-live-redis redis-cli ping

# Janus WebSocket（需要 websocat）
echo '{"janus":"keepalive","transaction":"test1"}' \
  | websocat --one-message ws://localhost:8188/janus

# Janus HTTP API
curl http://localhost:8088/janus/info
```

### 停止容器

```bash
cd init
docker compose down          # 停止容器
docker compose down -v       # 停止并删除数据卷（含数据库数据）
```

### 备份与恢复

基线目标：RPO ≤ 1 天（日备起步，后续可升 WAL 归档 PITR）、RTO ≤ 1h（恢复演练保障）。

| 覆盖面           | 方案                                                                            |
| ---------------- | ------------------------------------------------------------------------------- |
| PostgreSQL       | `scripts/backup-postgres.sh`（pg_dump -Fc，默认保留 7 天）                      |
| RabbitMQ 数据卷  | `scripts/backup-files.sh`（docker 卷 → tar.gz）                                 |
| Janus 录像       | `scripts/backup-files.sh`（`RECORDINGS_DIR` 默认 `/home/janus/recordings`）     |
| 课件/图片落盘    | `scripts/backup-files.sh`（`UPLOADS_DIR` 默认 `apps/server/uploads`）           |
| 恢复演练         | `scripts/restore-drill.sh`（一次性容器导入 + 冒烟查询，**每月必跑**）           |
| Redis            | AOF 已开（`appendonly everysec`），卷级归档即可                                 |
| 加密             | 两个备份脚本均支持 `BACKUP_PASSPHRASE` → `openssl aes-256-cbc`（.enc 产物）      |

部署机 cron 示例（每日 03:00 PG 备份、03:30 文件备份、每月 1 日 04:00 演练）：

```bash
0 3 * * *  BACKUP_PASSPHRASE=$(cat /root/yunyan-backup.key) /path/to/yunyan-live/scripts/backup-postgres.sh /var/backups/yunyan-live
30 3 * * * BACKUP_PASSPHRASE=$(cat /root/yunyan-backup.key) RECORDINGS_DIR=/home/janus/recordings /path/to/yunyan-live/scripts/backup-files.sh /var/backups/yunyan-live
0 4 1 * *  /path/to/yunyan-live/scripts/restore-drill.sh "$(ls -t /var/backups/yunyan-live/pg-yunyan_live-*.dump* | head -1)"
```

> 恢复演练失败 = 备份无效。演练记录（日期/备份文件/表数/结论）**追加存档至
> `docs/research/drills/restore-drill-record.md`**（只增不删）；首条记录：2026-10-17 PASS。

**异地/对象存储推送（待部署机配置，本机无凭据）**：

- [ ] 提供对象存储桶（S3/OSS/COS 均可）+ 凭据，写入部署机 `/root/.yunyan-backup.env`（权限 600，不入库）
- [ ] 备份脚本尾部追加 `aws s3 cp`（或 rclone）推送 `.dump.enc` / `.tar.gz.enc`
- [ ] 配置跨区域复制或桶版本化；本机磁盘水位告警（两脚本已输出 `WARN` 行）接入监控
- [ ] 密钥文件丢失 = 备份不可用；密钥须异地保存（与桶凭据分离）

### Docker 环境变量

在 `init/.env` 中配置：

| 变量               | 默认值                | 说明                               |
| ------------------ | --------------------- | ---------------------------------- |
| `GATEWAY_IP`     | `0.0.0.0`           | Janus 绑定 IP（需改为 VM 实际 IP） |
| `STUN_SERVER`    | `stun.l.google.com` | STUN 服务器（NAT 穿透）            |
| `STUN_PORT`      | `19302`             | STUN 端口                          |
| `RTP_PORT_RANGE` | `20000-20100`       | RTP 媒体流端口范围                 |
| `POSTGRES_PASSWORD` | 回退 `postgres`  | PostgreSQL 口令；生产部署务必覆盖（仅 pgdata 卷首次初始化生效） |
| `UPLOAD_SIGNING_SECRET` | 进程随机（失效） | server `/uploads` 读取签名密钥（≥16 字符）；部署机用 `openssl rand -hex 32` 生成持久值，缺失则重启后历史上传 URL 全部 404 |

## 端口说明

| 端口        | 协议      | 用途                                 | 绑定           |
| ----------- | --------- | ------------------------------------ | -------------- |
| 3001        | TCP       | Gateway HTTP API                     | 全接口         |
| 8080        | TCP       | 安装包下载/自动更新静态站（nginx）   | 全接口         |
| 15432       | TCP       | PostgreSQL 数据库（compose 发布口）   | 仅本机         |
| 16379       | TCP       | Redis 缓存（compose 发布口）         | 仅本机         |
| 5672        | TCP       | RabbitMQ AMQP（仅 127.0.0.1 绑定）   | 仅本机         |
| 15672       | TCP       | RabbitMQ 管理台（仅 127.0.0.1 绑定） | 仅本机         |
| 8088        | TCP       | Janus HTTP API（录制控制）           | 全接口         |
| 8188        | WebSocket | Janus 信令（WebRTC 连接）            | 全接口         |
| 50051       | gRPC      | Auth Service（认证）                 | 仅本机（默认） |
| 50052       | gRPC      | Live Service（直播）                 | 仅本机（默认） |
| 50053       | gRPC      | Mail Service（邮件）                 | 仅本机（默认） |
| 50054       | WebSocket | Chat WS Service（聊天）              | 全接口         |
| 50055       | WebSocket | Yjs WS Service（白板）               | 全接口         |
| 20000-20100 | UDP       | RTP/RTCP 媒体流                      | 全接口         |

> gRPC 服务默认仅绑 `127.0.0.1`（各服务 `GRPC_HOST` 可覆盖，容器化部署时设 `0.0.0.0`）；
> PostgreSQL/Redis 端口由 compose 绑定 `127.0.0.1`，勿发布到公网。

## 环境变量配置

### Server (`apps/server/.env`)

```bash
DATABASE_URL=postgres://postgres:postgres@192.168.x.x:15432/yunyan_live
JWT_SECRET=<your-jwt-secret>
JWT_EXPIRES_IN=7d
JANUS_URL=http://192.168.x.x:8088
SERVER_PORT=3001
RECORDINGS_DIR=/home/janus/recordings
BASE_URL=http://192.168.x.x:3001

# Redis
REDIS_HOST=192.168.x.x
REDIS_PORT=16379

# LibreOffice (PPT to PDF conversion)
SOFFICE_PATH=/usr/bin/libreoffice

# SMTP
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=your-email@qq.com
SMTP_PASS=your-smtp-password
SMTP_FROM=云砚直播 <your-email@qq.com>
```

### Live Service (`apps/live-service/.env`)

```bash
DATABASE_URL=postgres://postgres:postgres@192.168.x.x:15432/yunyan_live
JANUS_URL=http://192.168.x.x:8088
GRPC_PORT=50052
```

### Desktop (`apps/desktop/.env.development` / `.env.production`)

两个文件键完全相同（均由 `.env.example` 复制）：开发用 `.env.development` 填内网地址，
打包用 `.env.production` 填生产地址 —— 改哪份就影响对应命令的产物。

```bash
VITE_USER_API=http://192.168.x.x:3001/user
VITE_LIVE_API=http://192.168.x.x:3001/live
VITE_MESSAGE_WS=ws://192.168.x.x:50054
VITE_YJS_WS=ws://192.168.x.x:50055
VITE_LIVE_SERVER=ws://192.168.x.x:8188/janus
VITE_UPLOAD_IMAGE_URL=http://192.168.x.x:3001/upload/image
VITE_UPLOAD_PPT_URL=http://192.168.x.x:3001/upload/ppt
```

## API 接口

### 用户模块 (`/user`)

| 方法 | 路径                           | 说明                 | 鉴权 |
| ---- | ------------------------------ | -------------------- | ---- |
| POST | `/user/user/login`          | 用户登录             | 否   |
| POST | `/user/user/register`       | 用户注册             | 否   |
| POST | `/user/user/logout`         | 用户登出             | JWT  |
| POST | `/user/user/resetPassword`  | 重置密码（邮箱验证码） | 否   |
| POST | `/user/user/changePassword` | 修改密码             | JWT  |
| GET  | `/user/user/getUserMsg`     | 获取用户信息         | JWT  |
| POST | `/user/user/updateUserName` | 修改用户名           | JWT  |
| GET  | `/user/user/getNowTime`     | 获取服务器时间       | 否   |

### 直播模块 (`/live`)

> 除 `showRoomInfo` 外均为 JWT 鉴权；完整接口清单（含签到/转让/课件/板书快照/观看时长等）
> 见 `docs/apis/server/live.md` 与 `docs/apis/server/checkin.md`。

| 方法   | 路径                                   | 说明               | 鉴权 |
| ------ | -------------------------------------- | ------------------ | ---- |
| POST   | `/live/liveInfo/createLive`          | 创建直播           | JWT  |
| POST   | `/live/liveInfo/joinLive`            | 加入直播（参加码） | JWT  |
| GET    | `/live/liveInfo/showRoomInfo`        | 获取房间信息       | 否   |
| PUT    | `/live/liveInfo/changeLiveStatus`    | 修改直播状态       | JWT  |
| POST   | `/live/liveInfo/cmsLiveList`         | 直播列表           | JWT  |
| GET    | `/live/liveInfo/cmsLiveDetail`       | 直播详情           | JWT  |
| DELETE | `/live/liveInfo/deleteLive`          | 删除直播           | JWT  |
| PUT    | `/live/liveInfo/updateLiveCode`      | 更新参加码         | JWT  |
| GET    | `/live/liveInfo/studentRooms`        | 学生的直播房间列表 | JWT  |
| GET    | `/live/liveInfo/videoList`           | 录制列表           | JWT  |
| GET    | `/live/liveInfo/videoDetail`         | 录制详情           | JWT  |
| DELETE | `/live/liveInfo/deleteVideo`         | 删除录制           | JWT  |
| DELETE | `/live/liveInfo/deleteVideoByIds`    | 批量删除录制       | JWT  |
| GET    | `/live/liveInfo/downloadRecording/:id`               | 检查下载状态       | JWT  |
| GET    | `/live/liveInfo/downloadRecording/:id?download=true` | 下载 MP4 文件      | JWT  |

下载状态码：

| code | 含义               |
| ---- | ------------------ |
| 1000 | 转码完成，可以下载 |
| 2002 | 转码中，请稍后     |

### WebSocket Chat (`/socket`)

| 消息类型            | 方向           | 说明                               |
| ------------------- | -------------- | ---------------------------------- |
| `ping` / `pong` | 双向           | 心跳保活                           |
| `msg`             | 服务端→客户端 | 在线人数                           |
| `bullet`          | 双向           | 聊天弹幕                           |
| `whiteBoard`      | 双向           | 白板数据同步                       |
| `getwhiteBoard`   | 客户端→服务端 | 获取白板历史                       |
| `getWhiteBoard`   | 服务端→客户端 | 白板历史数据                       |
| `over`            | 双向           | 结束消息                           |
| `live_started`    | 双向           | 教师开播通知（触发学生重连 Janus） |

### 直播状态

| 状态码 | 含义             |
| ------ | ---------------- |
| 1      | 已创建（未开始） |
| 2      | 直播中           |
| 3      | 已结束           |
| 4      | 暂停             |

## 录制下载

### 工作流程

1. 教师直播时开启录制 → Janus 将 RTP 包写入 `.mjr` 文件
2. 直播结束后 → `.mjr` 文件保存到 `/home/janus/recordings/`
3. 教师点击下载 → 后端启动异步转码：
   - `.mjr` → `.webm`（janus-pp-rec，VP8 视频）
   - `.mjr` → `.opus`（janus-pp-rec，Opus 音频）
   - `.webm` + `.opus` → `.mp4`（FFmpeg，VP8→H.264 + Opus→AAC）
4. 转码完成后 → 前端下载 MP4 文件

### 文件格式

Janus 录制文件命名：

- `rec-{id}-video.mjr` — VP8 视频流
- `rec-{id}-audio.mjr` — Opus 音频流
- `{id}.nfo` — 元数据 (JSON)

转码后生成：

- `{id}.mp4` — H.264 + AAC (MP4 容器)

### 环境变量

| 变量                | 说明                   | 默认值                          |
| ------------------- | ---------------------- | ------------------------------- |
| `RECORDINGS_DIR`  | 宿主机录制目录         | `/home/janus/recordings`      |
| `JANUS_CONTAINER` | Janus 容器名           | `janus-gateway`               |
| `JANUS_PP_REC`    | janus-pp-rec 路径      | `/opt/janus/bin/janus-pp-rec` |
| `BASE_URL`        | 服务器地址（上传回调） | `http://localhost:3001`       |

## 可用脚本

在项目根目录执行：

| 命令                       | 说明                       |
| -------------------------- | -------------------------- |
| `pnpm dev`               | 启动所有包的开发模式       |
| `pnpm dev:desktop`       | 仅启动 Electron 桌面端     |
| `pnpm dev:server`        | 仅启动 Nest.js 后端        |
| `pnpm dev:all`           | 同时启动 Server + Desktop  |
| `pnpm build`             | 构建所有包                 |
| `pnpm build:desktop`     | 仅构建桌面端               |
| `pnpm build:desktop:win` | 构建 + 打包 Windows 安装包 |
| `pnpm typecheck`         | TypeScript 类型检查        |
| `pnpm lint`              | ESLint 代码检查            |
| `pnpm test`              | 运行所有测试               |
| `pnpm test:desktop`      | 运行桌面端测试             |
| `pnpm format`            | Prettier 格式化代码        |

在 `apps/desktop` 目录下：

| 命令                 | 说明                |
| -------------------- | ------------------- |
| `pnpm build:win`   | 打包 Windows 安装包 |
| `pnpm build:mac`   | 打包 macOS 安装包   |
| `pnpm build:linux` | 打包 Linux 安装包   |

## 直播流程

1. **教师创建直播** → 后端生成房间 + 参加码 → Janus 创建 VideoRoom + TextRoom
2. **学生输入参加码** → 后端匹配房间 → 进入教室页面
3. **教师开播** → Janus `exists()` 检查 → `createRoom()` → VideoRoom 推流
4. **学生加入** → Janus `exists()` 检查 → `joinRoom('subscriber')` → 订阅视频流
5. **聊天/白板** → 通过 WebSocket Chat Gateway 实时同步
6. **直播结束** → 录制文件保存 → 教师可下载 MP4

## Janus 插件

| 插件                        | 用途                    |
| --------------------------- | ----------------------- |
| `janus.plugin.videoroom`  | 音视频房间（推流/拉流） |
| `janus.plugin.textroom`   | 文字聊天/数据通道       |
| `janus.plugin.recordplay` | 录制回放                |
| `janus.plugin.echotest`   | 回声测试                |
| `janus.plugin.streaming`  | 流媒体广播              |

## 贡献

欢迎提交 Issue 与 Pull Request！提交前请阅读 [贡献指南](CONTRIBUTING.md)。

## 安全

请勿通过公开 Issue 报告安全漏洞，参见 [安全政策](SECURITY.md)。

## 许可证

本项目基于 [MIT License](LICENSE) 开源。第三方组件许可声明见 [NOTICE](NOTICE)。
