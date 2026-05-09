## ADDED Requirements

### Requirement: Post.appUser resolves to a federated AppUser across subgraphs
The federated schema SHALL expose `Post.appUser: AppUser` such that the `AppUser` is owned by the `users` subgraph (Better Auth–backed) and the `Post` extension is contributed by the users subgraph via Apollo Federation `@external`. The bridge between Post and AppUser SHALL be: WordPress's `Post.author.node.databaseId` → Better Auth `user.wp_user_id` (column) → `AppUser`.

#### Scenario: Cross-subgraph fields composed in a single query
- **WHEN** a client sends `query { post(id: 1, idType: DATABASE_ID) { id title appUser { id email name } } }` to the gateway
- **THEN** the gateway plans a fetch to the posts subgraph for `id`, `title`, and the post's `databaseId` (the federation key), then dispatches the Post reference to the users subgraph for `appUser`, where the resolver fetches the WP author's `databaseId` via service-account WPGraphQL and returns the matching `AppUser` from Postgres

#### Scenario: Author with matching Better Auth user
- **WHEN** a WordPress post has `databaseId = 1`, its WP author has `databaseId = 1`, and a Better Auth user exists with `wp_user_id = 1`
- **THEN** `Post.appUser` resolves to that Better Auth user with `id`, `email`, and `name` populated from the `user` table

### Requirement: Post.appUser is nullable when no matching user exists
`Post.appUser` SHALL be a nullable field. When the WordPress post has no author, the WP service-account fetch fails, or the WP author's `databaseId` does not match any row in the Better Auth `user` table (i.e., no row has `wp_user_id` equal to that value), `Post.appUser` SHALL resolve to `null`. The query SHALL NOT error and other fields on the post SHALL still resolve.

#### Scenario: Author has no Better Auth account
- **WHEN** a post's WordPress author has `databaseId = 99` and no Better Auth user has `wp_user_id = 99`
- **THEN** the response contains `post.appUser = null` and `post.title`, `post.id` are still returned with no GraphQL errors

#### Scenario: WordPress post has no author at all
- **WHEN** a post has no associated WordPress author (e.g., `post_author = 0`)
- **THEN** `post.appUser` resolves to `null` without errors

#### Scenario: WordPress unreachable
- **WHEN** WordPress is down or `WP_GRAPHQL_SERVICE_TOKEN` is missing/invalid
- **THEN** `post.appUser` resolves to `null` and the resolver logs a warning; other post fields still resolve

### Requirement: WordPress User type stays distinct from AppUser in the supergraph
The supergraph SHALL keep WordPress's `User` type and the users-subgraph's `AppUser` type as two distinct types. No subgraph SHALL re-declare `User` to merge fields with WordPress's `User`. The cross-subgraph join SHALL be expressed exclusively as `Post.appUser: AppUser` contributed by the users subgraph.

#### Scenario: Supergraph has both User and AppUser
- **WHEN** the gateway composes the supergraph from the two subgraphs
- **THEN** the schema introspection reports both `type User` (WordPress-owned, with WP fields) and `type AppUser` (users-subgraph-owned, with `id`, `email`, `name`)

#### Scenario: databaseId is publicly readable on WordPress posts
- **WHEN** an unauthenticated GraphQL query asks WordPress for `post(...) { author { node { databaseId } } }`
- **THEN** the response contains a non-null integer `databaseId`, so the gateway can plan `Post @key(fields: "databaseId")` traversal without authenticating to WordPress

### Requirement: Post.appUser resolver authenticates to WordPress with a service-account JWT
The `Post.appUser` resolver in the users subgraph SHALL fetch the post's author from WordPress via WPGraphQL using `Authorization: Bearer ${WP_GRAPHQL_SERVICE_TOKEN}`. The token SHALL be minted from the WP user `desafio-svc` (provisioned by `docker-entrypoint-custom.sh`) which MUST have the `administrator` role so that WPGraphQL allows reading author fields like `databaseId` and `email`.

#### Scenario: Authenticated WP fetch returns author databaseId
- **WHEN** the resolver calls WP for post 16 (authored by WP user 2) with the service-account JWT
- **THEN** WP returns `post.author.node.databaseId = 2`

#### Scenario: Missing token short-circuits to null
- **WHEN** `WP_GRAPHQL_SERVICE_TOKEN` is not configured
- **THEN** the resolver returns `null` for `Post.appUser` and logs a warning, without attempting the fetch
