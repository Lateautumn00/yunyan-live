FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json ./apps/server/

RUN corepack enable && pnpm install --frozen-lockfile

COPY apps/server/ ./apps/server/
COPY tsconfig.base.json ./

RUN cd apps/server && pnpm build

FROM node:24-alpine AS runner

WORKDIR /app

COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/node_modules ./node_modules
COPY --from=builder /app/apps/server/package.json ./

EXPOSE 3001

CMD ["node", "dist/main.js"]
