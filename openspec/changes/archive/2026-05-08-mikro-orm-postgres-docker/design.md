## Context

The Nx monorepo has a `libs/db` library intended to be the shared database layer and an `apps/gateway` NestJS API. All MikroORM packages (`@mikro-orm/core`, `@mikro-orm/nestjs`, `@mikro-orm/postgresql`, `@mikro-orm/reflection`, `@mikro-orm/cli`) are already declared in the root `package.json`. `@nestjs/config` is also present. Currently `libs/db` exports only an empty `DesafioDbModule` with no real configuration.

The existing `docker-compose.yaml` runs a WordPress/MySQL stack. A separate PostgreSQL service for the NestJS application must be added without disrupting it.

## Goals / Non-Goals

**Goals:**
- Wire MikroORM to a PostgreSQL instance defined in Docker Compose
- `DbModule` from `libs/db` re-exports `MikroOrmModule` so any app can import it
- CLI-compatible `mikro-orm.config.ts` at workspace root for running migrations
- All credentials read from environment variables via `@nestjs/config`

**Non-Goals:**
- Defining application-specific entities (that belongs to each domain lib or feature)
- Production deployment config (only local dev Docker Compose is in scope)
- Removing or modifying the existing WordPress/MySQL Docker services

## Decisions

### D1 — `MikroOrmModule.forRootAsync` in `libs/db`

Using `forRootAsync` allows credentials to be injected from `ConfigService` at runtime rather than hardcoded. Alternative `forRoot` with a static object was rejected because it cannot read env vars through NestJS DI.

### D2 — Entity discovery via `@mikro-orm/reflection` (TsMorphMetadataProvider)

`TsMorphMetadataProvider` reads TypeScript types at build time, which means no decorators are required on entity properties. Alternative `ReflectMetadataProvider` requires `emitDecoratorMetadata` and is less type-safe. Since `@mikro-orm/reflection` is already in `package.json` this has no extra cost.

### D3 — `mikro-orm.config.ts` at workspace root

The MikroORM CLI (`npx mikro-orm`) looks for configuration by default at the workspace root. Placing the config there allows `pnpm mikro-orm migration:create` etc. without extra flags. The file imports the same env values (via `dotenv`) so dev and CLI share identical settings.

### D4 — PostgreSQL Docker service on port 5432

A new `postgres` service is added to `docker-compose.yaml`. It uses the official `postgres:16-alpine` image. Credentials (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`) are declared as environment variables matched by `.env` / `.env.example`. Keeping it in the same `docker-compose.yaml` simplifies `docker compose up`.

### D5 — `@nestjs/config` loaded in `DbModule`

`ConfigModule.forRoot({ isGlobal: true })` is registered in `DbModule` (or expected to be registered at app root). `DbModule` uses `inject: [ConfigService]` inside `forRootAsync`. If the app already registers `ConfigModule` globally, the import is idempotent.

## Risks / Trade-offs

- **Entities discovered via glob**: If the glob path for entity discovery is too broad it will pick up non-entity files and throw at startup. Mitigation: use explicit `entities` arrays or a tight glob (`libs/**/entities/*.entity.ts`).
- **TsMorphMetadataProvider build overhead**: It reads TS sources at startup, which adds ~100–300 ms in development. Mitigation: this is acceptable for local dev; for production builds entities are compiled and the overhead is negligible.
- **Single shared config**: If two apps (e.g. a future second service) need different database connections, `DbModule` will need `forRootAsync` overrides. Mitigation: `MikroOrmModule.forRootAsync` accepts a `contextName` option for multiple connections when needed.

## Migration Plan

1. Add `postgres` service to `docker-compose.yaml` and run `docker compose up -d postgres`
2. Copy `.env.example` to `.env` and fill credentials
3. Implement `libs/db` changes and add `mikro-orm.config.ts`
4. Import `DbModule` in `apps/gateway/src/app/app.module.ts`
5. Run `pnpm mikro-orm migration:up` to apply initial (empty) migration baseline

Rollback: remove the `DbModule` import from gateway and bring down the postgres container.

## Open Questions

- Should entity discovery use a monorepo-wide glob or per-lib explicit arrays? (Recommendation: glob for now, easy to tighten later.)
- Should `ConfigModule` be registered inside `DbModule` or expected from the app root? (Recommendation: register inside `DbModule` with `isGlobal: true` so the lib is self-contained.)
