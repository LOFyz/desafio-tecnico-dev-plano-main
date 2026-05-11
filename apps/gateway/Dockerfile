# Build context MUST be the workspace root (so pnpm sees the full Nx workspace).
# From the workspace root: docker build -t desafio-gateway -f apps/gateway/Dockerfile .

FROM node:24-bookworm AS builder
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@11.0.8 --activate

# Copy the workspace's pre-installed node_modules instead of running
# `pnpm install` inside the BuildKit container. The container's network
# is unreliable enough on this dev box that npmjs.org connect timeouts
# kill the build; the host already ran pnpm install successfully.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY nx.json tsconfig.base.json ./
COPY apps/gateway/package.json apps/gateway/
COPY libs/ libs/
COPY node_modules ./node_modules

# Source + build (no network needed; nx + rspack are in node_modules).
COPY apps/gateway apps/gateway
RUN pnpm nx build gateway

# ---- runtime ----
# node:24-bookworm-slim from Docker Hub. The Pulumi/Buildx build step
# couldn't reliably reach gcr.io for distroless images on first deploy,
# so we trade ~170MB of image size for a more reliably-pulled base.
FROM node:24-bookworm-slim AS runtime
WORKDIR /app

# rspack output: main.js + chunked 0.js + assets. The bundle externalizes
# @nestjs/*, graphql, cookie-parser, etc., so we ship the workspace
# node_modules alongside and let Node's resolution algorithm find them.
COPY --from=builder /workspace/apps/gateway/dist /app
COPY --from=builder /workspace/node_modules /app/node_modules

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "main.js"]
