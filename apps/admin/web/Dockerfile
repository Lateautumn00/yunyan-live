# 管理后台 Web（静态构建 + nginx 反代）
# 构建（必须在仓库根执行，context 需包含 pnpm workspace 文件）：
#   docker build -f apps/admin/web/Dockerfile -t yunyan-live-admin-web .
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/admin/web/package.json ./apps/admin/web/

RUN corepack enable && pnpm install --frozen-lockfile --filter @yunyan-live/admin-web...

COPY apps/admin/web/ ./apps/admin/web/

RUN pnpm --filter @yunyan-live/admin-web build

FROM nginx:1.27-alpine

COPY apps/admin/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/admin/web/dist /usr/share/nginx/html

EXPOSE 80
