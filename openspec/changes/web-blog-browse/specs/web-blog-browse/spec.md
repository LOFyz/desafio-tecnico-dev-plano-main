## ADDED Requirements

### Requirement: Public blog index lists WordPress posts via the gateway

The web app SHALL expose a public route at `/blog` that renders the most recent WordPress posts fetched through the federated gateway. The route MUST be publicly accessible (no session required) and MUST NOT be matched by the `(protected)` middleware. Each rendered post SHALL include the post title, excerpt, publish date, and an author block populated from the federated `Post.appUser` field. Posts SHALL be ordered most-recent first (the WordPress default).

#### Scenario: Anonymous visitor sees the first page of posts
- **WHEN** an unauthenticated visitor navigates to `/blog`
- **THEN** the page MUST render without redirecting to `/sign-in`
- **AND** the page MUST display up to 10 posts (the configured page size), each with title, excerpt, date, and an author block

#### Scenario: Each post shows the author from Post.appUser
- **WHEN** a post in the list has a matching Better Auth user (its WP author email matches a `wp_user_id` in the `user` table)
- **THEN** the post card MUST render the user's `name` (and a recognizable visual treatment) sourced from `Post.appUser`

#### Scenario: Posts without a matching Better Auth user render gracefully
- **WHEN** a post's `appUser` resolves to `null` (no matching Better Auth account, WP unreachable, or token missing)
- **THEN** the post card MUST still render with all other fields, replacing the author block with a neutral "Author unknown" placeholder
- **AND** the page MUST NOT show a GraphQL error to the visitor

### Requirement: Blog index uses Relay-spec cursor pagination with a Load more action

The `/blog` page SHALL paginate posts using the Relay connection spec exposed by the federated gateway: `posts(first: $first, after: $after) { edges { cursor node { ...PostCardFragment } } pageInfo { endCursor hasNextPage } }`. The page SHALL render a single "Load more" button when `pageInfo.hasNextPage` is `true`, and clicking it SHALL append the next page into the existing list via Apollo's `relayStylePagination` cache merge — the previously loaded posts MUST remain visible and stable.

#### Scenario: Load more appends the next page
- **WHEN** the page has loaded 10 posts and the cache reports `hasNextPage: true`
- **AND** the visitor clicks "Load more"
- **THEN** the client MUST issue a `posts(first: 10, after: <endCursor>)` query
- **AND** the returned edges MUST be appended to the existing list (no duplicates, prior posts unchanged)

#### Scenario: Load more is hidden when there are no more pages
- **WHEN** `pageInfo.hasNextPage` is `false`
- **THEN** the "Load more" button MUST NOT be rendered

#### Scenario: Load more is disabled while a page is in flight
- **WHEN** the visitor clicks "Load more" and the next-page request is pending
- **THEN** the button MUST be disabled and indicate loading until the request resolves

### Requirement: Public post detail page renders by slug with the federated author

The web app SHALL expose a public route at `/blog/[slug]` that fetches a single WordPress post by slug via the federated gateway and renders its title, full content, publish date, and the author block populated from `Post.appUser`. The page SHALL be a React Server Component that issues the query through the server-side Apollo client (`getClient().query()`) so the rendered HTML contains the post body without a client-side waterfall.

#### Scenario: Visitor opens an existing post by slug
- **WHEN** an unauthenticated visitor navigates to `/blog/<existing-slug>`
- **THEN** the server MUST execute `query PostDetail($slug: ID!) { post(id: $slug, idType: SLUG) { ...PostDetailFragment } }`
- **AND** the response MUST be rendered server-side, including the author block when `appUser` is non-null

#### Scenario: Visitor opens a non-existent slug
- **WHEN** an unauthenticated visitor navigates to `/blog/<unknown-slug>`
- **AND** the gateway returns `post: null`
- **THEN** the page MUST render Next.js's `notFound()` (HTTP 404) instead of throwing

#### Scenario: Author missing on detail page
- **WHEN** the requested post resolves with `appUser: null`
- **THEN** the page MUST render the post body and show the same "Author unknown" placeholder as the index page
- **AND** the page MUST NOT error

### Requirement: Web app generates typed GraphQL operations via the client preset

The web app SHALL configure `@graphql-codegen/cli` with the `@graphql-codegen/client-preset` to generate a typed `graphql()` tag from inline `graphql(/* GraphQL */ ` … `)` literals embedded in `.ts`/`.tsx` files under `apps/web/src/`. Generated artifacts SHALL live under `apps/web/src/gql/` (committed to version control to keep `nx build web` runnable on a fresh clone without pre-running codegen). Components SHALL import the typed `graphql()` from `@/gql` and pass the resulting `TypedDocumentNode` to Apollo Client hooks; raw `gql\`\`\`` template literals SHALL NOT be used in feature code.

#### Scenario: Codegen produces typed documents
- **WHEN** a developer runs `pnpm nx run web:codegen` against a running gateway
- **THEN** the command MUST exit with status 0
- **AND** `apps/web/src/gql/index.ts` MUST export a `graphql()` function whose return type is `TypedDocumentNode<TData, TVariables>` derived from the operation source

#### Scenario: Component consumes a typed document
- **WHEN** a React component imports `graphql` from `@/gql` and writes `const POSTS = graphql(/* GraphQL */ \`query PostsList($first: Int!, $after: String) { posts(first: $first, after: $after) { ... } }\`)`
- **THEN** `useQuery(POSTS, { variables: { first, after } })` MUST infer `data` and `variables` types from the operation without manual annotations

#### Scenario: Schema source is the federated gateway
- **WHEN** codegen runs
- **THEN** the `schema` field in `apps/web/codegen.ts` MUST resolve to `${CODEGEN_SCHEMA_URL ?? 'http://localhost:3000/graphql'}` (the federated gateway endpoint)
- **AND** the generated types MUST include cross-subgraph fields like `Post.appUser` because they exist on the supergraph

### Requirement: Component-colocated fragments compose into queries

Each rendered post component MUST own its data shape via a co-located GraphQL fragment declared as a `graphql(/* GraphQL */ \`fragment ...\`)` literal in the same module that consumes it. Parent queries (`PostsList`, `PostDetail`) SHALL spread those fragments rather than re-listing fields. The list page SHALL select via `PostCardFragment`; the detail page SHALL select via `PostDetailFragment`.

#### Scenario: List query selects via the card fragment
- **WHEN** the `PostsList` query is generated
- **THEN** the SDL of the operation MUST include `...PostCardFragment` on `Post`
- **AND** changing `PostCardFragment` to add a new field MUST automatically widen the typed `node` returned by `useQuery(POSTS)`

#### Scenario: Detail query selects via the detail fragment
- **WHEN** the `PostDetail` query is generated
- **THEN** the SDL of the operation MUST include `...PostDetailFragment` on `Post`

### Requirement: Reuse the foundation's relayStylePagination and useRelayConnection

The change SHALL NOT register a new field policy for `Query.posts` — the foundation's `apps/web/src/lib/apollo/type-policies.ts` already configures `relayStylePagination(['where'])`. The list component SHALL consume the foundation's `useRelayConnection` hook with `connectionPath: 'posts'` to get `items`, `hasNextPage`, `loadMore`, and `isLoadingMore`.

#### Scenario: List component uses the foundation hook
- **WHEN** the list component is implemented
- **THEN** it MUST import `useRelayConnection` from `@/lib/apollo/use-relay-connection`
- **AND** it MUST NOT call `useQuery` + `fetchMore` directly with its own pagination plumbing
- **AND** it MUST NOT add a duplicate `Query.posts` entry in `type-policies.ts`
