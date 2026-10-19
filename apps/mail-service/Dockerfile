# Build from the repo root (context must include packages/ and apps/mail-service):
#   docker build -f apps/mail-service/Dockerfile -t yunyan-live-mail .
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/mail-service/package.json ./apps/mail-service/
COPY packages/nest-shared/package.json ./packages/nest-shared/
COPY packages/types/package.json ./packages/types/

RUN corepack enable && pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/types/ ./packages/types/
COPY packages/nest-shared/ ./packages/nest-shared/
COPY apps/mail-service/ ./apps/mail-service/

RUN pnpm --filter @yunyan-live/types build \
  && pnpm --filter @yunyan-live/nest-shared build \
  && pnpm --filter @yunyan-live/mail-service build

FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/mail-service/package.json ./apps/mail-service/
COPY packages/nest-shared/package.json ./packages/nest-shared/
COPY packages/types/package.json ./packages/types/

RUN corepack enable && pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=builder /app/apps/mail-service/dist ./apps/mail-service/dist
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/src ./packages/types/src
COPY --from=builder /app/packages/nest-shared/dist ./packages/nest-shared/dist
COPY --from=builder /app/packages/nest-shared/src/protos ./packages/nest-shared/src/protos

WORKDIR /app/apps/mail-service

EXPOSE 50053 9466

CMD ["node", "dist/main.js"]
