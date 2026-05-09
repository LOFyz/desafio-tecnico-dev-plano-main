## Why

The federation work shipped in `federate-post-author` exposes `Post.appUser` on the gateway, but nothing in the web app reads it — the dashboard is a "Hello, name" stub and there is no posts surface at all. To validate the federation end-to-end and start delivering the "blog autenticado" the brief calls for, the web app needs a public blog feed that lists WordPress posts and renders the joined Better Auth `AppUser` for each post. While we're there, we close the deferred N+1 from the previous change: a 10-post list currently triggers 10 sequential WordPress fetches in the `Post.appUser` resolver — exactly the case `graphql/dataloader` exists to solve.

## What Changes

- Add a public `/blog` posts list page using the federated `posts(first, after)` connection with Relay-style cursor pagination and a "Load more" button.
- Add a public `/blog/[slug]` post detail page rendering the post body and the `appUser { id name email }` block.
- Adopt **GraphQL Codegen** in `apps/web/` using the modern **`@graphql-codegen/client-preset`** so component-colocated `.graphql` operations and fragments produce a typed `graphql()` tag returning `TypedDocumentNode<TData, TVariables>` — consumed directly by Apollo Client.
- Reuse the foundation's `relayStylePagination` typePolicy on `Query.posts` (already registered in `apps/web/src/lib/apollo/type-policies.ts`) and the existing `useRelayConnection` hook for `fetchMore`.
- Add component-colocated fragments (`PostCardFragment`, `PostDetailFragment`) consumed by the new organisms (`PostList`, `PostDetail`, `PostCard`, `LoadMoreButton`).
- Introduce two **per-request DataLoaders** in `apps/users-subgraph` to batch the `Post.appUser` resolution path:
  - `postAuthorWpIdLoader`: collapses N `post(databaseId)` lookups into one WP `posts(where:{in:[…]})` query.
  - `appUserByWpIdLoader`: collapses N `FindUserByDatabaseIdQuery` dispatches into one CQRS query that issues a single `WHERE wp_user_id IN (…)` SELECT.
- Add a new `FindUsersByDatabaseIdsQuery` CQRS handler in `libs/users/application` for the batched lookup.
- Wire both loaders into the GraphQL request context via Nest `REQUEST`-scoped providers so each GraphQL operation gets fresh loaders.

## Capabilities

### New Capabilities
- `web-blog-browse`: public blog feed and detail pages on the Next.js web app, consuming the federated `Post.appUser` field; covers route shapes, pagination semantics, fragment + codegen wiring, and rendering rules for missing authors.

### Modified Capabilities
- `users-subgraph`: the `Post.appUser` resolver gains a batching requirement (DataLoader-backed) and a new CQRS query handler (`FindUsersByDatabaseIdsQuery`) for the batched user lookup.

## Impact

- **Web** (`apps/web/`): new routes `/blog` (list, client-rendered for `fetchMore`) and `/blog/[slug]` (detail, RSC via `getClient().query()` so it's prefetched on the server and ready for future ISR); new organisms (`PostList`, `PostDetail`, `PostCard`, `LoadMoreButton`); colocated `.graphql` operations and fragments under `apps/web/src/lib/blog/operations/`; the `relayStylePagination` typePolicy for `Query.posts` already exists in `lib/apollo/type-policies.ts` (foundation); `useRelayConnection` hook already exists (foundation). New dev deps: `@graphql-codegen/cli`, `@graphql-codegen/client-preset`. Codegen wired as Nx target `pnpm nx run web:codegen`.
- **Users subgraph** (`apps/users-subgraph/`): new `loaders/post-author.loader.ts` and `loaders/app-user.loader.ts` with `dataloader` dep; `users/users.module.ts` registers them as `Scope.REQUEST`; `PostAppUserResolver` rewired to dispatch via the loaders; GraphQL context factory in `app/app.module.ts` exposes loader instances on `GqlContext`. New deps: `dataloader`.
- **Users application** (`libs/users/application/`): new `FindUsersByDatabaseIdsQuery` + handler that returns `User[]` ordered to match the input ids; `USER_QUERY_HANDLERS` extended.
- **Gateway** (`apps/gateway/`): no code change. Cursor pagination is already exposed by WordPress's wp-graphql layer through composition.
- **Posts subgraph (WordPress)**: no plugin change. Relay-style `posts(first, after) { edges { cursor node } pageInfo }` is provided natively by WPGraphQL.
- **Codegen**: schema source is the federated gateway introspected at `pnpm codegen` time via `${NEXT_PUBLIC_GATEWAY_URL}/graphql` (default `http://localhost:3000/graphql`); generated types land at `apps/web/src/__generated__/`.
- **Existing routes**: `/`, `/sign-in`, `/sign-up`, `/(protected)/dashboard` are untouched. The blog is mounted alongside them as a new public surface.
- **Auth**: no change. Posts list and detail are public; the existing `(protected)` middleware does not match `/blog/*`.
- **Env vars**: no new vars on the web side. The users-subgraph DataLoaders reuse the existing `WP_GRAPHQL_URL` + `WP_GRAPHQL_SERVICE_TOKEN` already in `.env.example`.
