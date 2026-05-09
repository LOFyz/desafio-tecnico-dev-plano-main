## 1. WordPress sanity check

- [x] 1.1 Confirm `databaseId` is publicly readable on WP `Post.author.node` without authentication (no WP plugin change needed — final design fetches the author via service-account JWT in the resolver, not via a federated `User @key(databaseId)` traversal). `curl` `{ post(id: 1, idType: DATABASE_ID) { author { node { databaseId } } } }` returns a non-null integer.
- [x] 1.2 Promote the `desafio-svc` WP user from `editor` to `administrator` via WP-CLI so its JWT can read `User.email` (WPGraphQL gates email behind the `list_users` capability): `docker exec <wp> wp user set-role desafio-svc administrator --allow-root`.

## 2. Schema migration: add wp_user_id column

- [x] 2.1 Edit `libs/users/infrastructure/src/lib/entities/user.entity.ts` to add `databaseId: number | null` mapped to column `wp_user_id` (nullable int).
- [x] 2.2 Add `Migration20260509_AddWpUserId` at `libs/db/src/migrations/` that adds `wp_user_id INT NULL` to the `user` table and creates index `idx_user_wp_user_id`.
- [x] 2.3 Export the migration from `libs/db/src/index.ts` and register it in `apps/migrator/src/migration/migration.module.ts`'s `migrationsList`.
- [x] 2.4 Run the migrator (`pnpm nx build migrator && node apps/migrator/dist/main.js`); verify the column + index exist via `docker exec postgres psql -U desafio -d desafio -c '\d "user"'`.

## 3. Users subgraph SDL: AppUser + Post.appUser

- [x] 3.1 Replace `apps/users-subgraph/src/schema.graphql` with a Federation v2.7 `@link` schema that declares `type AppUser @key(fields: "id")` (renamed from `User` to avoid collision with WP's `User`), `type Post @key(fields: "databaseId") { databaseId: Int! @external; appUser: AppUser }`, and `type Query { me: AppUser }`.
- [x] 3.2 Update `apps/users-subgraph/src/me/me.resolver.ts` to use `@Resolver('AppUser')`.
- [x] 3.3 Confirm `pnpm nx build users-subgraph` succeeds.

## 4. CQRS query handlers

- [x] 4.1 Add `@desafio/users-infrastructure`, `@mikro-orm/core`, `@mikro-orm/nestjs` as deps in `libs/users/application/package.json`; enable `experimentalDecorators` + `emitDecoratorMetadata` in `libs/users/application/tsconfig.lib.json`.
- [x] 4.2 Add `FindUserByIdQuery` (`{ id: string }`) + handler at `libs/users/application/src/lib/queries/find-user-by-id.{query,handler}.ts`. Handler uses `@InjectRepository(UserEntity)` and returns `User | null`.
- [x] 4.3 Add `FindUserByDatabaseIdQuery` (`{ databaseId: number }`) + handler that looks up by the entity's `databaseId` property (mapped to `wp_user_id` column).
- [x] 4.4 Export both queries and handlers from `libs/users/application/src/index.ts`; add the two handlers to `USER_QUERY_HANDLERS`.

## 5. AppUser reference resolver + Post.appUser resolver

- [x] 5.1 Create `apps/users-subgraph/src/users/users.resolver.ts` with `AppUserReferenceResolver` (`@Resolver('AppUser')` + `@ResolveReference()` that dispatches `FindUserByIdQuery` from `{ id }`) and `PostAppUserResolver` (`@Resolver('Post')` + `@ResolveField('appUser')` that fetches `post.author.node.databaseId` from WP via `WP_GRAPHQL_SERVICE_TOKEN`, then dispatches `FindUserByDatabaseIdQuery`).
- [x] 5.2 Create `apps/users-subgraph/src/users/users.module.ts` registering both resolvers + handlers + `MikroOrmModule.forFeature([UserEntity])`.
- [x] 5.3 Wire `UsersModule` into `apps/users-subgraph/src/app/app.module.ts` alongside `MeModule`.
- [x] 5.4 Add `@desafio/users-domain` to `apps/users-subgraph/package.json` deps (used by `users.resolver.ts`).
- [x] 5.5 Confirm `pnpm nx build users-subgraph` succeeds.

## 6. Better Auth post-signup hook (raw pg)

- [x] 6.1 Add `wpGraphqlUrl`, `wpServiceToken`, `pgPool` fields to `BetterAuthConfig` in `libs/auth/src/lib/init-auth.ts`.
- [x] 6.2 Create `libs/auth/src/lib/wp-user-lookup.ts` exporting `lookupWpUserIdByEmail(email, { url, token })` that runs the WPGraphQL `users(where: {search, searchColumns:[EMAIL]})` query, returns the WP `databaseId` only on a single exact email match.
- [x] 6.3 In `init-auth.ts`, register `databaseHooks.user.create.after` that calls the helper and persists `wp_user_id` via the injected `pg.Pool` (`UPDATE "user" SET wp_user_id = $1 WHERE id = $2`). **Note:** Better Auth's adapter silently drops writes to fields outside its native schema; raw pg is required.
- [x] 6.4 Add `WP_GRAPHQL_URL`, `WP_GRAPHQL_SERVICE_TOKEN` reads + lazy-constructed `pg.Pool` to `BetterAuthConfigFactory`.
- [x] 6.5 Add `pg` + `@types/pg` deps to `libs/auth/package.json`; export `lookupWpUserIdByEmail`, `BETTER_AUTH_CONFIG_TOKEN`, type `BetterAuthConfig` from `libs/auth/src/index.ts`.

## 7. One-shot backfill for pre-existing users

- [x] 7.1 Add `scripts/backfill-wp-user-ids.sh` that loops over `user` rows with `wp_user_id IS NULL`, runs the same WP lookup, and updates rows via `docker exec postgres psql`. No new app needed.
- [x] 7.2 Document `WP_GRAPHQL_URL` + `WP_GRAPHQL_SERVICE_TOKEN` in `.env.example` with the curl one-liner to mint the JWT from `desafio-svc`. Mirror in local `.env`.

## 8. End-to-end smoke

- [x] 8.1 Boot users-subgraph + gateway; sign up a Better Auth user matching a WP author email — verify the post-signup hook persists `wp_user_id` (check via `psql`).
- [x] 8.2 Query the gateway: `{ post(id: <wp_post_id>, idType: DATABASE_ID) { id title appUser { id email name } } }` and assert the matching post returns a non-null `appUser` with the Better Auth `id`/`email`/`name`.
- [x] 8.3 Query a post whose WP author has no Better Auth match (or no author at all); assert `appUser: null` and no GraphQL errors.
- [x] 8.4 Sign up a Better Auth user with an email that has no WP match; assert `wp_user_id IS NULL` and signup succeeds with HTTP 200.
- [x] 8.5 Run `scripts/backfill-wp-user-ids.sh` against pre-existing rows; assert it updates only the matching emails (and is idempotent).

## 9. Verification

- [x] 9.1 Run `pnpm nx run-many -t build,lint -p users-subgraph,users-application,users-domain,users-infrastructure,auth,gateway` and confirm all targets pass.
- [x] 9.2 Run `pnpm openspec validate federate-post-author --strict` and confirm no errors.
