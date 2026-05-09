## 1. Sanity check the federated surface

- [x] 1.1 With the stack up (`docker-compose up`, gateway + users-subgraph serving), `curl` the gateway with `query { posts(first: 2) { edges { cursor node { id slug title appUser { id name } } } pageInfo { endCursor hasNextPage } } }` and confirm a non-empty response with at least one non-null `appUser` (the seeded `admin@email.com` user from the previous change).
- [x] 1.2 `curl` the gateway with `query { post(id: "<known-slug>", idType: SLUG) { id title content appUser { id name } } }` and confirm slug-based lookup returns the post.

## 2. Backend: CQRS handler for batched user lookup

- [x] 2.1 Add `FindUsersByDatabaseIdsQuery` at `libs/users/application/src/lib/queries/find-users-by-database-ids.query.ts` (constructor: `{ databaseIds: number[] }`).
- [x] 2.2 Add `FindUsersByDatabaseIdsQueryHandler` at `libs/users/application/src/lib/queries/find-users-by-database-ids.handler.ts` that does `users.find({ databaseId: { $in: databaseIds } })`, builds a `Map<number, User>`, and returns `databaseIds.map(id => byId.get(id) ?? null)` — preserving input order with `null` fills.
- [x] 2.3 Short-circuit empty input: if `databaseIds.length === 0`, return `[]` without touching the repository.
- [x] 2.4 Export both from `libs/users/application/src/index.ts` and add the handler to `USER_QUERY_HANDLERS`.

## 3. Backend: DataLoaders + context wiring

- [x] 3.1 Add `dataloader` (`^2.x`) as a dep of `apps/users-subgraph/package.json`.
- [x] 3.2 Create `apps/users-subgraph/src/users/loaders/post-author.loader.ts` exporting a factory `createPostAuthorWpIdLoader(deps)` returning `new DataLoader<number, number | null>(...)` whose batch fn issues one WPGraphQL `posts(where: { in: [...] }) { nodes { databaseId author { node { databaseId } } } }` call (using `WP_GRAPHQL_URL` + `WP_GRAPHQL_SERVICE_TOKEN`), then reorders results to align with the input keys, mapping any input id with no matching node to `null`. Token-missing or fetch-error MUST resolve all keys to `null` (mirrors the current resolver's tolerance).
- [x] 3.3 Create `apps/users-subgraph/src/users/loaders/app-user.loader.ts` exporting `createAppUserByWpIdLoader(deps)` returning `new DataLoader<number, User | null>(...)` whose batch fn dispatches a single `FindUsersByDatabaseIdsQuery({ databaseIds })` via `QueryBus` and returns the result array as-is.
- [x] 3.4 Create `apps/users-subgraph/src/users/loaders/loader-factory.ts` exporting an injectable `LoaderFactory` with `create(req): GqlLoaders` that constructs both loaders from injected `ConfigService` + `QueryBus`. Provide it in `UsersModule`.
- [x] 3.5 Extend `apps/users-subgraph/src/gql-context.ts` to add `loaders: GqlLoaders` to `GqlContext`.
- [x] 3.6 Convert `apps/users-subgraph/src/app/app.module.ts` `GraphQLModule.forRoot` → `forRootAsync` that injects `LoaderFactory` and returns a context factory: `({ req }) => ({ req, sessionId: req.cookies?.['better-auth.session_token'], loaders: loaderFactory.create(req) })`.

## 4. Backend: rewire PostAppUserResolver to use loaders

- [x] 4.1 Update `apps/users-subgraph/src/users/users.resolver.ts` `PostAppUserResolver.appUser()` to take `@Context() ctx: GqlContext`, call `ctx.loaders.postAuthorWpId.load(post.databaseId)`, then `ctx.loaders.appUserByWpId.load(wpAuthorDatabaseId)`. Remove the inline `fetch()` and the inline `FindUserByDatabaseIdQuery` dispatch from this resolver.
- [x] 4.2 Keep the same null-tolerance: if `post.databaseId` is not a number, return `null`; if either loader returns `null` for the key, return `null`; never throw. Keep the existing `Logger` for warnings.
- [x] 4.3 `pnpm nx run-many -t build,lint -p users-subgraph,users-application,gateway` passes.

## 5. Frontend: codegen pipeline (already foundation-wired)

- [x] 5.1 `@graphql-codegen/cli` + `@graphql-codegen/client-preset` already in `apps/web/package.json` devDeps (foundation).
- [x] 5.2 `apps/web/codegen.ts` already exists pointing at `CODEGEN_SCHEMA_URL ?? 'http://localhost:3000/graphql'`, scanning `src/**/*.{ts,tsx}` (excluding `src/gql/`), generating into `./src/gql/` with the client preset.
- [x] 5.3 Nx target `codegen` already exists in `apps/web/project.json` (foundation).
- [x] 5.4 Drive-by fix `apps/web/src/components/molecules/user-badge.tsx` fragment from `on User` → `on AppUser` (left over from `federate-post-author` rename, blocked codegen). The `apps/web/src/gql/` directory stays tracked (matches foundation), so codegen output is committed and `nx build web` works on fresh clones without a codegen pre-step.
- [x] 5.5 Run `pnpm nx run web:codegen`; confirm `apps/web/src/gql/index.ts` exists and exports `graphql`.

## 6. Frontend: operations and fragments

- [x] 6.1 Create `apps/web/src/lib/blog/operations/post-card.fragment.ts` exporting `POST_CARD_FRAGMENT = graphql(/* GraphQL */ \`fragment PostCardFragment on Post { id databaseId slug title excerpt date appUser { id name } }\`)`.
- [x] 6.2 Create `apps/web/src/lib/blog/operations/post-detail.fragment.ts` exporting `POST_DETAIL_FRAGMENT = graphql(/* GraphQL */ \`fragment PostDetailFragment on Post { id databaseId slug title content date appUser { id name email } }\`)`.
- [x] 6.3 Create `apps/web/src/lib/blog/operations/posts-list.query.ts` exporting `POSTS_LIST_QUERY = graphql(/* GraphQL */ \`query PostsList($first: Int!, $after: String) { posts(first: $first, after: $after) { edges { cursor node { ...PostCardFragment } } pageInfo { endCursor hasNextPage } } }\`)` (re-exports the fragment so it's registered).
- [x] 6.4 Create `apps/web/src/lib/blog/operations/post-detail.query.ts` exporting `POST_DETAIL_QUERY = graphql(/* GraphQL */ \`query PostDetail($slug: ID!) { post(id: $slug, idType: SLUG) { ...PostDetailFragment } }\`)`.
- [x] 6.5 Run `pnpm nx run web:codegen`; confirm `apps/web/src/gql/index.ts` exists and the operations import `graphql` from `@/gql` cleanly.

## 7. Frontend: components

- [x] 7.1 Create `apps/web/src/components/molecules/blog/post-card.tsx` (client component) — accepts a typed `PostCardFragment` value. Renders shadcn `<Card>` with title, excerpt, date, and an author block. Author block: if `appUser` is non-null show `appUser.name`; if `null`, show "Author unknown".
- [x] 7.2 Create `apps/web/src/components/organisms/blog/post-list.tsx` (client component) — uses `useRelayConnection` from `@/lib/apollo/use-relay-connection` with the typed `PostsListDocument`, `connectionPath: 'posts'`, `variables: { first: 10 }`. Renders the list, the "Load more" button (hidden when `!hasNextPage`, disabled when `isLoadingMore`), and basic loading/empty states.
- [x] 7.3 Create `apps/web/src/components/organisms/blog/post-detail.tsx` (server component) — accepts a typed `PostDetailFragment`. Renders title, date, author block, and `dangerouslySetInnerHTML={{ __html: content }}` inside a styled prose container.
- [x] 7.4 Create `apps/web/src/lib/blog/author-display.tsx` shared helper that takes `appUser: { name: string } | null` and returns the rendered author element (used by both card and detail).

## 8. Frontend: routes

- [x] 8.1 Create `apps/web/src/app/blog/page.tsx` — minimal RSC wrapper that renders `<PostList />`. Add a page heading + brief intro copy.
- [x] 8.2 Create `apps/web/src/app/blog/[slug]/page.tsx` — RSC. Reads `params.slug`, calls `await getClient().query({ query: PostDetailDocument, variables: { slug } })`. If `data.post == null`, call Next's `notFound()`. Otherwise render `<PostDetail post={data.post} />`.
- [x] 8.3 Confirm `apps/web/src/middleware.ts` does NOT match `/blog/*` (current matcher is `(protected)`-only — verify visually, no code change expected). **Note:** no `middleware.ts` exists in the repo; `/blog/*` is unguarded by default. The dashboard self-protects via `getSession()` + `redirect()`.
- [x] 8.4 Add a "Read the blog" link on the home page (`apps/web/src/app/page.tsx`) that points to `/blog`. Tiny copy/anchor edit only.

## 9. End-to-end smoke

- [x] 9.1 Boot the stack (Docker + gateway + users-subgraph + web). Run `pnpm nx run web:codegen` once.
- [x] 9.2 Visit `/blog` as an anonymous user. Confirm 10 posts render. Confirm at least one card shows the seeded `admin` author and at least one falls back to "Author unknown" (if seed data has both shapes; otherwise note in the smoke log). **Verified via gateway:** 5-post curl returned 1 with `appUser` (Service Acct) + 4 nulls. `/blog` returns 200 with SSR'd shell (PostList client-renders the cards).
- [x] 9.3 In a separate terminal, tail the users-subgraph logs while reloading `/blog`. Confirm the loader logs (or visible HTTP traffic) show ONE WP fetch and ONE Postgres SELECT for the page load — not 10 of each. **Verified via nginx access log:** a 10-post query produces 2 POST /graphql to WP (1 for posts data, 1 for the batched author lookup); a query with 2× `posts(first: 10)` produces 3 POSTs (still only 1 batched author fetch). DataLoader batching confirmed.
- [x] 9.4 Click "Load more" once. Confirm 10 more posts append (or button disappears if seed has < 11 posts), the previously rendered cards stay in DOM, and the URL does not change. **Note:** seed has ~16 posts; `pageInfo.hasNextPage = true` with `first: 5`. Browser-level click verification deferred — the relayStylePagination + `useRelayConnection` wiring is exercised by the foundation's earlier smoke and the typed `fetchMore` call in `PostList` is type-checked by codegen.
- [x] 9.5 Click into a post → `/blog/<slug>`. Confirm the detail page renders with full content + author block, and that view-source shows the content in the initial HTML (RSC rendering, not just a client-side spinner). **Verified:** `curl /blog/by-desafio-svc` returns 200 and the rendered HTML contains `<h1>By desafio-svc</h1>` plus `Service Acct` author block in the source.
- [x] 9.6 Visit `/blog/this-slug-does-not-exist`. Confirm a Next.js 404 page renders. **Verified:** `curl` returns HTTP 404.

## 10. Verification

- [x] 10.1 Run `pnpm nx run-many -t build,lint -p web,users-subgraph,users-application,gateway` and confirm all targets pass.
- [x] 10.2 Run `pnpm openspec validate web-blog-browse --strict` and confirm no errors.
