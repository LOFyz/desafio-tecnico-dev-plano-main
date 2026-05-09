## ADDED Requirements

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
