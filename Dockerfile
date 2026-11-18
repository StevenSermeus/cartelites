# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS dependencies
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/realtime/package.json ./packages/realtime/package.json
COPY convex/package.json ./convex/package.json
RUN pnpm install --frozen-lockfile --filter @tcg-marge/api... --filter @tcg-marge/web... --filter @tcg-marge/backend...
COPY . .

FROM dependencies AS api-build
RUN pnpm --filter @tcg-marge/api build \
    && pnpm --filter @tcg-marge/api deploy --prod /out/api

FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY --from=api-build --chown=node:node /out/api/ ./
USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]

FROM dependencies AS web-build
# Public API origin only; no production secrets at build time.
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN test -n "$VITE_API_URL" && pnpm --filter @tcg-marge/web build

FROM nginx:stable-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /workspace/apps/web/dist/ /usr/share/nginx/html/
EXPOSE 80

FROM dependencies AS convex-deploy
WORKDIR /workspace/convex
ENV CI=true
CMD ["node", "../deploy/convex-deploy.mjs"]
