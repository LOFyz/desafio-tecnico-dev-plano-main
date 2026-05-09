## Why

`apps/gateway` is currently a bare NestJS app with MikroORM but no GraphQL layer. The project architecture requires a lightweight Apollo Federation gateway that federates all subgraphs (starting with `users-subgraph`) into a single unified graph, forwarding the Better Auth session cookie to subgraphs so each can resolve the authenticated user independently.

## What Changes

- Replace `apps/gateway` webpack build with Rspack (consistent with migrator and users-subgraph)
- Remove MikroORM from the gateway — the gateway is schema-stitching only, it needs no database
- Add `@apollo/gateway` + `@nestjs/apollo` + `@nestjs/graphql` to the gateway
- Configure `ApolloGatewayDriver` with `IntrospectAndCompose` pointing to `users-subgraph` (and future subgraphs)
- Forward the `better-auth.session_token` cookie from the incoming HTTP request to each subgraph via `buildService` / `RemoteGraphQLDataSource` header injection
- Mount `cookie-parser` middleware so the gateway can read cookies
- Add `USERS_SUBGRAPH_URL` env var (e.g. `http://localhost:3001/graphql`) to `.env.example`

## Capabilities

### New Capabilities

- `gateway-federation`: NestJS Apollo Federation gateway — federates subgraphs, forwards session cookie to each remote data source, exposes a single `/graphql` endpoint

### Modified Capabilities

_(none — no existing spec-level requirements change)_

## Impact

- `apps/gateway`: significant rewrite of `AppModule` and `main.ts`; `package.json` gains `@apollo/gateway`, `@nestjs/apollo`, `@nestjs/graphql`, `graphql`, `cookie-parser`; build switches from webpack to Rspack
- `.env.example`: new `USERS_SUBGRAPH_URL` variable
- No changes to `users-subgraph`, `libs/*`, or `docker-compose.yaml`
