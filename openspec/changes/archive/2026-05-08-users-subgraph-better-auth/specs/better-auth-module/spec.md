## ADDED Requirements

### Requirement: BetterAuthModule initialises a Better Auth instance as a NestJS injectable
`libs/auth` SHALL export a `BetterAuthModule` built with `ConfigurableModuleBuilder` (`.forRoot` / `.forRootAsync`) that registers the Better Auth instance under `BETTER_AUTH_TOKEN` and makes it injectable across any importing app.

#### Scenario: Module imported with valid config
- **WHEN** an app imports `BetterAuthModule.forRootAsync({ ... })` with a valid `BetterAuthConfig` and a reachable PostgreSQL database
- **THEN** the `BETTER_AUTH_TOKEN` provider is available for injection and the Better Auth instance is initialised without errors

#### Scenario: Module provides injectable BetterAuth instance
- **WHEN** a NestJS service injects `@Inject(BETTER_AUTH_TOKEN) auth: BetterAuth`
- **THEN** the injected value is the fully initialised Better Auth instance with all configured plugins

### Requirement: Better Auth uses Kysely adapter bridged through MikroORM SqlEntityManager
The `BetterAuthDatabaseAdapterFactory` SHALL create a Kysely instance from MikroORM's `SqlEntityManager` using `createKyselyDialect`, apply `CamelCasePlugin`, and pass the result to `kyselyAdapter` with `type: 'postgres'`.

#### Scenario: Kysely dialect created from entity manager
- **WHEN** `AuthDatabaseKyselyFactory` is instantiated with a valid `SqlEntityManager`
- **THEN** a Kysely instance connected to the same PostgreSQL connection pool as MikroORM is returned

#### Scenario: Better Auth writes a session via Kysely
- **WHEN** a user signs in through the Better Auth email/password flow
- **THEN** a `session` row is written to PostgreSQL through the Kysely adapter without a separate DB connection

### Requirement: BetterAuthConfig is resolved from environment via ConfigService
The `BETTER_AUTH_CONFIG_TOKEN` provider SHALL read `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_BASE_PATH`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` from `ConfigService`.

#### Scenario: Missing required secret
- **WHEN** `BETTER_AUTH_SECRET` is absent from environment variables
- **THEN** the application throws a configuration error at startup before accepting requests

#### Scenario: Google OAuth disabled when credentials absent
- **WHEN** `GOOGLE_CLIENT_ID` is not set
- **THEN** the Google social provider is disabled and email/password auth remains functional
