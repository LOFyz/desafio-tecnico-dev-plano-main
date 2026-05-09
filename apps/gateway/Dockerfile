# syntax=docker/dockerfile:1.7
# Build context MUST be the workspace root (so pnpm sees the full Nx workspace).
# From the workspace root: docker build -t desafio-gateway -f apps/gateway/Dockerfile .

FROM node:24-bookworm AS builder
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@11.0.8 --activate

# Copy lockfile + workspace manifests first to maximize layer cache hits on
# pure-source-only changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY nx.json tsconfig.base.json ./
COPY apps/gateway/package.json apps/gateway/
COPY libs/ libs/

RUN pnpm install --frozen-lockfile

# Now bring in the gateway sources and build. Splitting these from the
# install step keeps the install layer cached across pure-source edits.
COPY apps/gateway apps/gateway

RUN pnpm nx build gateway

# ---- runtime ----
# Distroless: tiny attack surface, no shell, just node + JS. The image
# entrypoint is `node`, so CMD is just the script path.
FROM gcr.io/distroless/nodejs24-debian12 AS runtime
WORKDIR /app

# rspack output: main.js + chunked 0.js + assets. The bundle externalizes
# @nestjs/*, graphql, cookie-parser, etc., so we ship the workspace
# node_modules alongside and let Node's resolution algorithm find them.
COPY --from=builder /workspace/apps/gateway/dist /app
COPY --from=builder /workspace/node_modules /app/node_modules

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["main.js"]
