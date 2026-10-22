# Yunyan Live (云砚直播)

[![CI](https://github.com/Lateautumn00/yunyan-live/actions/workflows/ci.yml/badge.svg)](https://github.com/Lateautumn00/yunyan-live/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24.13.0-brightgreen.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D10.28.2-orange.svg)](https://pnpm.io/)
[![Platform](https://img.shields.io/badge/platform-Win%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()

**English** | [简体中文](README.md)

> An open-source online live-teaching platform built with Electron + Vue 3 + Nest.js + Janus WebRTC. Fully self-hosted — spin up your own online classroom with one Docker command.

## Highlights

- 🎥 **Live teaching for large & small classes** — Janus WebRTC-based; teachers publish streams, students subscribe in real time
- 📝 **Real-time collaborative whiteboard** — Yjs + y-websocket sync across clients, with shapes, freehand smoothing, and STEM tools (math / chemistry / circuit / molecule)
- 📊 **PPT courseware sharing** — LibreOffice converts uploads to PDF, rendered page-by-page with pdf.js; media library, screenshots, and board-notes export included
- 📼 **Recording & playback** — Janus recordings are transcoded to MP4; manage, watch replays, and download from the admin console
- 🛡️ **Classroom moderation** — chat mute / kick / message recall / word filtering, with a full-chain audit log
- 📈 **Monitoring & alerting** — Prometheus + Alertmanager + node-exporter out of the box, first batch of 8 alert rules
- 🏗️ **Fully self-hosted** — Docker Compose boots PostgreSQL / Redis / RabbitMQ / Janus; your data never leaves your server
- 💻 **Cross-platform desktop** — Electron apps for Windows / macOS / Linux with electron-updater auto-update
- 🔧 **Microservice backend** — NestJS gateway + gRPC services (auth / live / mail / chat / whiteboard), all TypeScript

## Screenshots

| Admin console | Classroom (courseware mode) |
| ------------- | --------------------------- |
| ![Admin console](docs/assets/screenshot-admin.png) | ![Classroom courseware](docs/assets/screenshot-classroom.png) |

**Courseware tools**: media library, upload image, screenshot, my courseware, export board notes

![Courseware tools](docs/assets/screenshot-courseware-menu.png)

## Tech Stack

| Layer      | Tech                                                                       |
| ---------- | -------------------------------------------------------------------------- |
| Desktop    | Electron, Vue 3, Vite, Element Plus, Pinia, Konva (whiteboard)             |
| Backend    | Nest.js, TypeORM, PostgreSQL, WebSocket (ws), LibreOffice (PPT conversion) |
| Microservices | gRPC (auth/live/mail), Redis (cache), FFmpeg (transcoding)              |
| WebRTC     | Janus Gateway (Docker), janus-pp-rec (recording post-processing)           |
| Toolchain  | pnpm, Turborepo, TypeScript, ESLint, Prettier, Husky, Commitlint           |
| Deployment | Docker Compose                                                              |

## Requirements

- **Node.js** >= 24.13.0
- **pnpm** >= 10.28.2
- **Docker** >= 20.10 + Docker Compose >= 2.0 (Janus + PostgreSQL + Redis)
- **LibreOffice + CJK fonts** (required for PPT → PDF courseware conversion)

### PPT to PDF dependency (LibreOffice + fonts)

The upload pipeline converts PPT to PDF with LibreOffice; the desktop app renders the PDF page-by-page with pdf.js (no poppler/pdftoppm needed in production).

**Windows:**

1. Install [LibreOffice](https://www.libreoffice.org/download/download/)
2. Default path: `C:\Program Files\LibreOffice\program\soffice.exe`
3. If installed elsewhere, set in `apps/server/.env`:
   ```
   SOFFICE_PATH=D:\your\custom\path\soffice.exe
   ```

**Linux (Ubuntu):**

```bash
sudo apt update
sudo apt install libreoffice-impress fonts-noto-cjk fonts-liberation
fc-cache -f   # refresh fontconfig cache
```

- **It must be `libreoffice-impress`, not `libreoffice-core`**: a core-only install lacks the Impress import filter `libsdlo.so` and every PPT fails with `source file could not be loaded`
- `fonts-noto-cjk` is **required**: without CJK fonts, Chinese text renders as tofu boxes
- `fonts-liberation`: metric-compatible Latin fonts (minimal set)

Verify:

```bash
soffice --version
fc-list :lang=zh | head -3 # should list Noto Sans CJK etc.
```

> On Linux, `soffice` may not be on `PATH`; set `SOFFICE_PATH=/usr/bin/libreoffice` in `apps/server/.env`.

> **Run the courseware fidelity regression before upgrading LibreOffice**
> (`COURSEWARE_FIDELITY=1`, see `apps/server/test/fixtures/courseware/README.md`;
> it additionally needs `poppler-utils` for comparison only). Niche fonts referenced by
> a deck may be approximated — expected behavior, full fidelity is not guaranteed.

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

```bash
# Copy each service's env template (.env.example → .env)
cp apps/server/.env.example           apps/server/.env
cp apps/auth-service/.env.example     apps/auth-service/.env
cp apps/live-service/.env.example     apps/live-service/.env
cp apps/mail-service/.env.example     apps/mail-service/.env
cp apps/chat-ws-service/.env.example  apps/chat-ws-service/.env
cp apps/yjs-ws-service/.env.example   apps/yjs-ws-service/.env
cp apps/desktop/.env.example          apps/desktop/.env.development
cp apps/desktop/.env.example          apps/desktop/.env.production   # only needed for pnpm build
cp init/.env.example                  init/.env

# Edit as needed — server addresses and secrets (all .env files are gitignored)

# init/.env has two required values (compose enforces them with :?; leaving them
# empty makes `docker compose up` fail immediately)
# Generate: openssl rand -hex 32
#   RABBITMQ_PASSWORD=    # chat persistence queue credentials
#   GRPC_SHARED_SECRET=   # shared HMAC identity-signing secret for the five gRPC services

# Generate the password encryption key pair (once, or on rotation)
pnpm gen:keys --write-env   # RSA-2048: public key ships with the desktop app, private key goes to apps/auth-service/.env
```

**Key distribution (when server and desktop run on different machines)**

The public key ships with the code (`passwordPublicKey.ts` is committed; the desktop app needs zero config).
The private key must only live on the machine running `auth-service`. Typical setup: server on a remote VM, desktop developed locally:

1. Copy the `PASSWORD_PRIVATE_KEY=...` line from your local `.env` into the VM's `apps/auth-service/.env`
   (scp or paste manually; never commit it), then restart auth-service on the VM.
2. Verify: log in once from the desktop app — `user not found` / `wrong password` / success means keys match;
   `password decryption failed, please update the client` means the private key does not match the desktop public key.

> **Do NOT run `pnpm gen:keys --force` on the VM**: it overwrites the committed public key and breaks every desktop client.
> Rotation flow: run `pnpm gen:keys --force --write-env` locally → sync the new private key to the VM `.env` → commit the new public key → restart services.

Frontend env example:

```bash
# Nest.js Server API
VITE_USER_API=http://192.168.x.x:3001/user
VITE_LIVE_API=http://192.168.x.x:3001/live

# WebSocket Chat
VITE_MESSAGE_WS=ws://192.168.x.x:50054

# Yjs whiteboard WebSocket
VITE_YJS_WS=ws://192.168.x.x:50055

# Janus WebSocket signaling
VITE_LIVE_SERVER=ws://192.168.x.x:8188/janus

# File upload
VITE_UPLOAD_IMAGE_URL=http://192.168.x.x:3001/upload/image
VITE_UPLOAD_PPT_URL=http://192.168.x.x:3001/upload/ppt
```

The desktop app (`apps/desktop/`) has two env files; `electron-vite` loads the right one by mode automatically.
Both are copied from `.env.example` with identical keys, just different addresses:

| File               | Triggered by                                                         | Purpose                              |
| ------------------ | -------------------------------------------------------------------- | ------------------------------------ |
| `.env.development` | `pnpm dev:desktop` (mode=development)                               | Daily dev; points to local/intranet  |
| `.env.production`  | `pnpm build:desktop` / `pnpm build:desktop:win` (mode=production) | Addresses baked into packaged builds |

Override precedence (high → low): `.env.[mode].local` > `.env.[mode]` > `.env.local` > `.env`.
Everything except `.env.example` is gitignored — fill in real addresses freely.

### 3. Start Docker services

```bash
cd init

# First start auto-creates tables (loads db/schema-baseline.sql)
# Default profile starts infrastructure + monitoring:
#   PostgreSQL / Redis / RabbitMQ / Janus / Prometheus / Alertmanager / node-exporter
docker compose up -d --build

# The six business services (gateway/auth/live/mail/chat-ws/yjs-ws) additionally
# need --profile app. Note: they share ports with host `pnpm dev`
# (3001/50054/50055/9464-9466) — run one or the other, never both.
# docker compose --profile app up -d --build

# Check PostgreSQL logs to confirm tables were created
docker logs yunyan-live-postgres --tail 20
```

Database init notes:

- On first start, the PostgreSQL container loads `db/schema-baseline.sql` and creates 14 tables (same source of truth as the CI schema gate)
- Existing data volumes are not re-initialized (skipped when the `pgdata` volume exists)
- Reset the database: `docker compose down -v && docker compose up -d`

### 4. Start the dev environment

```bash
# Back to repo root
cd ..

# Server + Desktop together
pnpm dev:all

# Or separately
pnpm dev:server    # all backend services (Gateway + microservices)
pnpm dev:desktop   # Electron desktop app
```

### 5. Register an account

Open the desktop app → register page → email, username, password → pick a role (teacher/student) → auto-login after signup.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Docker                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │ PostgreSQL   │ │ Redis        │ │ RabbitMQ         │ │
│  │ :5432        │ │ :6379        │ │ :5672/:15672     │ │
│  └──────────────┘ └──────────────┘ └──────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │ Janus        │ │ Prometheus   │ │ Alertmanager     │ │
│  │ :8188 (WS)   │ │ :9090        │ │ :9093            │ │
│  │ :8088 (HTTP) │ │              │ │ node-exporter    │ │
│  │ :20000-20100 │ │              │ │ :9100            │ │
│  │  /UDP        │ │              │ │                  │ │
│  └──────────────┘ └──────────────┘ └──────────────────┘ │
│  Recordings: /home/janus/recordings                      │
└─────────────────────────────────────────────────────────┘
         ↑                              ↑
         │ TCP                          │ WebSocket + HTTP
         ↓                              ↓
┌─────────────────────────────────────────────────────────┐
│  Server (backend)                                        │
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

## Docker Deployment

### Start containers

```bash
cd init

# Default: infrastructure + monitoring
# (PostgreSQL / Redis / RabbitMQ / Janus / Prometheus / Alertmanager / node-exporter)
docker compose up -d --build

# Business services containerized (gateway/auth/live/mail/chat-ws/yjs-ws).
# Note: mutually exclusive with host `pnpm dev` on ports 3001/50054/50055/9464-9466.
docker compose --profile app up -d --build

# Status
docker compose ps

# Logs
docker logs janus-gateway --tail 20
docker logs yunyan-live-postgres --tail 20
docker logs yunyan-live-redis --tail 20
```

### Automatic database init

The PostgreSQL container uses `/docker-entrypoint-initdb.d/`:

- On first start it loads the mounted `db/schema-baseline.sql`, creating 14 tables
- Mounted via volumes in `docker-compose.yml`:
  ```yaml
  volumes:
    - pgdata:/var/lib/postgresql/data
    - ../db/schema-baseline.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
  ```

**Reset the database** (wipe all data and recreate tables):

```bash
cd init
docker compose down -v    # delete data volumes
docker compose up -d      # restart; schema-baseline.sql runs again
```

**Upgrading an existing database (the migration runner is the only entry)**: a fresh database is
built straight from the baseline; for an existing schema without migration records (e.g. first-time
enrollment of a production database), register it first, then upgrade:

```bash
pnpm db:migrate:status                                       # inspect pending / registration state
node scripts/db-migrate.mjs --baseline                       # existing schema: register only, no DDL
pnpm db:migrate                                              # apply everything pending under db/migrations/
```

Mechanics, rules, and the SOP for adding new migrations: see [`db/README.md`](db/README.md).
`apps/*/src/migrations/` is sealed — **do not** run SQL from there by hand; new tables/columns must go
through `db/migrations/` with `db/schema-baseline.sql` kept in sync (CI schema diff gate enforces this).

> **Backup baseline**: PostgreSQL daily backups, file-level backups, and restore-drill scripts are in
> the repo (`scripts/backup-postgres.sh` / `scripts/backup-files.sh` / `scripts/restore-drill.sh`);
> configure cron on the deployment host — see "Backup & restore" below. Drill records are archived in
> [`docs/research/drills/restore-drill-record.md`](docs/research/drills/restore-drill-record.md).

### Verify services

```bash
# PostgreSQL
docker exec yunyan-live-postgres pg_isready -U postgres

# Redis
docker exec yunyan-live-redis redis-cli ping

# RabbitMQ health
docker exec yunyan-live-rabbitmq rabbitmq-diagnostics -q ping

# Prometheus / Alertmanager (both loopback-only)
curl http://127.0.0.1:9090/-/healthy
curl http://127.0.0.1:9093/-/healthy

# Janus WebSocket (requires websocat)
echo '{"janus":"keepalive","transaction":"test1"}' \
  | websocat --one-message ws://localhost:8188/janus

# Janus HTTP API
curl http://localhost:8088/janus/info
```

### Stop containers

```bash
cd init
docker compose down          # stop containers
docker compose down -v       # stop and delete data volumes (including DB data)
```

### Backup & restore

Baseline targets: RPO ≤ 1 day (daily backups; WAL-archival PITR later), RTO ≤ 1h (guaranteed by restore drills).

| Coverage           | Solution                                                                           |
| ------------------ | ---------------------------------------------------------------------------------- |
| PostgreSQL         | `scripts/backup-postgres.sh` (pg_dump -Fc, 7-day retention by default)             |
| RabbitMQ volume    | `scripts/backup-files.sh` (docker volume → tar.gz)                                 |
| Janus recordings   | `scripts/backup-files.sh` (`RECORDINGS_DIR`, default `/home/janus/recordings`)     |
| Courseware/uploads | `scripts/backup-files.sh` (`UPLOADS_DIR`, default `apps/server/uploads`)           |
| Restore drill      | `scripts/restore-drill.sh` (one-shot container import + smoke queries, **run monthly**) |
| Redis              | AOF enabled (`appendonly everysec`); volume-level archival is enough               |
| Encryption         | Both backup scripts support `BACKUP_PASSPHRASE` → `openssl aes-256-cbc` (.enc output) |

Example cron on the deployment host (PG backup 03:00 daily, file backup 03:30 daily, drill 04:00 on the 1st of each month):

```bash
0 3 * * *  BACKUP_PASSPHRASE=$(cat /root/yunyan-backup.key) /path/to/yunyan-live/scripts/backup-postgres.sh /var/backups/yunyan-live
30 3 * * * BACKUP_PASSPHRASE=$(cat /root/yunyan-backup.key) RECORDINGS_DIR=/home/janus/recordings /path/to/yunyan-live/scripts/backup-files.sh /var/backups/yunyan-live
0 4 1 * *  /path/to/yunyan-live/scripts/restore-drill.sh "$(ls -t /var/backups/yunyan-live/pg-yunyan_live-*.dump* | head -1)"
```

> A failed restore drill = an invalid backup. Drill records (date / backup file / table count /
> verdict) are **appended to `docs/research/drills/restore-drill-record.md`** (append-only);
> first entry: 2026-10-17 PASS.

> **Offsite / object-storage push (to be configured on the deployment host — no credentials here)**:
>
> - [ ] Provide an object-storage bucket (S3/OSS/COS) + credentials on the deployment host at `/root/.yunyan-backup.env` (mode 600, never committed)
> - [ ] Append `aws s3 cp` (or rclone) at the end of the backup scripts to push `.dump.enc` / `.tar.gz.enc`
> - [ ] Configure cross-region replication or bucket versioning; wire the local disk watermark WARN lines into monitoring
> - [ ] A lost key file = unusable backups; store the key offsite (separate from bucket credentials)

### Docker environment variables

Configure in `init/.env`:

| Variable                 | Default                    | Description                                                                     |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------------- |
| `GATEWAY_IP`             | `0.0.0.0`                  | Janus bind IP (set to your VM's actual IP)                                      |
| `STUN_SERVER`            | `stun.l.google.com`        | STUN server (NAT traversal)                                                     |
| `STUN_PORT`              | `19302`                    | STUN port                                                                       |
| `RTP_PORT_RANGE`         | `20000-20100`              | RTP media port range                                                            |
| `POSTGRES_PASSWORD`      | falls back to `postgres`   | PostgreSQL password; override in production (only takes effect on first pgdata init) |
| `JWT_SECRET`             | falls back to `dev-only-jwt-secret` | JWT signing secret; override in production                             |
| `RABBITMQ_USER` / `RABBITMQ_PASSWORD` | empty (**required**) | Chat-ws persistence queue credentials; compose enforces with `:?`, generate via `openssl rand -hex 32` |
| `GRPC_SHARED_SECRET`     | empty (**required**)       | Shared HMAC identity-signing secret for the five gRPC services; compose enforces with `:?` |

## Ports

| Port        | Protocol  | Purpose                                                      | Bind                             |
| ----------- | --------- | ------------------------------------------------------------ | -------------------------------- |
| 3001        | TCP       | Gateway HTTP API                                             | loopback (compose)               |
| 8080        | TCP       | Installer download / auto-update static site (nginx)         | all interfaces                   |
| 5432        | TCP       | PostgreSQL                                                   | 127.0.0.1 + LAN dual-bind        |
| 6379        | TCP       | Redis                                                        | 127.0.0.1 + LAN dual-bind        |
| 5672        | TCP       | RabbitMQ AMQP (bound to 127.0.0.1)                           | loopback                         |
| 15672       | TCP       | RabbitMQ management UI (127.0.0.1)                           | loopback                         |
| 8088        | TCP       | Janus HTTP API (recording control)                           | all interfaces                   |
| 8188        | WebSocket | Janus signaling (WebRTC)                                     | all interfaces                   |
| 50051       | gRPC      | Auth Service                                                 | loopback (default)               |
| 50052       | gRPC      | Live Service                                                 | loopback (default)               |
| 50053       | gRPC      | Mail Service                                                 | loopback (default)               |
| 50054       | WebSocket | Chat WS Service                                              | loopback (compose)               |
| 50055       | WebSocket | Yjs WS Service (whiteboard)                                  | loopback (compose)               |
| 20000-20100 | UDP       | RTP/RTCP media                                               | all interfaces                   |
| 9090        | TCP       | Prometheus (monitoring)                                      | loopback                         |
| 9093        | TCP       | Alertmanager (alerting)                                      | loopback                         |
| 9100        | TCP       | node-exporter (host metrics)                                 | loopback                         |

> gRPC services bind `127.0.0.1` by default (`GRPC_HOST` overrides; set `0.0.0.0` for containerized deployments).
> PostgreSQL/Redis are dual-bound to `127.0.0.1` + `192.168.2.100` by compose (for cross-machine LAN access; never expose to the public internet).
> Business services (3001/50054/50055) are loopback-only in compose: for cross-machine desktop access, run them via host `pnpm dev`, or add LAN bindings to compose following the pg/redis dual-bind pattern. gRPC metrics ports 9464 (auth) / 9465 (live) / 9466 (mail) are reachable only from host dev or inside the container network — not published to the host.

## Environment Variables

### Server (`apps/server/.env`)

```bash
DATABASE_URL=postgres://postgres:postgres@192.168.x.x:5432/yunyan_live
JWT_SECRET=<your-jwt-secret>
JWT_EXPIRES_IN=7d
JANUS_URL=http://192.168.x.x:8088
SERVER_PORT=3001
RECORDINGS_DIR=/home/janus/recordings
BASE_URL=http://192.168.x.x:3001

# Redis
REDIS_HOST=192.168.x.x
REDIS_PORT=6379

# LibreOffice (PPT to PDF conversion)
SOFFICE_PATH=/usr/bin/libreoffice

# HMAC path-signing secret for /uploads reads (>=16 chars); generate a persistent
# value with `openssl rand -hex 32` on the deployment host. If missing, each restart
# randomizes it and every previously issued upload URL 404s.
UPLOAD_SIGNING_SECRET=

# SMTP
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=your-email@qq.com
SMTP_PASS=your-smtp-password
SMTP_FROM=Yunyan Live <your-email@qq.com>
```

### Live Service (`apps/live-service/.env`)

```bash
DATABASE_URL=postgres://postgres:postgres@192.168.x.x:5432/yunyan_live
JANUS_URL=http://192.168.x.x:8088
GRPC_PORT=50052
```

### Desktop (`apps/desktop/.env.development` / `.env.production`)

Both files share identical keys (copied from `.env.example`): fill `.env.development` with intranet
addresses for development and `.env.production` with production addresses for packaged builds.

```bash
VITE_USER_API=http://192.168.x.x:3001/user
VITE_LIVE_API=http://192.168.x.x:3001/live
VITE_MESSAGE_WS=ws://192.168.x.x:50054
VITE_YJS_WS=ws://192.168.x.x:50055
VITE_LIVE_SERVER=ws://192.168.x.x:8188/janus
VITE_UPLOAD_IMAGE_URL=http://192.168.x.x:3001/upload/image
VITE_UPLOAD_PPT_URL=http://192.168.x.x:3001/upload/ppt
```

## API

### Users (`/user`)

| Method | Path                           | Description                   | Auth |
| ------ | ------------------------------ | ----------------------------- | ---- |
| POST   | `/user/user/login`          | Login                         | No   |
| POST   | `/user/user/register`       | Register                      | No   |
| POST   | `/user/user/logout`         | Logout                        | JWT  |
| POST   | `/user/user/resetPassword`  | Reset password (email code)   | No   |
| POST   | `/user/user/changePassword` | Change password               | JWT  |
| GET    | `/user/user/getUserMsg`     | Get user profile              | JWT  |
| POST   | `/user/user/updateUserName` | Update display name           | JWT  |
| GET    | `/user/user/getNowTime`     | Server time                   | No   |

### Live (`/live`)

> All endpoints require JWT except `showRoomInfo`. The full list (check-in / transfer / courseware /
> board snapshots / watch time, etc.) lives in `docs/apis/server/live.md` and `docs/apis/server/checkin.md`.

| Method | Path                                | Description           | Auth |
| ------ | ----------------------------------- | --------------------- | ---- |
| POST   | `/live/liveInfo/createLive`          | Create live room      | JWT  |
| POST   | `/live/liveInfo/joinLive`            | Join by code          | JWT  |
| GET    | `/live/liveInfo/showRoomInfo`        | Room info             | No   |
| PUT    | `/live/liveInfo/changeLiveStatus`    | Change live status    | JWT  |
| POST   | `/live/liveInfo/cmsLiveList`         | Live list             | JWT  |
| GET    | `/live/liveInfo/cmsLiveDetail`       | Live detail           | JWT  |
| DELETE | `/live/liveInfo/deleteLive`          | Delete live room      | JWT  |
| PUT    | `/live/liveInfo/updateLiveCode`      | Update join code      | JWT  |
| GET    | `/live/liveInfo/studentRooms`        | Student's room list   | JWT  |
| GET    | `/live/liveInfo/videoList`           | Recording list        | JWT  |
| GET    | `/live/liveInfo/videoDetail`         | Recording detail      | JWT  |
| DELETE | `/live/liveInfo/deleteVideo`         | Delete recording      | JWT  |
| DELETE | `/live/liveInfo/deleteVideoByIds`    | Batch delete          | JWT  |
| GET    | `/live/liveInfo/downloadRecording/:id`               | Check download status | JWT  |
| GET    | `/live/liveInfo/downloadRecording/:id?download=true` | Download MP4          | JWT  |

Download status codes:

| code | Meaning                       |
| ---- | ----------------------------- |
| 1000 | Transcoding done, ready       |
| 2002 | Transcoding in progress       |

### WebSocket Chat (`/socket`)

| Message type        | Direction        | Description                                    |
| ------------------- | ---------------- | ---------------------------------------------- |
| `ping` / `pong`     | Bidirectional    | Heartbeat                                      |
| `msg`               | Server → client  | Online count                                   |
| `bullet`            | Bidirectional    | Chat messages                                  |
| `whiteBoard`        | Bidirectional    | Whiteboard sync                                |
| `getwhiteBoard`     | Client → server  | Request whiteboard history                     |
| `getWhiteBoard`     | Server → client  | Whiteboard history payload                     |
| `over`              | Bidirectional    | End message                                    |
| `live_started`      | Bidirectional    | Teacher went live (students reconnect to Janus) |

### Live status

| Code | Meaning                 |
| ---- | ----------------------- |
| 1    | Created (not started)   |
| 2    | Live                    |
| 3    | Ended                   |
| 4    | Paused                  |

## Recording Download

### Workflow

1. Teacher starts recording during the live session → Janus writes RTP packets into `.mjr` files
2. After the session → `.mjr` files live in `/home/janus/recordings/`
3. Teacher clicks download → backend transcodes asynchronously:
   - `.mjr` → `.webm` (janus-pp-rec, VP8 video)
   - `.mjr` → `.opus` (janus-pp-rec, Opus audio)
   - `.webm` + `.opus` → `.mp4` (FFmpeg, VP8→H.264 + Opus→AAC)
4. When done → the client downloads the MP4

### File formats

Janus recording names:

- `rec-{id}-video.mjr` — VP8 video
- `rec-{id}-audio.mjr` — Opus audio
- `{id}.nfo` — metadata (JSON)

After transcoding:

- `{id}.mp4` — H.264 + AAC (MP4 container)

### Environment variables

| Variable          | Description                | Default                         |
| ----------------- | -------------------------- | ------------------------------- |
| `RECORDINGS_DIR`  | Host recordings directory  | `/home/janus/recordings`        |
| `JANUS_CONTAINER` | Janus container name       | `janus-gateway`                 |
| `JANUS_PP_REC`    | janus-pp-rec binary path   | `/opt/janus/bin/janus-pp-rec`   |
| `BASE_URL`        | Server base URL (callbacks) | `http://localhost:3001`        |

## Scripts

Run from the repo root:

| Command                  | Description                          |
| ------------------------ | ------------------------------------ |
| `pnpm dev`               | Dev mode for all packages            |
| `pnpm dev:desktop`       | Electron desktop app only            |
| `pnpm dev:server`        | Nest.js backend only                 |
| `pnpm dev:all`           | Server + Desktop together            |
| `pnpm build`             | Build all packages                   |
| `pnpm build:desktop`     | Build desktop app only               |
| `pnpm build:desktop:win` | Build + package Windows installer    |
| `pnpm typecheck`         | TypeScript type check                |
| `pnpm lint`              | ESLint                               |
| `pnpm test`              | Run all tests                        |
| `pnpm test:desktop`      | Desktop tests                        |
| `pnpm format`            | Prettier format                      |
| `pnpm format:check`      | Prettier format check                |
| `pnpm db:migrate`        | Apply pending database migrations    |
| `pnpm db:migrate:status` | Show migration pending/registration  |
| `pnpm gen:keys`          | Generate password-encryption key pair |
| `pnpm audit:gate`        | Audit-log integrity gate             |

The `scripts/` directory also contains ops shell scripts (backup / restore drills, partition & index
EXPLAIN drills, retention cleanup, etc.) — see each script's header comment and the "Backup & restore" section.

Inside `apps/desktop`:

| Command              | Description               |
| -------------------- | ------------------------- |
| `pnpm build:win`     | Package Windows installer |
| `pnpm build:mac`     | Package macOS installer   |
| `pnpm build:linux`   | Package Linux installer   |

## Live Session Flow

1. **Teacher creates a live room** → backend generates room + join code → Janus creates VideoRoom + TextRoom
2. **Student enters the join code** → backend matches the room → classroom page opens
3. **Teacher starts streaming** → Janus `exists()` check → `createRoom()` → VideoRoom publish
4. **Student joins** → Janus `exists()` check → `joinRoom('subscriber')` → subscribe to streams
5. **Chat / whiteboard** → real-time sync via the WebSocket Chat Gateway
6. **Session ends** → recording saved → teacher can download the MP4

## Janus Plugins

| Plugin                      | Purpose                          |
| --------------------------- | -------------------------------- |
| `janus.plugin.videoroom`    | Audio/video rooms (publish/sub)  |
| `janus.plugin.textroom`     | Text chat / data channels        |
| `janus.plugin.recordplay`   | Recording playback               |
| `janus.plugin.echotest`     | Echo test                        |
| `janus.plugin.streaming`    | Streaming broadcast              |

## Contributing

Issues and pull requests are welcome! Please read the [Contributing Guide](CONTRIBUTING.md) first.

## Security

Please do not report security vulnerabilities via public issues — see the [Security Policy](SECURITY.md).

## License

This project is open source under the [MIT License](LICENSE). Third-party license notices: [NOTICE](NOTICE).
