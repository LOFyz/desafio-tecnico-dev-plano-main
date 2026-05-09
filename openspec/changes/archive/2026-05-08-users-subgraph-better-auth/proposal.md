## Why

The monorepo has a working NestJS gateway with MikroORM/PostgreSQL configured but no authentication layer and no GraphQL federation subgraph. Better Auth is the chosen auth solution and a `users-subgraph` Apollo Federation subgraph is the next foundational piece — it exposes the `me` query that links a logged-in Better Auth session to the supergraph, making authenticated identity available to every other subgraph (e.g., WordPress posts).

## What Changes

- New Nx app `apps/users-subgraph`: NestJS Apollo Federation subgraph (schema-first, `@nestjs/graphql` + `@apollo/subgraph`)
- New Nx lib `libs/auth`: Better Auth NestJS module
  - `BetterAuthModule` — `ConfigurableModuleBuilder` pattern (mirrors `exposes-better-auth.ts`)
  - `initAuth` factory — Better Auth instance with email/password, social providers, plugins (mirrors `creates-better-auth-instance.ts`)
  - Kysely adapter wired to MikroORM `SqlEntityManager` via `@mikro-orm/kysely` (mirrors `integrate-better-auth-with-mikroorm.ts`)
- New Nx lib `libs/users` (domain + infrastructure): MikroORM entities for Better Auth tables (`user`, `session`, `account`, `verification`)
- GraphQL schema (`schema.graphql`) in `users-subgraph` defining `User @key(fields: "id")` with `email` exposed so the WPGraphQL Federation subgraph can resolve WordPress-owned data (posts, profile) by matching on email at the federation layer — no direct WordPress REST API or MySQL access from our services
- CQRS `GetMeQuery` — resolver dispatches query, handler reads session from Better Auth
- Better Auth HTTP handler exposed on `/auth/**` route in `users-subgraph`
- Shared GraphQL context carries `sessionId` (extracted from cookie) into every resolver

## Capabilities

### New Capabilities

- `better-auth-module`: NestJS module that initialises a Better Auth instance, wires the Kysely/MikroORM adapter, and exposes the `BetterAuth` instance as an injectable token
- `users-subgraph`: Apollo Federation subgraph app with `me: User` query, CQRS handler reading the authenticated session, and the Better Auth REST handler mounted at `/auth/**`
- `user-entity`: MikroORM entities for the Better Auth core tables (`User`, `Session`, `Account`, `Verification`) in `libs/users`; `User` exposes `email` as the federation bridge field to WPGraphQL

### Modified Capabilities

- `database-connection`: `libs/db` gains the `@mikro-orm/kysely` bridge so the Kysely dialect can be created from `SqlEntityManager` (no spec-level requirement changes — implementation detail only)

## Impact

- **New packages**: `better-auth`, `@better-auth/kysely-adapter`, `@mikro-orm/kysely`, `@nestjs/graphql`, `@nestjs/apollo`, `@apollo/subgraph`, `graphql`, `@nestjs/cqrs`, `@nestjs/config` (already present), `kysely`
- **New env vars**: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_BASE_PATH`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **`apps/users-subgraph`**: new NestJS app, Apollo Federation subgraph, schema-first GraphQL
- **`libs/auth`**: new library — Better Auth NestJS integration
- **`libs/users`**: new library — MikroORM entities for auth tables
- **`libs/db`**: adds Kysely dialect export helper (no breaking changes)
- **`docker-compose.yaml`**: already has PostgreSQL; users-subgraph will use the same instance with its own DB name env var
