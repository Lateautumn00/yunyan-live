# Build from the repo root (context must include packages/ and apps/admin/admin-service):
#   docker build -f apps/admin/admin-service/Dockerfile -t yunyan-live-admin .
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/admin/admin-service/package.json ./apps/admin/admin-service/
COPY packages/nest-shared/package.json ./packages/nest-shared/
COPY packages/shared/package.json ./packages/shared/
COPY packages/types/package.json ./packages/types/

RUN corepack enable && pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/types/ ./packages/types/
COPY packages/shared/ ./packages/shared/
COPY packages/nest-shared/ ./packages/nest-shared/
COPY apps/admin/admin-service/ ./apps/admin/admin-service/

RUN pnpm --filter @yunyan-live/types build \
  && pnpm --filter @yunyan-live/shared build \
  && pnpm --filter @yunyan-live/nest-shared build \
  && pnpm --filter @yunyan-live/admin-service build

FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/admin/admin-service/package.json ./apps/admin/admin-service/
COPY packages/nest-shared/package.json ./packages/nest-shared/
COPY packages/shared/package.json ./packages/shared/
COPY packages/types/package.json ./packages/types/

RUN corepack enable && pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=builder /app/apps/admin/admin-service/dist ./apps/admin/admin-service/dist
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/src ./packages/types/src
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/nest-shared/dist ./packages/nest-shared/dist
COPY --from=builder /app/packages/nest-shared/src/protos ./packages/nest-shared/src/protos

WORKDIR /app/apps/admin/admin-service

EXPOSE 50056 9467

CMD ["node", "dist/main.js"]
