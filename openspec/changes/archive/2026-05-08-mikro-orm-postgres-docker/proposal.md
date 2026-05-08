## Why

The `libs/db` library exists but is empty — there is no ORM configuration, no database connection, and no migrations setup. The gateway app cannot persist data until a database layer is established. MikroORM with PostgreSQL is already declared as a dependency in the root `package.json`; it just needs to be wired up.

## What Changes

- Add a PostgreSQL service to `docker-compose.yaml` for local development
- Configure MikroORM in `libs/db` using `@mikro-orm/nestjs` and `@mikro-orm/postgresql`
- Expose a `DbModule` from `libs/db` that the gateway can import
- Add a `mikro-orm.config.ts` at workspace root for CLI usage (migrations, schema sync)
- Wire `@nestjs/config` env variables for database credentials
- Add a `.env.example` documenting the required environment variables

## Capabilities

### New Capabilities

- `database-connection`: MikroORM PostgreSQL connection configured via environment variables, exposed as a NestJS module from `libs/db`, usable by any app in the monorepo.

### Modified Capabilities

<!-- none -->

## Impact

- **`docker-compose.yaml`**: new `postgres` service added (does not remove the existing WordPress/MySQL services)
- **`libs/db`**: `DbModule` populated with `MikroOrmModule.forRootAsync`, entity discovery config, and migrations path
- **`apps/gateway`**: imports `DbModule` from `@desafio/db`
- **Dependencies**: all MikroORM packages are already installed (`@mikro-orm/core`, `@mikro-orm/nestjs`, `@mikro-orm/postgresql`, `@mikro-orm/reflection`, `@mikro-orm/cli`); `@nestjs/config` is also present
