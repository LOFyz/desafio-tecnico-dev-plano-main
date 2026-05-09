## Context

The gateway already federates two subgraphs — `users` (NestJS, Better Auth–backed) and `posts` (WordPress via the in-house `wp-graphql-federations` plugin) — but there is no actual cross-subgraph data join today. WordPress posts carry an author (WP `User`, integer `databaseId`, with an email), and Better Auth stores users in PostgreSQL with a UUID `id` and a unique `email`. The two systems share no native identifier.

Two prior attempts informed this design:

1. **Email as the join key** — abandoned during apply because WPGraphQL gates `User.email` behind the `list_users` capability. Unauthenticated subgraph traffic gets `email: null`, so the gateway can never build the federation reference.

2. **Multi-key `User @key(id) @key(databaseId)`** — abandoned during apply because both subgraphs declared a `User` type. WordPress's `User` implements `Commenter` and `DatabaseIdentifier` (`databaseId: Int!`), forcing field types we couldn't match while keeping `wp_user_id` nullable. Even after matching with `Int!` + sentinels and using `@override`, the gateway picked WP's resolver for shared fields and returned `email: null` from WP rather than traversing to us.

Final approach: don't merge user types across subgraphs. Rename our subgraph's user type to `AppUser` and contribute the join via an `extend type Post { appUser: AppUser }` field whose resolver fetches the WP author server-side using a service-account JWT, then looks up our user by `wp_user_id`.

## Goals / Non-Goals

**Goals:**
- A working `Post.appUser → AppUser` join through the gateway, returning the Better Auth user that owns the WP author email (when one exists).
- Persist the WP user ID on the Better Auth `user` row (`wp_user_id INT NULL`) and look it up via a CQRS handler.
- Auto-populate `wp_user_id` at signup using the existing `desafio-svc` WP service account, so future signups Just Work.
- Backfill `wp_user_id` for existing Better Auth users via a one-shot shell script.
- Tolerate the no-match case: `Post.appUser` is nullable; signup must not fail if WP is down or no WP user exists.
- Keep the gateway untouched.

**Non-Goals:**
- No two-way sync (we do not create WP users from Better Auth signups, nor vice versa).
- No real-time sync from WP-side user changes back into Better Auth.
- No DataLoader / batched-reference optimization in v1.
- No exposing WP-side fields like `avatar` on `AppUser`. Only the Better Auth fields are returned.
- No change to `me` query semantics or Better Auth session handling.
- No password/account synchronization between WP and Better Auth.

## Decisions

### 1. WP `databaseId` is the join key (not email, not WP global ID)
- **Email** was the first pick but is gated by WP capability checks → `email: null` on unauthenticated subgraph traffic.
- **WP global ID** is a Relay base64-encoded string — annoying to decode, and meaningless to Better Auth.
- **WP `databaseId`** is a public integer, stable, easy to store and index. Wins.

### 2. Materialize `wp_user_id` on the Better Auth `user` row
We pay a one-time WP lookup at signup (and once per existing user during backfill); resolution is then a single indexed Postgres SELECT.

### 3. Better Auth `databaseHooks.user.create.after` populates `wp_user_id`
The hook receives the new user, looks up by email via WPGraphQL with the service-account JWT, and writes `wp_user_id` directly. Best-effort — failures log, never throw.

### 4. Persistence goes through `pg.Pool` directly, not Better Auth's adapter
We tried Better Auth's `adapter.update({ update: { databaseId } })` and even configured `additionalFields` with `fieldName: 'wp_user_id'`. The adapter logs a successful "update" but no row in the DB ever changes — it silently drops writes to fields outside its native schema. Direct `pg.Pool.query("UPDATE \"user\" SET wp_user_id = $1 WHERE id = $2", ...)` actually persists.

The `pg.Pool` is a single shared instance lazy-constructed in `BetterAuthConfigFactory` from the existing `DB_*` env vars. Adds `pg` and `@types/pg` as direct deps to `libs/auth`.

### 5. WPGraphQL service token (`WP_GRAPHQL_SERVICE_TOKEN`) lives in the users subgraph
The token authenticates both the post-signup hook lookup, the backfill app, and the runtime `Post.appUser` resolver fetch. Minted from `desafio-svc` (provisioned by `docker-entrypoint-custom.sh`). The token never crosses the wire to the frontend.

### 6. `desafio-svc` is promoted from `editor` to `administrator`
WPGraphQL's email gating requires `list_users` capability, which `editor` doesn't have but `administrator` does. One-time `wp user set-role desafio-svc administrator` invocation. Documented in tasks.

### 7. AppUser, not User, is our subgraph's federation type
WP exposes `type User` with many WP-specific fields and interfaces. Our subgraph used to expose `type User` too. Apollo Federation merges types by name into the supergraph, which forced cascading conflicts (interface compliance, field type mismatches, resolver routing). Renaming our type to `AppUser` removes the merge entirely. WP still has `User`; we have `AppUser`; they coexist.

### 8. Post.appUser is contributed by our subgraph via @external extension
```graphql
type Post @key(fields: "databaseId") {
  databaseId: Int! @external
  appUser: AppUser
}
```
WP owns Post. We extend it with `appUser`. The gateway dispatches Post references to us for the new field; we own the resolution.

### 9. The Post.appUser resolver does a server-side WP fetch
Given `{ Post.databaseId }`, our resolver issues:
```graphql
query { post(id: $id, idType: DATABASE_ID) { author { node { databaseId } } } }
```
to WP with the service-account JWT. It then dispatches `FindUserByDatabaseIdQuery(N)` and returns the matching Better Auth user (or `null`).

This is a server-side orchestration call, not pure federation traversal. Trade-off: one extra HTTP per `Post.appUser` field. For demo volumes, fine. A future optimization: register a DataLoader so a `posts { nodes { appUser } }` query batches into one WP fetch.

### 10. Lookup goes through CQRS, mirroring `GetMeQuery`
Two new query handlers in `libs/users/application/`:
- `FindUserByIdQuery` → MikroORM `findOne({ id })`.
- `FindUserByDatabaseIdQuery` → MikroORM `findOne({ databaseId })` (mapped to `wp_user_id` column).

### 11. No DataLoader in v1
For demo data, single-row Postgres SELECTs are cheap. Revisit if profiling shows N+1.

### 12. Do NOT add a UNIQUE constraint on `wp_user_id`
Two Better Auth users mapping to the same WP user would be a logical bug, but if it ever happens we want resolution to still succeed (returning the first match) rather than crash on a constraint violation. Index, not unique.

### 13. AppUser does NOT expose databaseId in the SDL
The internal `UserEntity.databaseId` (column `wp_user_id`) is used for lookup but never returned to the client. Keeps the GraphQL surface clean and avoids exposing a WP integer ID to public callers.

### 14. WP plugin needs no change
We initially flipped the WP federation plugin's `User` core key from `id` to `databaseId`. Once we pivoted to `Post.appUser` (Post-extension instead of User-merge), WP's `User` is no longer referenced by our subgraph. The default `User @key(id)` works fine for WP-internal queries and for composition. The plugin edit was reverted.

### 15. Backfill is a shell script, not a Nest app
We built a Nest standalone backfill app first (cloning the migrator pattern, ~5 files of scaffolding). It worked, but for ~10 rows of one-shot work it was overkill. Replaced with `scripts/backfill-wp-user-ids.sh` (~30 lines of bash + curl + psql) that does the same thing with no compilation step.

## Risks / Trade-offs

- **[Risk] `desafio-svc` administrator role is broad.** The token has full WP admin powers, not just author lookup. → Mitigation: token never leaves the users subgraph; documented in `.env.example`. A future change can scope down via a custom WP capability or a dedicated read-only role.
- **[Risk] WP service token expires or rotates.** → Mitigation: the entrypoint mints a 10-year JWT (`desafio-jwt-expiration.php`). Failures in the hook and resolver are logged but not fatal.
- **[Risk] Per-request WP fetch in `Post.appUser` adds latency.** ~50ms locally per resolution. → Mitigation: accepted for v1; revisit with DataLoader if it bites.
- **[Risk] WP user changes email after signup → `wp_user_id` is now stale.** → Mitigation: out of scope; document in non-goals.
- **[Risk] Two Better Auth users with similar emails matching the same WP user.** → Mitigation: lookup helper only writes `wp_user_id` when *exactly one* WP match is found (case-insensitive email match).
- **[Trade-off] Three new env vars (`WP_GRAPHQL_URL`, `WP_GRAPHQL_SERVICE_TOKEN`).** → Acceptable; documented in `.env.example`.
- **[Trade-off] Backfill is a manual deploy step.** → Acceptable for the demo.
- **[Trade-off] Better Auth's adapter is unusable for our additional column.** → Worked around with direct `pg.Pool`. Slight layering smell but isolated and tested.
