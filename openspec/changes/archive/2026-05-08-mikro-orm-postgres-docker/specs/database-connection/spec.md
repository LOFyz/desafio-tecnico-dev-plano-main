## ADDED Requirements

### Requirement: DbModule provides a MikroORM PostgreSQL connection
`libs/db` SHALL export a `DbModule` that registers `MikroOrmModule.forRootAsync` with the `PostgreSqlDriver` and reads all connection parameters (`host`, `port`, `dbName`, `user`, `password`) from environment variables via `ConfigService`.

#### Scenario: Gateway starts with valid env vars
- **WHEN** `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` are set and a PostgreSQL instance is reachable
- **THEN** the NestJS application boots without error and MikroORM establishes a connection

#### Scenario: Missing required env var
- **WHEN** one or more of the required database env vars are absent
- **THEN** the application throws a configuration error at startup before accepting requests

### Requirement: PostgreSQL Docker service is available for local development
The `docker-compose.yaml` SHALL include a `postgres` service using `postgres:16-alpine` that exposes port `5432` and is configured via the same environment variables documented in `.env.example`.

#### Scenario: Docker Compose brings up the database
- **WHEN** `docker compose up -d postgres` is executed
- **THEN** a PostgreSQL instance is reachable at `localhost:5432` with the credentials from `.env`

#### Scenario: Existing services are unaffected
- **WHEN** the updated `docker-compose.yaml` is used
- **THEN** the existing `db`, `wordpress`, `nginx`, and `phpmyadmin` services start and operate as before

### Requirement: MikroORM CLI is usable from the workspace root
A `mikro-orm.config.ts` file SHALL exist at the workspace root and be auto-discovered by `@mikro-orm/cli`, allowing `pnpm mikro-orm migration:create` and similar commands to run without extra flags.

#### Scenario: CLI discovers config automatically
- **WHEN** `pnpm mikro-orm debug` is run from the workspace root
- **THEN** the CLI reports the correct database connection details without requiring `--config` flag

### Requirement: Environment variables are documented
A `.env.example` file SHALL exist at the workspace root listing every database-related variable with placeholder values and inline comments.

#### Scenario: Developer sets up local environment
- **WHEN** a developer copies `.env.example` to `.env` and fills in values
- **THEN** the application and CLI are fully functional with no undocumented variables required
