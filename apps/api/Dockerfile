FROM node:22-bookworm-slim

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate \
  && apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @tcg-marge/api build

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
