# syntax=docker/dockerfile:1.7
# Build context MUST be the workspace root.
# From the workspace root: docker build -t desafio-mcp-server -f apps/mcp-server/Dockerfile .

FROM node:24-bookworm AS builder
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@11.0.8 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY nx.json tsconfig.base.json ./
COPY apps/mcp-server/package.json apps/mcp-server/

RUN pnpm install --frozen-lockfile

COPY apps/mcp-server apps/mcp-server

RUN pnpm nx build mcp-server

# ---- runtime ----
FROM gcr.io/distroless/nodejs24-debian12 AS runtime
WORKDIR /app

COPY --from=builder /workspace/apps/mcp-server/dist /app
COPY --from=builder /workspace/node_modules /app/node_modules

ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["main.js"]
