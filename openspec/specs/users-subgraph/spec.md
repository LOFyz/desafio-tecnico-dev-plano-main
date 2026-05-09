## ADDED Requirements

### Requirement: users-subgraph is an Apollo Federation subgraph serving GraphQL
`apps/users-subgraph` SHALL be a NestJS application registered as an Apollo Federation subgraph using `ApolloFederationDriver` in schema-first mode, exposing a `/graphql` endpoint with a valid subgraph SDL.

#### Scenario: Subgraph responds to federation introspection
- **WHEN** Apollo Router or the gateway sends a `_service { sdl }` introspection query
- **THEN** the subgraph returns its SDL including federation directives (`@key`, `@shareable`, etc.)

#### Scenario: GraphQL playground accessible in development
- **WHEN** the app runs in development mode and a browser navigates to `/graphql`
- **THEN** a GraphQL playground (or sandbox) is rendered

### Requirement: me query returns the current authenticated user from Better Auth session
The GraphQL schema SHALL define `type Query { me: AppUser }` where `AppUser` is a federation entity type. The `MeResolver` SHALL dispatch a CQRS `GetMeQuery` with the `sessionId` from GraphQL context; the handler returns the Better Auth session's user or `null`.

#### Scenario: Authenticated request returns user
- **WHEN** a request carries a valid Better Auth session cookie and resolves `query { me { id email name } }`
- **THEN** the response contains the authenticated user's `id`, `email`, and `name`

#### Scenario: Unauthenticated request returns null
- **WHEN** a request has no session cookie and resolves `query { me { id } }`
- **THEN** `data.me` is `null` and no error is thrown

#### Scenario: Expired session returns null
- **WHEN** a request carries an expired session token
- **THEN** `data.me` is `null`

### Requirement: GraphQL context carries sessionId extracted from cookie
The `GraphQLModule` context factory SHALL extract the `better-auth.session_token` cookie from the HTTP request and expose it as `sessionId` in the typed `GqlContext`. All resolvers receive this context.

#### Scenario: Cookie present in request
- **WHEN** the incoming HTTP request has a `cookie` header containing `better-auth.session_token=<token>`
- **THEN** `context.sessionId` equals `<token>`

#### Scenario: Cookie absent in request
- **WHEN** the incoming HTTP request has no `better-auth.session_token` cookie
- **THEN** `context.sessionId` is `undefined`

### Requirement: Better Auth REST handler is mounted at /auth/**
`apps/users-subgraph` SHALL mount the Better Auth HTTP handler at `/auth` so that the Better Auth client can call sign-in, sign-out, session, and OAuth redirect endpoints via REST.

#### Scenario: Sign-in endpoint responds
- **WHEN** a POST request is sent to `/auth/sign-in/email` with valid credentials
- **THEN** the response sets a session cookie and returns a 200 status

#### Scenario: Session endpoint responds
- **WHEN** a GET request is sent to `/auth/get-session` with a valid session cookie
- **THEN** the response returns the current session object as JSON

### Requirement: User entity stores wp_user_id for cross-subgraph federation
The Better Auth `user` table SHALL include a nullable `wp_user_id INT` column (indexed, NOT unique) that stores the WordPress `User.databaseId` of the matching WP author when one exists. The `UserEntity` MikroORM schema SHALL expose this value as `databaseId: number | null` (mapped to the `wp_user_id` column via `fieldName('wp_user_id')`). The value is internal to the entity — it is NOT exposed on the `User` domain interface and NOT exposed in the GraphQL SDL.

#### Scenario: New user inserted starts with null wp_user_id
- **WHEN** a Better Auth signup creates a new row in the `user` table
- **THEN** `wp_user_id` is initially `NULL` until the post-signup hook populates it

#### Scenario: Entity exposes databaseId
- **WHEN** the CQRS handler reads a `UserEntity` row with `wp_user_id = 1`
- **THEN** the entity's `databaseId` property is `1` (used internally to drive `findOne({ databaseId: ... })`)

#### Scenario: databaseId is null when no WP match
- **WHEN** a Better Auth user has no matching WP user (e.g., signed up with an email no WP author uses)
- **THEN** the entity's `databaseId` is `null`

### Requirement: Users subgraph exposes AppUser type (not User) to avoid WP collision
The users subgraph SHALL declare `type AppUser` (NOT `User`) as its federation entity for Better Auth users. The `me` query SHALL return `AppUser`. This rename intentionally avoids merging with WordPress's `User` type in the federated supergraph.

#### Scenario: Subgraph SDL declares AppUser
- **WHEN** the gateway introspects the users subgraph via `_service { sdl }`
- **THEN** the SDL contains `type AppUser @key(fields: "id")` and `type Query { me: AppUser }`, with no `type User` declaration

#### Scenario: me query returns AppUser shape
- **WHEN** an authenticated client queries `query { me { id email name } }` against the gateway
- **THEN** the response returns the Better Auth user's `id`, `email`, and `name`, with the GraphQL type being `AppUser`

### Requirement: AppUser entity is federation-resolvable by id
The users subgraph SHALL declare `type AppUser @key(fields: "id")` and SHALL register a `__resolveReference` resolver that hydrates an `AppUser` from a representation of shape `{ __typename: 'AppUser', id: <uuid> }`.

#### Scenario: Resolve by id
- **WHEN** the gateway sends an `_entities` query with representation `{ __typename: "AppUser", id: "<uuid>" }`
- **THEN** the users subgraph returns the `AppUser` row whose `id` equals `<uuid>`, with `id`, `email`, and `name` populated, or `null` if no row matches

#### Scenario: No session required for reference resolution
- **WHEN** an `_entities` query arrives without a Better Auth session cookie
- **THEN** the resolver still returns the matching user (or `null`) without erroring on auth

### Requirement: Post.appUser resolver lives in the users subgraph
The users subgraph SHALL contribute a `Post.appUser: AppUser` field via Apollo Federation extension: `extend type Post @key(fields: "databaseId") { databaseId: Int! @external; appUser: AppUser }`. The resolver SHALL fetch the WP post's author `databaseId` via authenticated WPGraphQL and dispatch a `FindUserByDatabaseIdQuery` to look up the matching Better Auth user.

#### Scenario: Resolver fetches author then looks up user
- **WHEN** the gateway sends a Post reference `{ __typename: "Post", databaseId: 1 }` to the users subgraph for `appUser` resolution
- **THEN** the resolver issues a WPGraphQL query for `post(id: "1", idType: DATABASE_ID) { author { node { databaseId } } }` with the service-account JWT, receives `databaseId: N`, dispatches `FindUserByDatabaseIdQuery(N)`, and returns the resulting `AppUser` (or `null` if no row matches)

### Requirement: User reference lookups go through CQRS query handlers
Both `__resolveReference` and `Post.appUser` resolvers SHALL dispatch CQRS queries (`FindUserByIdQuery`, `FindUserByDatabaseIdQuery`) handled in `libs/users/application` and SHALL NOT call `BetterAuth.api.getSession` or any other session-bound API for entity hydration. The query handlers SHALL read from the `user` table via the existing `UserEntity` MikroORM schema.

#### Scenario: Lookup hits the database directly
- **WHEN** a resolver receives a representation with `databaseId: 1`
- **THEN** the resolver dispatches `FindUserByDatabaseIdQuery({ databaseId: 1 })` and the handler issues a single SELECT against the `user` table by the indexed `wp_user_id` column

### Requirement: Better Auth post-signup hook populates wp_user_id from WordPress
The Better Auth configuration SHALL register a `databaseHooks.user.create.after` hook that, after a new user row is inserted, looks up a WordPress user matching the new account's `email` via authenticated WPGraphQL (using `WP_GRAPHQL_SERVICE_TOKEN`) and writes the matched `databaseId` to the `wp_user_id` column. The persistence SHALL be done via a `pg.Pool` direct UPDATE — Better Auth's adapter silently drops writes to fields outside its native schema, so it cannot be used for this column. Failures (WP unreachable, no match, multiple matches, DB write error) SHALL NOT cause the signup to fail; they SHALL be logged and `wp_user_id` SHALL remain `NULL`.

#### Scenario: Signup with matching WP user populates wp_user_id
- **WHEN** a user signs up with email `admin@email.com` and a WordPress user exists with that email and `databaseId = 1`
- **THEN** the new `user` row has `wp_user_id = 1` after the hook completes, and a "Linked admin@email.com → WP databaseId 1" log line is emitted

#### Scenario: Signup with no matching WP user leaves wp_user_id null
- **WHEN** a user signs up with email `nobody@example.com` and no WordPress user has that email
- **THEN** the new `user` row has `wp_user_id = NULL`, the signup completes successfully (HTTP 200), and a debug log records the no-match outcome

#### Scenario: Signup succeeds when WordPress is unreachable
- **WHEN** a user signs up while the WordPress subgraph is down or `WP_GRAPHQL_SERVICE_TOKEN` is invalid
- **THEN** the signup still completes (HTTP 200), the `user` row is inserted with `wp_user_id = NULL`, and a warning log records the failed lookup

### Requirement: Backfill script populates wp_user_id for existing users
A shell script at `scripts/backfill-wp-user-ids.sh` SHALL exist that, when run, iterates every row in `user` where `wp_user_id IS NULL`, performs the same WPGraphQL lookup as the post-signup hook, and writes the matched `databaseId` if exactly one WP user matches the email. The script SHALL be idempotent and SHALL skip rows with no match.

#### Scenario: Backfill updates pre-existing user with WP match
- **WHEN** the `user` table contains a row with `email = 'admin@email.com'` and `wp_user_id IS NULL`, and a WordPress user exists with that email and `databaseId = 1`, and the operator runs `./scripts/backfill-wp-user-ids.sh`
- **THEN** after the script completes, the row's `wp_user_id` is `1` and a `✓ admin@email.com → 1` log line is emitted

#### Scenario: Backfill skips users with no WP match
- **WHEN** a `user` row's email does not match any WordPress user
- **THEN** the row's `wp_user_id` remains `NULL` after backfill

#### Scenario: Backfill is idempotent
- **WHEN** the backfill is run twice in succession
- **THEN** the second run only processes rows still `NULL` and does not duplicate updates or fail

### Requirement: Post.appUser resolver batches WordPress author lookups via DataLoader

The `PostAppUserResolver` in `apps/users-subgraph` SHALL resolve `Post.appUser` through a per-request DataLoader (`postAuthorWpIdLoader`) that batches multiple `Post` references arriving in the same GraphQL operation into a **single** authenticated WPGraphQL call of the form `posts(where: {in: [<…databaseIds>]}) { nodes { databaseId author { node { databaseId } } } }`. The resolver MUST NOT issue one HTTP fetch per post when more than one Post reference is in flight on the same request.

#### Scenario: List of N posts resolves with one WP fetch
- **WHEN** a client query `query { posts(first: 10) { edges { node { id appUser { id } } } } }` reaches the federated gateway and the users subgraph receives 10 Post references for `appUser` resolution
- **THEN** the users subgraph MUST issue exactly 1 HTTP request to WPGraphQL (via the service-account JWT) for the batched author lookup
- **AND** each post MUST receive its corresponding author `databaseId` (or `null` when the post has no author)

#### Scenario: WP returns rows in arbitrary order
- **WHEN** WPGraphQL responds to the batched `posts(where:{in:[3,1,2]})` query with nodes in any order
- **THEN** the loader's batch function MUST reorder the results to align 1:1 with the input keys
- **AND** any input `databaseId` with no matching node MUST resolve to `null` for that key

#### Scenario: Single Post.appUser resolution still works
- **WHEN** a single `Post.appUser` resolution is in flight (e.g. the detail page query)
- **THEN** the loader MUST still produce the correct author and the resolver MUST return the matching `AppUser` (or `null`)

### Requirement: AppUser lookup batches Postgres SELECTs via DataLoader

The `PostAppUserResolver` SHALL resolve the looked-up Better Auth user via a second per-request DataLoader (`appUserByWpIdLoader`) keyed on the WP author `databaseId`. The loader's batch function SHALL dispatch a single CQRS query (`FindUsersByDatabaseIdsQuery`) whose handler executes a single Postgres SELECT of shape `WHERE wp_user_id IN (…)` against the `user` table, regardless of how many Post.appUser fields are being resolved in the same request.

#### Scenario: Batched user lookup hits the database once
- **WHEN** N (N ≥ 2) Post references in one GraphQL request all need their `appUser` resolved
- **THEN** the users subgraph MUST dispatch exactly 1 `FindUsersByDatabaseIdsQuery`
- **AND** the handler MUST execute exactly 1 SELECT against the `user` table

#### Scenario: Handler returns results in input order
- **WHEN** the CQRS handler receives `FindUsersByDatabaseIdsQuery({ databaseIds: [5, 2, 9] })`
- **THEN** the returned array MUST be of length 3 in the order `[user(databaseId=5), user(databaseId=2), user(databaseId=9)]`
- **AND** any input id with no matching row MUST be returned as `null` at the same index

#### Scenario: Missing matches resolve to null
- **WHEN** one of the batched `databaseId`s does not match any Better Auth row
- **THEN** that input id's slot in the returned array MUST be `null`
- **AND** the resolver MUST surface `Post.appUser: null` for that post without raising a GraphQL error

### Requirement: DataLoaders are per-request scoped on GqlContext

The two DataLoaders (`postAuthorWpIdLoader`, `appUserByWpIdLoader`) SHALL be constructed once per GraphQL request and exposed on the `GqlContext` (e.g. `ctx.loaders.postAuthorWpId`, `ctx.loaders.appUserByWpId`). Loader instances MUST NOT be shared across HTTP requests; each new GraphQL operation MUST receive a fresh pair.

#### Scenario: Fresh loaders per request
- **WHEN** two separate HTTP requests (Request A and Request B) hit the users subgraph and both resolve Post.appUser
- **THEN** Request A and Request B MUST use distinct loader instances
- **AND** a cache hit in Request A MUST NOT influence the result returned to Request B

#### Scenario: Loaders are reachable from the resolver
- **WHEN** `PostAppUserResolver.appUser()` runs
- **THEN** it MUST read its loaders from the GraphQL context (`@Context()` argument), NOT instantiate them inline

### Requirement: FindUsersByDatabaseIdsQuery handler exists in users application

The users application library (`libs/users/application`) SHALL expose a `FindUsersByDatabaseIdsQuery` (constructor parameter: `{ databaseIds: number[] }`) and a corresponding `IQueryHandler` registered in the `USER_QUERY_HANDLERS` array. The handler SHALL use the existing `UserEntity` MikroORM repository to issue a single `findAll({ databaseId: { $in: databaseIds } })` and SHALL return `(User | null)[]` aligned 1:1 with the input ids.

#### Scenario: Handler returns aligned results
- **WHEN** the handler is invoked with `databaseIds: [1, 2]` and only the row with `databaseId = 1` exists
- **THEN** the handler MUST return `[<user>, null]`

#### Scenario: Handler accepts an empty input list
- **WHEN** the handler is invoked with `databaseIds: []`
- **THEN** it MUST return `[]` without issuing any database query
