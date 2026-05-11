# Build context MUST be the workspace root.
# From the workspace root: docker build -t desafio-users-subgraph -f apps/users-subgraph/Dockerfile .

FROM node:24-bookworm AS builder
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@11.0.8 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY nx.json tsconfig.base.json ./
COPY apps/users-subgraph/package.json apps/users-subgraph/
COPY libs/ libs/
COPY node_modules ./node_modules

COPY apps/users-subgraph apps/users-subgraph
RUN pnpm nx build users-subgraph

# ---- runtime ----
# Same gcr.io→docker-hub swap as the gateway image (gcr.io was unreachable
# from the deploy host).
FROM node:24-bookworm-slim AS runtime
WORKDIR /app

COPY --from=builder /workspace/apps/users-subgraph/dist /app
COPY --from=builder /workspace/node_modules /app/node_modules

# The users-subgraph reads its GraphQL schema from a typePaths glob that's
# resolved relative to process.cwd(). NestJS resolves that against the
# workspace root by default, but since we ship just /app we mirror the
# original path so the glob `apps/users-subgraph/src/**/*.graphql` lands.
COPY --from=builder /workspace/apps/users-subgraph/src/schema.graphql /app/apps/users-subgraph/src/schema.graphql

ENV NODE_ENV=production PORT=3001
EXPOSE 3001
CMD ["node", "main.js"]
