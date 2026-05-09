## REMOVED Requirements

### Requirement: Post.appUser resolves to a federated AppUser across subgraphs

**Reason**: The previous design placed a custom `@ResolveField('appUser')` on `Post` in the users-subgraph (`PostAppUserResolver`). The challenge constrains our subgraphs to a single custom resolver (`Query.me`) — a custom `ResolveField` violates that constraint. The cross-subgraph join is reframed under the same capability via the WP federation plugin (see the new requirement below): WordPress emits `User.appUser` as an `AppUser` entity reference, and the gateway resolves it via the existing `AppUserReferenceResolver` (which is a federation primitive `@ResolveReference`, not a custom resolver). Clients traverse `Post.author.user.appUser` instead of `Post.appUser`.

**Migration**: GraphQL operations selecting `Post { appUser { ... } }` MUST be updated to `Post { author { node { user { appUser { ... } } } } }`. The `apps/web/src/components/molecules/user-badge.tsx` fragment continues to apply to the inner `AppUser`. The `PostAppUserResolver` and the `postAuthorWpId` DataLoader in `apps/users-subgraph/src/users/users.resolver.ts` and `apps/users-subgraph/src/users/loaders/loader-factory.ts` are deleted. The `WP_GRAPHQL_SERVICE_TOKEN` env var is no longer read by users-subgraph; it remains in use by the WP plugin's REST endpoint and by the MCP server.

### Requirement: Post.appUser is nullable when no matching user exists

**Reason**: The nullability semantics are now expressed through the WP federation plugin's `User.appUser` field — it returns `null` when the WP user has no `app_user_id` meta. The "post → app user" path's nullability is the composition of `Post.author?` (nullable per WP), `Post.author.user?` (nullable per WP), and `User.appUser?` (nullable per the plugin). Each hop short-circuits to `null` independently with no GraphQL errors.

**Migration**: Clients see `null` at `Post.author.user.appUser` whenever the WP user lacks an `app_user_id` meta (i.e., no Better Auth account is linked). UI code should handle this exactly as before — the path is just deeper.

### Requirement: Post.appUser resolver authenticates to WordPress with a service-account JWT

**Reason**: The resolver no longer exists. The WP-side resolution happens inside WordPress against its own database (no outbound HTTP fetch from users-subgraph), so no service-account JWT is needed for the read path. Writes (the backfill script and the Better Auth signup hook) DO use `WP_GRAPHQL_SERVICE_TOKEN` to authorize against the new `link-app-user` REST endpoint — that requirement is captured under the `wp-app-user-meta` capability.

**Migration**: No client-facing change. Operators MAY remove `WP_GRAPHQL_SERVICE_TOKEN` from the users-subgraph's env (it is no longer read there). The token is still required by the MCP server and by the backfill script.

## ADDED Requirements

### Requirement: Post → AppUser join is composed via pure federation hops

The supergraph SHALL resolve the "this post's author has an app-side user account" relationship as a chain of three federation primitives, with no custom resolver in any subgraph beyond `Query.me`:

1. WP exposes `Post.author.node` of type `User` (already present in WPGraphQL).
2. The WP federation plugin exposes `User.appUser: AppUser` returning an entity reference `{ __typename: "AppUser", id: <app_user_id> }` when the WP user's `app_user_id` meta is set, else `null`. (See the `wp-app-user-meta` capability.)
3. The gateway dispatches the entity reference to the users-subgraph's `AppUserReferenceResolver` (a `@ResolveReference`, which is a federation primitive). The users-subgraph returns the `AppUser` row.

#### Scenario: Cross-subgraph traversal returns the AppUser
- **WHEN** an unauthenticated client sends `query { post(id: 1, idType: DATABASE_ID) { id title author { node { user { appUser { id name } } } } } }` to the gateway, and the WP user authoring post 1 has `app_user_id = "uuid-1"` user meta
- **THEN** the response contains `{ post: { id, title, author: { node: { user: { appUser: { id: "uuid-1", name: <string> } } } } } }`

#### Scenario: No appUser link returns null without errors
- **WHEN** the WP user has no `app_user_id` meta and the same query is sent
- **THEN** `post.author.node.user.appUser` is `null` and other fields still resolve

#### Scenario: No author at all
- **WHEN** a post has no WP author (`post_author = 0`)
- **THEN** `post.author` is `null` and the rest of the query short-circuits with no errors

### Requirement: WordPress User type stays distinct from AppUser in the supergraph

The supergraph SHALL keep WordPress's `User` type and the users-subgraph's `AppUser` type as two distinct types. No subgraph SHALL re-declare `User` to merge fields with WordPress's `User`. The cross-subgraph join SHALL be expressed exclusively via WordPress's `User.appUser` field returning an `AppUser` entity reference.

#### Scenario: Supergraph has both User and AppUser
- **WHEN** the gateway composes the supergraph from the WP and users subgraphs
- **THEN** the schema introspection reports both `type User` (WordPress-owned, with WP fields plus `appUser: AppUser`) and `type AppUser` (users-subgraph-owned, with `id`, `email`, `name`)

#### Scenario: AppUser is owned by users-subgraph
- **WHEN** the gateway composes the supergraph
- **THEN** the `AppUser` type's owning subgraph is `users` (i.e., the users subgraph declares `type AppUser @key(fields: "id")` and supplies `__resolveReference`); WP only emits entity references, never the populated type
