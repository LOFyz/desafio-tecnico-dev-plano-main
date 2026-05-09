## Why

The gateway already composes the WordPress posts subgraph and the NestJS users subgraph, but the only relationship between them today is composition — there is no actual cross-subgraph data join. WordPress posts carry an author (WP `User`, integer `databaseId`), and Better Auth stores users in PostgreSQL with a UUID `id`. We want a query path that returns a Better Auth `User` for a given WordPress post — making the federation actually functional.

We tried two approaches before settling on the final shape:
- **Email as a `User @key`** failed because WPGraphQL gates `User.email` behind the `list_users` capability — unauthenticated subgraph traffic gets `email: null`, so the federation reference can never be built.
- **Multi-key `User` (id + databaseId)** failed because WordPress's `User` type implements interfaces (`Commenter`, `DatabaseIdentifier`) and shares a name with our `User`. Apollo composition merges them into one supergraph type, with type and resolver conflicts that no combination of `@shareable`, `@override`, or `@external` could resolve cleanly without WP-side schema changes.

Final approach: rename our subgraph's user type to `AppUser` (so it doesn't merge with WP's `User`), add a `Post.appUser` field on Post via federation extension, and resolve it in our subgraph by fetching the post's WP author from WordPress (with a service-account JWT) and looking up the matching Better Auth user via a `wp_user_id INT` column populated at signup.

## What Changes

- Add a nullable `wp_user_id INT` column to the Better Auth `user` table (MikroORM migration), stored on `UserEntity.databaseId` with `fieldName('wp_user_id')`.
- Rename the users subgraph's federation user type from `User` to `AppUser` so it does not collide with WP's `User` in the supergraph. `Query.me` returns `AppUser`.
- Extend `Post` (owned by WP) with an `appUser: AppUser` field via Apollo Federation `@external` extension. Resolver lives in our subgraph.
- The `Post.appUser` resolver, given a Post reference `{ databaseId }`, calls WordPress (with `WP_GRAPHQL_SERVICE_TOKEN`) to fetch the post's author's `databaseId`, then looks up the Better Auth user whose `wp_user_id` matches.
- Add a `__resolveReference` for `AppUser` that hydrates by `id` (used for `me`-derived references and any future internal subgraph traversal).
- Add CQRS query handlers `FindUserByIdQuery` and `FindUserByDatabaseIdQuery` for the lookups.
- Wire a Better Auth `databaseHooks.user.create.after` hook that, on every successful signup, calls WPGraphQL (with `WP_GRAPHQL_SERVICE_TOKEN`) to look up a WP user matching the new account's email and writes `wp_user_id` directly via a `pg.Pool` (Better Auth's adapter silently drops updates to fields outside its native schema).
- Add a small `scripts/backfill-wp-user-ids.sh` shell script that runs the same lookup for every existing user with `wp_user_id IS NULL`. Required once after deploying this change because pre-existing Better Auth users predate the signup hook.
- Add `WP_GRAPHQL_URL` and `WP_GRAPHQL_SERVICE_TOKEN` env vars (consumed by the users subgraph). Document how to mint the token in `.env.example`.
- Promote the `desafio-svc` WP user to administrator role (was editor) so its JWT can read `User.email` from WP. Done via WP-CLI; no source change.
- The WordPress `wp-graphql-federations` plugin requires NO change: WP still emits `type User @key(fields: "id")`. Our final design does not federate WP's `User` to ours — `Post.appUser` resolves server-side via a service-account JWT.

## Capabilities

### New Capabilities
- `post-author-federation`: cross-subgraph join semantics that resolve `Post.appUser` (extension owned by users-subgraph) to a Better Auth `AppUser`, including null behavior, the WP-side service-account fetch, and the email→databaseId mapping.

### Modified Capabilities
- `users-subgraph`: User SDL type renamed to `AppUser`, gains `wp_user_id` column-backed `databaseId` property on the entity (not exposed in SDL nor on the domain interface), a `__resolveReference` resolver for `AppUser`, a `Post.appUser` field resolver, and a Better Auth post-signup hook that populates `wp_user_id` against WP via the service-account JWT. Includes a one-shot shell script for backfilling pre-existing rows.

## Impact

- **Database** (Postgres `user` table): new nullable column `wp_user_id INT` with index `idx_user_wp_user_id`. MikroORM migration `Migration20260509_AddWpUserId` registered in the migrator app's migrationsList.
- **Domain** (`libs/users/domain/`): no change to the `User` interface — `databaseId` is internal to the entity, not part of the domain contract.
- **Infrastructure** (`libs/users/infrastructure/`): `UserEntity` gains `databaseId: number | null` property mapped to column `wp_user_id`.
- **Application** (`libs/users/application/`): two new CQRS queries + handlers (`FindUserByIdQuery`, `FindUserByDatabaseIdQuery`). `GetMeQueryHandler` is unchanged. New deps: `@desafio/users-infrastructure`, `@mikro-orm/core`, `@mikro-orm/nestjs`. `experimentalDecorators`/`emitDecoratorMetadata` enabled in `tsconfig.lib.json`.
- **Auth** (`libs/auth/`): `BetterAuthConfig` gains `wpGraphqlUrl`, `wpServiceToken`, `pgPool` fields. `init-auth.ts` registers `databaseHooks.user.create.after` that runs the lookup and writes `wp_user_id` via `pg.Pool`. Failures are logged, never thrown. New deps: `pg`, `@types/pg`. New helper: `wp-user-lookup.ts`.
- **Users subgraph** (`apps/users-subgraph/`): SDL replaces `User` with `AppUser`; adds `type Post @key(fields: "databaseId") { databaseId: Int! @external; appUser: AppUser }`; adds `users/users.module.ts` + `users.resolver.ts` with `AppUserReferenceResolver` and `PostAppUserResolver`; `me/me.resolver.ts` switches `@Resolver` argument from `'User'` to `'AppUser'`. `MeModule` is unchanged.
- **Backfill** (`scripts/backfill-wp-user-ids.sh`): one-shot bash script using `psql` (via `docker exec`) and `curl`. No new app.
- **Gateway** (`apps/gateway/`): no code change.
- **WordPress plugin**: no code change. WP's default `User @key(fields: "id")` is left as-is.
- **WordPress users**: `desafio-svc` promoted to administrator (one-time `wp user set-role` invocation).
- **Env vars** (`.env`, `.env.example`): add `WP_GRAPHQL_URL` (default `http://localhost:8080/graphql`) and `WP_GRAPHQL_SERVICE_TOKEN` (mint with the documented `desafio-svc` login mutation).
- **Frontend** (`apps/web/`): no required change. Existing `query Me { me { id email name } }` continues to work since `me: AppUser` exposes the same field set.
