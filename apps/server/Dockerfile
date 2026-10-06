# Build from the repo root (context must include packages/ and apps/server):
#   docker build -f apps/server/Dockerfile -t edu-live-server .
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json ./apps/server/
COPY packages/nest-shared/package.json ./packages/nest-shared/
COPY packages/types/package.json ./packages/types/

RUN corepack enable && pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/types/ ./packages/types/
COPY packages/nest-shared/ ./packages/nest-shared/
COPY apps/server/ ./apps/server/

RUN pnpm --filter @yunyan-live/nest-shared build \
  && pnpm --filter @yunyan-live/server build

FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json ./apps/server/
COPY packages/nest-shared/package.json ./packages/nest-shared/
COPY packages/types/package.json ./packages/types/

RUN corepack enable && pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/packages/types/src ./packages/types/src
COPY --from=builder /app/packages/nest-shared/dist ./packages/nest-shared/dist

WORKDIR /app/apps/server

EXPOSE 3001

CMD ["node", "dist/main.js"]
