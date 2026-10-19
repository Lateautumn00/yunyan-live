# Build from the repo root (context must include packages/ and apps/chat-ws-service):
#   docker build -f apps/chat-ws-service/Dockerfile -t yunyan-live-chat-ws .
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/chat-ws-service/package.json ./apps/chat-ws-service/
COPY packages/nest-shared/package.json ./packages/nest-shared/
COPY packages/types/package.json ./packages/types/

RUN corepack enable && pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/types/ ./packages/types/
COPY packages/nest-shared/ ./packages/nest-shared/
COPY apps/chat-ws-service/ ./apps/chat-ws-service/

RUN pnpm --filter @yunyan-live/types build \
  && pnpm --filter @yunyan-live/nest-shared build \
  && pnpm --filter @yunyan-live/chat-ws-service build

FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/chat-ws-service/package.json ./apps/chat-ws-service/
COPY packages/nest-shared/package.json ./packages/nest-shared/
COPY packages/types/package.json ./packages/types/

RUN corepack enable && pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=builder /app/apps/chat-ws-service/dist ./apps/chat-ws-service/dist
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/src ./packages/types/src
COPY --from=builder /app/packages/nest-shared/dist ./packages/nest-shared/dist
COPY --from=builder /app/packages/nest-shared/src/protos ./packages/nest-shared/src/protos

WORKDIR /app/apps/chat-ws-service

EXPOSE 50054

CMD ["node", "dist/main.js"]
