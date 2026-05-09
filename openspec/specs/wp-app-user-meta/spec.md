### Requirement: WP federation plugin exposes User.appUser as an AppUser entity reference

The vendored WPGraphQL federation plugin (`docker/wordpress/plugins/wp-graphql-federations/`) SHALL register a non-null-on-presence `User.appUser: AppUser` field. The field's resolver SHALL read the user's `app_user_id` user meta (a UUID string). When the meta is set, the resolver SHALL return a federation entity reference of shape `{ __typename: "AppUser", id: <app_user_id> }`. When the meta is absent or empty, the resolver SHALL return `null`.

#### Scenario: WPGraphQL introspection reports User.appUser
- **WHEN** the WP container is rebuilt with the updated plugin and a client introspects the WPGraphQL schema
- **THEN** the `User` type contains a field `appUser: AppUser` (declared via the federation plugin's WPGraphQL field registration)

#### Scenario: WP user with the meta returns an entity reference
- **WHEN** WP user with `databaseId = 2` has `app_user_id` user meta set to `"abc-123"` and a client sends `{ user(id: "<wp-user-relay-id>") { appUser { __typename id } } }` to the federated gateway
- **THEN** the response is `{ user: { appUser: { __typename: "AppUser", id: "abc-123" } } }`

#### Scenario: WP user without the meta returns null
- **WHEN** WP user `databaseId = 5` has no `app_user_id` user meta and the same query is sent
- **THEN** the response is `{ user: { appUser: null } }` and no federation error is emitted

#### Scenario: Federation join hydrates the AppUser via users-subgraph
- **WHEN** a client sends `{ user(...) { appUser { id email name } } }` and the meta is set
- **THEN** the gateway plans the operation as: WP returns `{ __typename, id }`; the gateway dispatches the entity reference to users-subgraph's existing `AppUserReferenceResolver`; the users-subgraph returns the populated `AppUser`; the response carries `email` and `name` filled from Postgres

### Requirement: WP plugin writes app_user_id meta on a dedicated REST endpoint

The federation plugin SHALL register a WP REST route `POST /wp-json/desafio/v1/link-app-user` accepting a JSON body `{ "email": string, "app_user_id": string }`. The endpoint SHALL be protected by the WP service-account JWT (same `WP_GRAPHQL_SERVICE_TOKEN` already used for service calls). On success it SHALL look up the WP user by email, write the `app_user_id` user meta via `update_user_meta`, and return `{ "wp_user_id": <int> }`. On unknown email it SHALL return HTTP 404 with `{ "error": "user_not_found" }`. On an empty or non-UUID `app_user_id` it SHALL return HTTP 400.

#### Scenario: Successful link returns the WP user id
- **WHEN** a service-authenticated POST to `/wp-json/desafio/v1/link-app-user` with `{ "email": "alice@example.com", "app_user_id": "uuid-1" }` is sent and a WP user with that email exists
- **THEN** the response is `{ "wp_user_id": <int> }` and `get_user_meta(<int>, 'app_user_id', true)` returns `"uuid-1"`

#### Scenario: Unknown email is rejected
- **WHEN** the email does not match any WP user
- **THEN** the response is HTTP 404 with `{ "error": "user_not_found" }` and no meta is written

#### Scenario: Bad app_user_id is rejected
- **WHEN** `app_user_id` is empty, missing, or not a UUID
- **THEN** the response is HTTP 400 and no meta is written

#### Scenario: Missing service-account JWT is rejected
- **WHEN** the request omits the `Authorization: Bearer <token>` header (or the bearer is invalid)
- **THEN** the response is HTTP 401 and no meta is written

### Requirement: Better Auth signup hook posts the link to WP

`apps/users-subgraph` SHALL register a Better Auth `after.user.create` hook that POSTs to `${WP_GRAPHQL_URL}/wp-json/desafio/v1/link-app-user` with the new user's email and id, using the WP service-account bearer. The hook MUST be best-effort: a failure SHALL be logged but MUST NOT roll back the Better Auth signup. On success, the response's `wp_user_id` SHALL be written back to the new user's `wp_user_id` column so that the existing `Post.appUser` federation hop continues to work.

#### Scenario: New Better Auth signup is automatically linked to its WP user
- **WHEN** a user signs up via Better Auth with email `carol@example.com` and a WP user with that email exists with `databaseId = 7`
- **THEN** after the signup completes, the `app_users` row has `wp_user_id = 7` AND the WP user `databaseId = 7` has `app_user_id = <new-user-id>` user meta

#### Scenario: Signup succeeds even when WP is unreachable
- **WHEN** the WP container is down at signup time
- **THEN** the Better Auth signup completes with HTTP 200; `wp_user_id` is `NULL` on the new row; a warning is logged; the backfill script can repair the link later

#### Scenario: Signup with no matching WP user logs and continues
- **WHEN** a signup uses an email not present in WP
- **THEN** the WP endpoint returns 404; the hook logs a debug message and proceeds; the new user's `wp_user_id` is `NULL`

### Requirement: Backfill script populates app_user_id meta for existing users

A new shell script `scripts/backfill-app-user-ids.sh` SHALL walk the `app_users` table for rows with `wp_user_id IS NOT NULL` and POST each `(email, id)` pair to the WP `link-app-user` endpoint with the service-account bearer. The script SHALL be idempotent (re-running produces the same end state) and SHALL print per-user success/failure plus a final summary count.

#### Scenario: Fresh backfill writes meta for all linked users
- **WHEN** there are 10 `app_users` rows with non-null `wp_user_id` and none of the corresponding WP users have `app_user_id` meta yet
- **THEN** running `scripts/backfill-app-user-ids.sh` writes the meta on all 10 WP users and prints `Linked 10 users (0 failures)`

#### Scenario: Re-running the backfill is idempotent
- **WHEN** the backfill is run a second time immediately after a successful run
- **THEN** the script reports `Linked 10 users (0 failures)` again (each `update_user_meta` is a no-op overwrite) and no rows are changed

#### Scenario: Backfill skips unlinked rows
- **WHEN** an `app_users` row has `wp_user_id IS NULL`
- **THEN** the script does not call the WP endpoint for that row and does not count it in the linked total
