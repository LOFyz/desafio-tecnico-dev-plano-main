## 1. Scaffold Nx Apps & Libs

- [x] 1.1 Generate `apps/users-subgraph` with `pnpm nx g @nx/nest:app users-subgraph`
- [x] 1.2 Generate `libs/auth` with `pnpm nx g @nx/js:lib auth --directory=libs/auth`
- [x] 1.3 Generate `libs/users` (federation entry) with `pnpm nx g @nx/js:lib users --directory=libs/users`
- [x] 1.4 Generate `libs/users/domain` with `pnpm nx g @nx/js:lib users-domain --directory=libs/users/domain`
- [x] 1.5 Generate `libs/users/application` with `pnpm nx g @nx/js:lib users-application --directory=libs/users/application`
- [x] 1.6 Generate `libs/users/infrastructure` with `pnpm nx g @nx/js:lib users-infrastructure --directory=libs/users/infrastructure`
- [x] 1.7 Generate `apps/migrator` with `pnpm nx g @nx/nest:app migrator --directory=apps/migrator`

## 2. Install Dependencies

- [x] 2.1 Add `better-auth` and `@better-auth/kysely-adapter` to root `package.json`
- [x] 2.2 Add `kysely` to root `package.json`
- [x] 2.3 Add `@nestjs/graphql`, `@nestjs/apollo`, `@apollo/subgraph`, `graphql` to root `package.json`
- [x] 2.4 Add `@nestjs/cqrs` to root `package.json`
- [x] 2.5 Add `cookie-parser` and `@types/cookie-parser` to root `package.json`
- [x] 2.6 Run `pnpm install`
- [ ] 2.7 Add `@nx/rspack` to devDependencies; run `pnpm install`

## 3. Replace Webpack with Rspack (apps/migrator and apps/users-subgraph)

Webpack minifies class constructor names breaking MikroORM v7 entity schema discovery. Rspack is the Nx-recommended replacement and preserves class names for Node.js targets. Follow https://nx.dev/docs/technologies/build-tools/rspack/introduction.

- [ ] 3.1 Migrate `apps/migrator` from webpack to Rspack: replace `webpack.config.js` with `rspack.config.js` using `NxAppRspackPlugin`; update `apps/migrator/package.json` build target executor to `@nx/rspack:rspack`
- [ ] 3.2 Migrate `apps/users-subgraph` from webpack to Rspack: replace `webpack.config.js` with `rspack.config.js`; update executor

## 4. libs/users/domain — Domain Model

- [x] 4.1 Create `User` domain interface (`libs/users/domain/src/lib/user.ts`) — pure TS, no framework deps
- [x] 4.2 Export `User` from `libs/users/domain/src/index.ts`

## 5. libs/users/infrastructure — MikroORM Entities (defineEntity)

Entities use MikroORM v7 `defineEntity` + `p` builders. All schemas have explicit `className` to survive bundling. Relations use `() => XxxEntitySchema` (not the class) so MikroORM can look up the schema object.

- [x] 5.1 Create `UserEntity` + `UserEntitySchema` (`libs/users/infrastructure/src/lib/entities/user.entity.ts`)
- [x] 5.2 Create `SessionEntity` + `SessionEntitySchema` with FK → `UserEntitySchema`
- [x] 5.3 Create `AccountEntity` + `AccountEntitySchema` with FK → `UserEntitySchema`
- [x] 5.4 Create `VerificationEntity` + `VerificationEntitySchema`
- [x] 5.5 Export all entity classes and schemas from `libs/users/infrastructure/src/index.ts`
- [x] 5.6 Set `libs/users/infrastructure/package.json` exports to source paths (matching `@desafio/db` pattern)
- [x] 5.7 Set `libs/users/domain/package.json`, `libs/users/application/package.json`, `libs/users/package.json`, `libs/auth/package.json` exports to source paths

## 6. apps/migrator — Migration Module

- [x] 6.1 Create `.swcrc` at workspace root enabling `decorators: true` for `@swc-node/register`
- [ ] 6.2 Create `apps/migrator/src/migration/migration.module.ts` — imports `MikroOrmModule.forRootAsync(...)` with all entity schemas (`UsersInfrastructureEntities`) and migration path config
- [ ] 6.3 Create `apps/migrator/src/migration/migration.service.ts` — implements `OnApplicationBootstrap`; calls `orm.getMigrator().up()`; calls `process.exit(0)` on success or `process.exit(1)` on error
- [ ] 6.4 Update `apps/migrator/src/app/app.module.ts` — imports only `DbModule` and `MigrationModule`
- [x] 6.5 Update `apps/migrator/package.json` with `@desafio/db` and `@desafio/users-infrastructure` workspace deps

## 7. Database Migration SQL

- [x] 7.1 Create `libs/db/src/migrations/Migration20260508_BetterAuthSchema.ts` with Better Auth core tables SQL
- [ ] 7.2 Build and run migrator to apply the migration: `pnpm nx build migrator && node apps/migrator/dist/main.js`

## 8. libs/auth — BetterAuthModule

- [ ] 8.1 Create `libs/auth/src/lib/init-auth.ts` — `initAuth(config, adapter)` factory following `creates-better-auth-instance.ts`, email/password (signup enabled) + optional Google OAuth; no mailing callbacks
- [ ] 8.2 Create `libs/auth/src/lib/providers/auth-database-kysely.factory.ts` — `AuthDatabaseKyselyFactory` and `BetterAuthDatabaseAdapterFactory` following `integrate-better-auth-with-mikroorm.ts`
- [ ] 8.3 Create `libs/auth/src/lib/providers/better-auth.factory.ts` — `BETTER_AUTH_TOKEN`, `BETTER_AUTH_CONFIG_TOKEN`, `BetterAuthFactory`, `ConfigurableModuleBuilder`; remove `mailingService` from module options
- [ ] 8.4 Create `libs/auth/src/lib/providers/better-auth-config.factory.ts` — reads `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_BASE_PATH`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` from `ConfigService`
- [ ] 8.5 Create `BetterAuthModule` (`libs/auth/src/lib/better-auth.module.ts`) wiring all providers; extends `ConfigurableModuleClass`
- [ ] 8.6 Export `BetterAuthModule`, `BETTER_AUTH_TOKEN`, `BetterAuth` type from `libs/auth/src/index.ts`

## 9. libs/users/application — CQRS

- [ ] 9.1 Create `GetMeQuery` (`libs/users/application/src/lib/queries/get-me.query.ts`): carries `sessionId: string | undefined`
- [ ] 9.2 Create `GetMeQueryHandler` (`libs/users/application/src/lib/queries/get-me.handler.ts`): injects `BETTER_AUTH_TOKEN`, calls `auth.api.getSession(...)`, returns `User` domain object or `null`
- [ ] 9.3 Export query, handler, and `USER_QUERY_HANDLERS` array from `libs/users/application/src/index.ts`

## 10. users-subgraph — GraphQL Schema

- [ ] 10.1 Create `apps/users-subgraph/src/schema.graphql`: `type User @key(fields: "id") { id: ID! email: String! name: String! }` and `type Query { me: User }`
- [ ] 10.2 Configure `GraphQLModule.forRoot<ApolloFederationDriverConfig>` in `UsersSubgraphModule` with `ApolloFederationDriver`, `typePaths: ['**/*.graphql']`, context factory extracting `better-auth.session_token` cookie into `sessionId`
- [ ] 10.3 Create `GqlContext` interface (`apps/users-subgraph/src/gql-context.ts`): `{ sessionId?: string; req: Request }`

## 11. users-subgraph — Me Feature

- [ ] 11.1 Create `MeResolver` (`apps/users-subgraph/src/me/me.resolver.ts`): dispatches `GetMeQuery` via `QueryBus`
- [ ] 11.2 Create `MeModule` (`apps/users-subgraph/src/me/me.module.ts`) importing `CqrsModule` and registering `GetMeQueryHandler` + `MeResolver`

## 12. users-subgraph — App Module & Bootstrap

- [ ] 12.1 Update `apps/users-subgraph/src/app/app.module.ts` — imports `DbModule`, `BetterAuthModule.forRootAsync(...)`, `MikroOrmModule.forRootAsync(...)` with all entity schemas, `MeModule`
- [ ] 12.2 Mount `cookie-parser` middleware in `main.ts`
- [ ] 12.3 Mount Better Auth REST handler at `/auth/**` in `main.ts` using `toNodeHandler`
- [ ] 12.4 Add `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_BASE_PATH`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` to `.env.example`
- [ ] 12.5 Update `apps/users-subgraph/package.json` with `@desafio/db`, `@desafio/auth`, `@desafio/users-application`, `@desafio/users-infrastructure` workspace deps

## 13. Verification

- [ ] 13.1 Run `pnpm nx build users-subgraph` — confirm build succeeds with no TypeScript errors
- [ ] 13.2 Run `pnpm nx serve users-subgraph` — confirm app starts and logs `MikroOrmCoreModule`, `BetterAuthModule`, `MeModule` initialized
- [ ] 13.3 Call `POST /auth/sign-up/email` with `email` + `password` + `name` — confirm 200 and session cookie set
- [ ] 13.4 Call `query { me { id email name } }` with session cookie — confirm authenticated user returned
- [ ] 13.5 Call `query { me { id } }` without cookie — confirm `data.me` is `null`
- [ ] 13.6 Call `query { _service { sdl } }` — confirm federation SDL returned
