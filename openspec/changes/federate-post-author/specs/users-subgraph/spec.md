## ADDED Requirements

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
