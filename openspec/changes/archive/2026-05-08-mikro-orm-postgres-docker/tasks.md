## 1. Docker & Environment

- [x] 1.1 Add `postgres:16-alpine` service to `docker-compose.yaml` with `DB_*` env vars, port mapping `5432:5432`, and a named volume
- [x] 1.2 Create `.env.example` at workspace root documenting `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` with placeholder values
- [x] 1.3 Add `.env` to `.gitignore` if not already present

## 2. MikroORM Workspace Config (CLI)

- [x] 2.1 Create `mikro-orm.config.ts` at workspace root that loads `.env` via `dotenv` and exports a `defineConfig` using `PostgreSqlDriver`, `TsMorphMetadataProvider`, and entities glob

## 3. `libs/db` Module

- [x] 3.1 Add `@nestjs/config` and MikroORM peer imports to `libs/db/package.json` dependencies (reference root workspace packages)
- [x] 3.2 Implement `DbModule` in `libs/db/src/lib/db.module.ts` using `MikroOrmModule.forRootAsync` with `ConfigService` injection for all connection parameters
- [x] 3.3 Register `ConfigModule.forRoot({ isGlobal: true })` inside `DbModule` imports so it is self-contained
- [x] 3.4 Export `MikroOrmModule` from `DbModule` so importing apps get the `EntityManager` and `MikroORM` providers

## 4. Gateway Integration

- [x] 4.1 Import `DbModule` from `@desafio/db` in `apps/gateway/src/app/app.module.ts`

## 5. Verification

- [x] 5.1 Run `docker compose up -d postgres` and confirm the container is healthy
- [x] 5.2 Copy `.env.example` to `.env`, fill in credentials, and run `pnpm nx serve gateway` — confirm app boots without ORM errors
- [x] 5.3 Run `pnpm mikro-orm debug` from workspace root and confirm CLI resolves the config
