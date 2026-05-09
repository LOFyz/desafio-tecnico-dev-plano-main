## Context

The federation join `Post.appUser → AppUser` is live on the gateway, but no UI consumes it. The web app currently exposes a public landing, a sign-in/up flow, and a stub `/dashboard` — no posts surface, no GraphQL operations, no codegen pipeline. The brief calls out "blog autenticado" with cursor connection pagination, fragments via codegen, and DataLoader as cross-cutting requirements; this change is the first slice of the blog UI and also closes the deferred N+1 from the previous change (`federate-post-author` design.md non-goal #11).

Foundation work already in place that this change reuses:
- `apps/web/src/lib/apollo/type-policies.ts` already registers `relayStylePagination` on `Query.posts`.
- `apps/web/src/lib/apollo/use-relay-connection.ts` already wraps `useQuery + fetchMore` for any Relay connection.
- `apps/web/src/lib/apollo/client.ts` (RSC) and the client-side `<ApolloProvider>` are wired.

Constraints:
- **Schema-first** is the rule for the subgraphs. Codegen is for the *web app's* operations, not for the subgraph schemas.
- The gateway must stay thin (no resolvers); any resolver work belongs in a subgraph.
- The `Post.appUser` resolver lives in `apps/users-subgraph` (per `federate-post-author`); DataLoaders therefore also live there.
- WordPress already exposes `posts(first, after) { edges { cursor node } pageInfo }` natively via WPGraphQL — no plugin work.

## Goals / Non-Goals

**Goals:**
- A public `/blog` page renders the first N WordPress posts via the federated gateway, each with an author block populated from `Post.appUser`.
- A "Load more" button appends the next page using cursor pagination — cache merges via Apollo's `relayStylePagination`.
- A public `/blog/[slug]` page renders one post in full with the author block.
- A 10-post list triggers exactly **one** WordPress fetch for the author lookup and **one** Postgres SELECT, regardless of list size — both via per-request DataLoaders.
- The web app has a working `pnpm nx run web:codegen` step that produces typed `graphql()` documents from co-located `.graphql` files, with fragments composing seamlessly.
- The codegen pipeline introspects the federated gateway, not WPGraphQL directly — so `Post.appUser` (added by our subgraph) is part of the typed surface.

**Non-Goals:**
- No SEO, ISR, RSS, sitemap, or robots in this change. The detail route is RSC-rendered on every request (no `revalidate`); ISR will be a follow-up change once we know the cache strategy.
- No server-side prefetch for the *list* page — it stays purely client-rendered because `fetchMore` mechanics are inherently client-side. (We can revisit with a hybrid pattern later.)
- No newsletter signup, comments, post tags filtering, or category nav.
- No mutations / writes — posts are read-only here. Authoring (including AI-assisted creation) is a follow-up change.
- No MikroORM dataloaders. The CQRS handler still does a plain `findAll({ databaseId: { $in: [...] } })`; brief mention is for future work that joins multiple entities.
- No move to the Relay JS client. We stay on Apollo Client + Relay-spec connections.
- No MSW codegen plugin. Mocking is a DX concern, not a feature blocker.
- No infinite scroll — explicit "Load more" button keeps interaction simple and pagination visible.

## Decisions

### 1. Routes are public, mounted at `/blog` and `/blog/[slug]`

We don't gate posts behind `/(protected)/`. The brief lists newsletter, SEO, ISR, RSS — all of which only make sense for public content. The "blog autenticado" framing is satisfied by Better Auth + the existing `/sign-in`/`/sign-up`/`/dashboard` surface (the *platform* has authentication; the *blog content* is public).

We don't change `/`, `/dashboard`, or any existing route. Linking from the home page to `/blog` is a tiny copy edit handled in tasks.

### 2. List = client component, detail = RSC

- `/blog/page.tsx` is a thin server wrapper that renders `<PostList />` (a client component using `useRelayConnection` + `fetchMore`). The list cannot meaningfully prefetch on the server because pagination state is owned by the client cache — partially-prefetched data competes with `fetchMore` and creates cache reconciliation gotchas. Empirically, doing this purely client-side is the boring-correct path.
- `/blog/[slug]/page.tsx` is RSC and calls `getClient().query()` for `PostDetailQuery(slug)`. One round trip, no client-side hydration cost, ready to wrap with `revalidate` later for ISR.

Alternative considered: full RSC with a "more posts" link to a `?after=<cursor>` page. Cleaner SSR but loses the in-place "load more" UX the brief implicitly assumes ("via conexões e cursores"). Rejected.

### 3. GraphQL Codegen with the `client-preset`

We use **`@graphql-codegen/client-preset`**, which produces a typed `graphql()` tag returning `TypedDocumentNode<TData, TVariables>`. Apollo Client v3.8+ consumes those documents directly with full type inference on `useQuery`/`useMutation` — no per-operation `useFooQuery` hook generation needed.

Alternatives considered:
- `typescript-react-apollo` plugin (generates `useFooQuery` hooks): older pattern; one-typed-hook-per-operation creates more churn and loses fragment composability ergonomics.
- `near-operations-file` preset: produces files alongside each operation. Works, but client-preset is the modern Hive recommendation and integrates with fragment masking out of the box.

Codegen output: `apps/web/src/gql/` (committed, matching the foundation). The `graphql()` tag re-export lives at `apps/web/src/gql/index.ts`. **This matches the foundation's pre-existing `apps/web/codegen.ts`** — we don't reshape it. We considered gitignoring the output but kept it tracked to preserve the foundation's "fresh-clone-builds-without-codegen" property.

### 4. Operations and fragments live as inline `graphql()` literals in TS modules

We co-locate operations as `graphql(/* GraphQL */ \`...\`)` calls inside the TS modules that consume them. The foundation's codegen scans `src/**/*.{ts,tsx}` (excluding `src/gql/`) for those literals. Concrete layout for this change:
```
apps/web/src/lib/blog/operations/
  ├─ post-card.fragment.ts        (exports POST_CARD_FRAGMENT)
  ├─ post-detail.fragment.ts      (exports POST_DETAIL_FRAGMENT)
  ├─ posts-list.query.ts          (exports POSTS_LIST_QUERY, imports the fragment)
  └─ post-detail.query.ts         (exports POST_DETAIL_QUERY, imports the fragment)
```

Each module imports `graphql` from `@/gql` and calls it on the SDL string. Fragment composition is by string interpolation:
```ts
import { graphql } from '@/gql';
import { POST_CARD_FRAGMENT } from './post-card.fragment';
export const POSTS_LIST_QUERY = graphql(/* GraphQL */ `
  query PostsList($first: Int!, $after: String) {
    posts(first: $first, after: $after) {
      edges { cursor node { ...PostCardFragment } }
      pageInfo { endCursor hasNextPage }
    }
  }
  ${POST_CARD_FRAGMENT}
`);
```

Alternative — separate `.graphql` files — was originally specced but rejected after seeing the foundation already wired the inline pattern. Switching would be cosmetic churn and would force the codegen `documents` glob to widen.

### 5. Codegen schema source = federated gateway introspection

The codegen `schema` field points at `${CODEGEN_SCHEMA_URL ?? 'http://localhost:3000/graphql'}` (the running gateway). This means the typed surface includes federation-composed types like `Post.appUser`. Running codegen requires the gateway (and therefore Postgres + WP + the users subgraph) to be up. The env var name (`CODEGEN_SCHEMA_URL`) follows the foundation's pre-existing `codegen.ts`.

Alternative: a static `supergraph.graphql` SDL file checked into the repo, regenerated on-demand. Simpler for CI, but stale until someone re-runs composition. Deferred — not worth the ceremony for a single developer demo.

### 6. Two DataLoaders, both per-request

We separate concerns into two loaders rather than one bigger one:

```
PostAppUserResolver
        │
        ├─ postAuthorWpIdLoader.load(post.databaseId)
        │     │   batch:
        │     │     1 WPGraphQL call:
        │     │       posts(where:{in:[…postIds]}) {
        │     │         nodes { databaseId author { node { databaseId } } }
        │     │       }
        │     ▼
        │   number | null  (WP author databaseId)
        │
        └─ appUserByWpIdLoader.load(wpAuthorDatabaseId)
              │   batch:
              │     1 dispatch of FindUsersByDatabaseIdsQuery(ids)
              │     → handler runs:
              │       users.find({ databaseId: { $in: ids } })
              │     → returns User[] reordered to match ids
              ▼
            User | null
```

Reasoning: the two batches have different external dependencies (HTTP to WP vs SQL to Postgres) and different cache keys. Splitting them keeps each loader focused, easier to test, and lets the second loader serve `__resolveReference` later if we want to dataloader-ify that path too.

Both loaders are constructed **per GraphQL request** (Nest `Scope.REQUEST`) and exposed on `GqlContext.loaders`. The `PostAppUserResolver` reads them off `@Context() ctx`.

### 7. Loader factory wiring via `GraphQLModule.forRootAsync`

The current context factory is a plain inline function in `app/app.module.ts`. To inject loader providers (which themselves need `ConfigService` + `QueryBus`), we switch to `forRootAsync` with `inject: [LoaderFactory]`. The factory returns `{ req, sessionId, loaders: loaderFactory.create(req) }`.

Alternative: instantiate loaders inline in the context factory using `ConfigService` + `fetch`. Rejected — duplicates the resolver's existing token/url logic and bypasses the CQRS layer for the user lookup.

### 8. `FindUsersByDatabaseIdsQuery` returns User[] in input order

DataLoader requires the batch function to return results aligned 1:1 with the input keys (or `null` for misses). The CQRS handler:
```ts
async execute({ databaseIds }: FindUsersByDatabaseIdsQuery): Promise<(User | null)[]> {
  const rows = await this.users.find({ databaseId: { $in: databaseIds } });
  const byId = new Map(rows.map(r => [r.databaseId!, toUser(r)]));
  return databaseIds.map(id => byId.get(id) ?? null);
}
```

Decision: the handler owns the reorder/null-fill so the DataLoader batch fn is a one-liner. Alternative — return the raw rows and reorder in the loader — works but smears the contract.

### 9. Detail page lookup uses `idType: SLUG`

Next.js `[slug]` segments map to URL slugs; WP exposes `post(id: $slug, idType: SLUG)`. We use slugs for SEO friendliness later. The `Post.databaseId` is still selected (it's the federation key) so `Post.appUser` resolves through the same path.

Alternative: use `URI` (`/2026/05/foo/`). Heavier, depends on permalink config. Rejected.

### 10. `Post.appUser` rendering is best-effort, never blocks the page

If the author lookup fails or returns null (no Better Auth match, WP unreachable, etc.), the post still renders with a "Author unknown" placeholder. The detail page never errors out solely because the author can't be resolved — consistent with `Post.appUser`'s nullability contract.

### 11. Fragment masking is ON (matches foundation default)

Client-preset masks fragment fields from parent queries unless components call `useFragment(...)` to unwrap them. The foundation already adopted this in `UserBadge` (`useFragment(UserBadge_UserFragment, user)`), so we match. Components accept `FragmentType<typeof POST_CARD_FRAGMENT>` instead of the raw shape and unwrap inside the component. The `useRelayConnection` hook stays generic — it returns whatever `node` shape the cache stores; components own the unwrap.

### 12. Codegen target is an Nx target, not a postinstall hook

`apps/web/project.json` gains a `codegen` target invoking `graphql-codegen --config codegen.ts`. The developer runs `pnpm nx run web:codegen` after the gateway is up; build does NOT depend on it. Generated files are gitignored. Rationale: build-time codegen would block builds when the gateway is offline (e.g., CI without infra), and we don't need types to be regenerated on every build during normal feature work.

## Risks / Trade-offs

- **[Risk] Codegen requires the federated gateway to be running.** A new developer trying `pnpm nx build web` after `pnpm install` might not realize generated types are missing. → Mitigation: README adds a "first-run" checklist (`docker-compose up`, `pnpm nx serve users-subgraph gateway`, `pnpm nx run web:codegen`); the generated entry point file is committed as a tiny placeholder so TS doesn't immediately error.
- **[Risk] WP `posts(where: {in: […]})` returns rows in arbitrary order.** The DataLoader batch fn must reorder by input id. → Mitigation: reorder explicitly, fall back to `null` on misses; covered in unit tests for the loader.
- **[Risk] Per-request loader scope means a single long-running GraphQL operation can't share with another concurrent operation.** This is the *correct* tradeoff (cross-request cache leakage would be a security problem) but means a query that fetches the same `Post.appUser` from two paths in one request still benefits, while two concurrent requests for the same post don't. Acceptable.
- **[Risk] `relayStylePagination` field policy is shared across all variations of `Query.posts(where: …)`.** The foundation already keys it by `where`, so different filters get separate caches. Adding a sort or category filter later would require updating `keyArgs`.
- **[Trade-off] Detail page is RSC with no caching directive.** Each visit hits the gateway. Acceptable until we wire ISR explicitly (own change).
- **[Trade-off] No fragment masking.** Easier ergonomics now, slightly more accidental coupling. Easy to flip on later.
- **[Trade-off] List page is fully client-rendered.** Loses initial SSR for the post titles. Acceptable for a logged-out browsing flow that already pays the auth-cookie roundtrip; the "Load more" UX is the priority.
- **[Trade-off] Codegen runs on developer machines, not CI.** First-run friction. Acceptable for the demo target; revisit if/when CI runs `nx affected`.
