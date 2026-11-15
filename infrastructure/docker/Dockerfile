FROM node:22-bookworm-slim

RUN corepack enable && corepack prepare pnpm@12.21.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps ./apps
COPY agents ./agents
COPY packages ./packages
COPY infrastructure/config ./infrastructure/config

RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production

CMD ["node", "--import", "tsx", "apps/api-gateway/src/index.ts"]
