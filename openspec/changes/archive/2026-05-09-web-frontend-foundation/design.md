## Context

`apps/web` is a fresh Next.js 16 app router project (React 19) inside an Nx monorepo. The federated GraphQL gateway runs at `http://localhost:3000` and the `users-subgraph` runs at `http://localhost:3001` with Better Auth mounted at `/auth` and a session cookie named `better-auth.session_token`. The gateway already forwards `cookie` and `authorization` headers to subgraphs (see `apps/gateway/src/app/cookie-data-source.ts`), so the moment the browser sends the cookie to the gateway, identity flows end-to-end.

The roadmap on top of this foundation includes posts list/detail/editor, newsletter signup, SEO + ISR, and a chat-style "blog copilot" backed by Apollo MCP. All of those need the same three things: a GraphQL client that handles SSR + RSC + cookies, a session helper that works on both server and client, and a UI primitive set. Building this once now is the smallest possible step that unblocks every later feature.

Constraints worth calling out:
- **Same machine, multiple ports** in dev: web (4200), gateway (3000), users-subgraph (3001), WP (8080). Browsers treat these as different origins, so cookie-based auth needs either CORS + `credentials: 'include'` everywhere or same-origin proxying.
- **React 19 + Next 16 + RSC** — the Apollo Client integration must support both server components (no provider, request-scoped client) and client components (provider-based, cache-shared).
- **Tailwind v3** is already configured (`apps/web/tailwind.config.js`, `postcss.config.js`); shadcn/ui must layer on top without breaking the existing config.

## Goals / Non-Goals

**Goals:**
- Single same-origin URL from the browser's perspective (`/api/graphql` and `/api/auth/*`) so cookies "just work" without CORS configuration on the backends.
- Apollo Client usable from both server components (`getClient()` per request) and client components (`ApolloNextAppProvider`).
- A `useSession()` hook for client components and a `getSession()` helper for server components that both return the same shape.
- Route protection via `middleware.ts` keyed off the session cookie — no waterfall fetch on every page load.
- shadcn/ui ready to use: `cn()` utility, CSS variables, dark-mode class strategy, and the four primitives the rest of the project will start with.
- An Atomic Design folder layout (`atoms/`, `molecules/`, `organisms/`, `templates/`) so every later component lands in a predictable place and component scope is legible from the import path alone.
- A GraphQL Codegen pipeline using `@graphql-codegen/client-preset` so that components colocate fragments via the generated `graphql()` tag, parents compose them, and `useFragment()` enforces masking — the Relay model on top of Apollo Client.
- All new env vars documented in `.env.example` and `.env.local.example` with sane local-dev defaults.

**Non-Goals:**
- No feature pages (posts, newsletter, copilot) — those are separate changes.
- No SSR/ISR strategy decisions for individual pages — `next.config.js` stays default beyond the rewrites.
- No production deployment plumbing (SST configuration, CDN, etc.) — same-origin proxying is a dev-friendly default; production may revisit and use a custom domain or split origins behind a single edge.
- No Storybook, no test scaffolding for shadcn primitives — the components ship as the standard shadcn copies, which are well-tested upstream.
- No MSW codegen / mocked-handler pipeline yet — the project context calls for `typescript-msw` eventually, but it lands with the first feature that needs to mock queries in tests, not in the foundation.
- No real example fragment-bearing component beyond what's strictly needed to prove the pipeline (a single tiny `UserBadge` molecule that renders the session user). Real fragments arrive with feature changes.

## Decisions

### 1. Same-origin proxy via Next.js rewrites instead of CORS

Configure `next.config.js` rewrites:
```
/api/graphql       → ${GATEWAY_URL}/graphql
/api/auth/:path*   → ${USERS_SUBGRAPH_URL ↦ origin}/auth/:path*
```

Apollo Client and the Better Auth client both point at the same origin (`/api/graphql`, `/api/auth`). The browser sees one origin, cookies are first-party, and we don't need to add CORS or `credentials: 'include'` machinery to the NestJS apps for local dev.

**Why over the alternative**: Configuring CORS on `gateway` *and* `users-subgraph` (with explicit origin allowlists, `credentials: true`, and `SameSite=Lax` cookie tweaks) is doable but bleeds frontend concerns into backend code and forces Better Auth's cookie config to become origin-aware. Rewrites keep that complexity inside the web app where it belongs and trivially extend to a production setup where everything sits behind a single domain anyway.

**Trade-off**: rewrites add a Next.js hop in dev, which is irrelevant for local performance. In production, if the team picks a multi-domain deploy, this decision will be revisited (probably by replacing rewrites with a real edge router) — but that's the right place to make that call, not now.

### 2. Apollo Client with `@apollo/client-integration-nextjs`

Use Apollo's official Next.js App Router integration:
- `apps/web/src/lib/apollo/client.ts` — `registerApolloClient(() => new ApolloClient({...}))` for server components.
- `apps/web/src/lib/apollo/provider.tsx` — `"use client"` wrapper around `ApolloNextAppProvider` that constructs an `ApolloClient` per browser session.
- Both share a single `httpLink` config pointing at `/api/graphql` with `credentials: 'include'` (harmless under same-origin, future-proof for a multi-origin deploy).

**Why over alternatives**: urql was offered as an option but the user picked Apollo. Within Apollo, the `@apollo/client-integration-nextjs` package is the maintained path for app-router; rolling our own SSR boundary would re-implement what that package already solves (request-scoped clients on the server, deduped requests across RSC + client transition, cache hydration).

### 3. Better Auth client SDK with a thin server wrapper

- Client side: `createAuthClient({ baseURL: '/api/auth' })` from `better-auth/react`. Re-export `useSession`, `signIn`, `signUp`, `signOut` from `apps/web/src/lib/auth/client.ts`.
- Server side: `apps/web/src/lib/auth/session.ts` exports `getSession()` that reads the session cookie via `cookies()` and POSTs to `/api/auth/get-session` (server-to-server through the same proxy path). Returns `{ user, session } | null`.

**Why this split**: Better Auth's React client is reactive and handles refresh + sign-out flows out of the box. Server components can't use hooks, so they need a function — and that function should produce the same shape so consumers can write code that works in both places.

**Trade-off**: server-side calls take an extra hop (web server → web's own rewrite → users-subgraph). Locally that's free; in prod it can be replaced with a direct fetch to the upstream URL keyed by an env var, without changing call sites.

### 4. Route protection via Next.js middleware on a `(protected)` group

`apps/web/src/middleware.ts` runs only on a configured matcher (the `(protected)` group's URL paths). It checks for the session cookie name and 302-redirects to `/sign-in?next=...` if missing. The middleware does not validate the cookie — it only checks presence. Real validation happens server-side via `getSession()` inside the protected page itself.

**Why this two-layer approach**: middleware runs on every matched request, including static assets and prefetches; doing a network call there to validate sessions is expensive and would defeat the point. Treating the cookie as a "probably authenticated" signal at the edge and re-validating in the page is the standard Next.js pattern.

### 5. shadcn/ui via the standard CLI bootstrap, components committed

Run `pnpm dlx shadcn@latest init` against `apps/web` (style: `default`, base color: `slate`, CSS variables: yes). Add seed primitives: `Button`, `Input`, `Card`, `Sonner` (toaster). Wire `<Toaster />` into the root layout.

The `cn()` utility lives at `apps/web/src/lib/utils.ts`. Path aliases (`@/components/ui/*`) resolve through the existing `tsconfig.app.json` baseUrl/paths.

**Why over hand-rolling**: the user picked shadcn explicitly. Letting the CLI manage `components.json` keeps future `shadcn add` commands working without manual config drift.

**Trade-off**: shadcn pulls in `tailwindcss-animate` and Radix primitives transitively — that's expected and the upside (accessible, tested components) is worth it for a foundation slice.

### 6. GraphQL Codegen with `@graphql-codegen/client-preset` (fragment masking)

Install `@graphql-codegen/cli` and `@graphql-codegen/client-preset` as dev deps in `apps/web/`. Add `apps/web/codegen.ts`:
```ts
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: process.env.CODEGEN_SCHEMA_URL ?? 'http://localhost:3000/graphql',
  documents: ['src/**/*.{ts,tsx}', '!src/gql/**/*'],
  generates: {
    './src/gql/': {
      preset: 'client',
      config: { useTypeImports: true },
    },
  },
  ignoreNoDocuments: true,
};

export default config;
```
Wire `pnpm codegen` and `pnpm codegen:watch` scripts into `apps/web/package.json`, and expose them as Nx targets (`@desafio/web:codegen`, `@desafio/web:codegen:watch`) so `pnpm nx run @desafio/web:codegen` works. Commit `apps/web/src/gql/` so a fresh checkout can build without first running codegen against a live gateway.

Components import `graphql` and `useFragment` from `@/gql` (a path alias added to `tsconfig.app.json`):
```ts
import { graphql, useFragment, type FragmentType } from '@/gql';

export const UserBadge_UserFragment = graphql(`
  fragment UserBadge_UserFragment on User { id name image }
`);

export function UserBadge({ user }: { user: FragmentType<typeof UserBadge_UserFragment> }) {
  const u = useFragment(UserBadge_UserFragment, user);
  return <span>{u.name}</span>;
}
```

**Why client-preset over typescript-react-apollo / typed-document-node by hand**: the client-preset is The Guild's officially recommended path (linked in the proposal), it produces `TypedDocumentNode` artifacts that work natively with Apollo Client, and the included `useFragment` is the one piece that makes fragment masking feel ergonomic — it strips properties the component didn't ask for, which is what enforces the colocation invariant.

**Why introspect from a live gateway instead of a checked-in SDL file**: the federated supergraph SDL is composed at runtime from subgraphs, so any change to a subgraph's schema must flow through the gateway anyway. Pointing codegen at the gateway means the generated types always reflect the actual shape consumers will see. The `CODEGEN_SCHEMA_URL` env var lets CI override (e.g., point at a recorded SDL artifact) without code changes when we get to CI.

**Trade-off**: the generated `src/gql/` directory is committed (~hundreds of KB once features land). Some teams gitignore it and require a pre-build codegen step. Committing avoids "fresh-checkout broke because gateway wasn't running" friction during onboarding and review; the cost is noisier diffs that reviewers learn to skim. Worth it for now — revisit if it becomes a real PR-review pain point.

### 7. Atomic Design folder layout for components

Components live under `apps/web/src/components/` in five buckets:
```
components/
  atoms/        # smallest UI pieces; no GraphQL fragments. shadcn primitives live here under atoms/ui/
  molecules/    # one-fragment components (e.g., UserBadge). Compose atoms.
  organisms/    # multi-fragment / multi-data components (e.g., PostCard with author + content + tags).
  templates/    # page-level layouts that compose organisms. Hold no business data themselves.
  providers/    # cross-cutting client-side providers (Apollo, theme, toaster wrappers, etc.).
```
Pages under `app/` import only from `templates/` (and occasionally `organisms/`); they should never reach into `atoms/` directly except for trivial layout helpers. shadcn primitives are placed at `atoms/ui/` (the path the shadcn CLI is configured to write to via `components.json`).

**Why atomic design**: the user's project context explicitly asks for a "Relay-style" frontend, and Atomic Design pairs naturally with Relay-style fragments — the bottom of the hierarchy is data-free leaves (atoms), middle layers each declare one fragment (molecules → small fragment, organisms → composite fragment that spreads child fragments), and pages compose templates that compose organisms. The folder name tells you both the visual scope *and* the data scope of a component without opening it.

**Why include `providers/` as a fifth bucket** instead of squeezing them under `atoms/` or `organisms/`: providers don't render UI in the same sense (they're behavior containers), so giving them their own folder avoids the awkward question of which atomic level a context provider belongs to.

**Trade-off**: forcing a strict atomic taxonomy can be over-engineered for tiny apps. Mitigation: the rules are advisory in the foundation — only the four primitives + `UserBadge` + the home-page template ship now. The structure is opinionated but lightly populated; later changes will exercise it.

### 8. Relay-style cursor pagination as a first-class concern

The Apollo cache is built by `apps/web/src/lib/apollo/cache.ts → createCache()`, which composes `typePolicies` from a registry at `apps/web/src/lib/apollo/type-policies.ts`. The foundation seeds the registry empty with a documented pattern; each feature later appends its own connection registrations:
```ts
import { relayStylePagination } from '@apollo/client/utilities';
import type { TypePolicies } from '@apollo/client';

export const typePolicies: TypePolicies = {
  // Each feature appends to this registry. Example:
  // Query: { fields: { posts: relayStylePagination(['where']) } },
};
```
Both `getClient()` (server) and the client provider call `createCache()`, so the cache shape is identical on both sides and supergraph-wide.

A `useRelayConnection<TData>(query, variables, { connectionPath })` hook in `apps/web/src/lib/apollo/use-relay-connection.ts` wraps `useQuery` + `fetchMore` and returns `{ items, hasNextPage, loadMore, isLoadingMore }`. `connectionPath` accepts `'posts'` or `['me', 'posts']` so the same hook works regardless of where the connection sits in the response shape. The hook reads `pageInfo.endCursor` and feeds it back as the `after` variable on each `loadMore` call.

The Relay connection contract assumed everywhere (and produced by both `wp-graphql` and the user-side subgraphs):
```graphql
type FooConnection {
  edges: [FooEdge!]!
  pageInfo: PageInfo!
}
type FooEdge { cursor: String!, node: Foo! }
type PageInfo { hasNextPage: Boolean!, hasPreviousPage: Boolean!, startCursor: String, endCursor: String }
# Pagination args: first/after (forward), last/before (backward)
```

**Why surface this in the foundation rather than in the first feature that paginates**: `InMemoryCache` reads `typePolicies` at construction time. If we add `relayStylePagination()` only when the first feature lands, we have to either (a) tear down and rebuild the cache (which trashes any in-flight queries) or (b) introduce a registry pattern then anyway. Doing it now is the smaller change.

**Why ship `useRelayConnection` without a foundation consumer**: every paginated list will need the same `fetchMore` glue; building it once avoids three half-correct copies. The risk of YAGNI is bounded because the hook is small (~30 LOC) and we have a clear spec to write to (the Relay connection tutorial + `relayStylePagination` semantics).

**Why not invent a custom `Connection<T>` type**: codegen client-preset emits `Connection`/`Edge`/`PageInfo` types from the schema automatically. Duplicating them in handwritten form would drift. The hook is purely runtime glue; types come from generated artifacts.

**Trade-off**: a registry file that grows monotonically is mildly ugly compared to per-feature module wiring. Once it has 5+ entries we can split it into `type-policies/{posts,users,...}.ts` and re-export. Not worth doing now.

### 9. Environment variables and `.env` story

Add to `.env.example`:
```
# apps/web — Next.js public + private vars
WEB_PORT=4200
NEXT_PUBLIC_GATEWAY_URL=http://localhost:3000
NEXT_PUBLIC_AUTH_URL=http://localhost:3001
```
Plus an `apps/web/.env.local.example` that documents the same vars in their Next.js-loading order. The web app reads `NEXT_PUBLIC_GATEWAY_URL` and `NEXT_PUBLIC_AUTH_URL` *only* inside `next.config.js` to build the rewrite destinations — runtime code always uses `/api/graphql` and `/api/auth`.

**Why expose URLs via `NEXT_PUBLIC_*` even though only `next.config.js` reads them**: keeping them on `process.env` makes them overridable without changing code, and `NEXT_PUBLIC_*` is the convention even when only the build needs them. They won't leak anything sensitive — they're already public URLs.

## Risks / Trade-offs

- **[Risk]** Better Auth's cookie defaults (`SameSite=Lax`, no explicit domain) work fine for localhost same-origin, but if the team later chooses a multi-domain deploy, the cookie config will need revisiting (`SameSite=None` + `Secure` for cross-site). → **Mitigation**: the rewrite decision keeps everything same-origin in dev; we'll revisit cookie config when the deploy story is concrete (out of scope here).
- **[Risk]** `@apollo/client-integration-nextjs` is on a fast release cadence and occasionally breaks with new Next.js majors. We're targeting Next.js 16; check that the latest `@apollo/client-integration-nextjs` advertises Next 16 support before pinning. → **Mitigation**: pin both `@apollo/client` and the integration package together, document the pinned versions in the design log if a workaround is needed, and prefer minor over patch ranges (`~`) until proven stable.
- **[Risk]** Middleware runs on all matched paths including prefetches; if the matcher accidentally covers static assets the cookie check will fire unnecessarily. → **Mitigation**: match only on the `(protected)` group's published URLs (e.g., `/(dashboard|settings)/:path*`) and exclude `/_next/`, image optimizer paths, and `favicon.ico` explicitly.
- **[Risk]** shadcn init writes to `components.json` and `tailwind.config.js`; if Nx changes the project root layout it could confuse the CLI. → **Mitigation**: run shadcn init manually against `apps/web` (cwd matters), commit the generated `components.json`, and document in the change's tasks that future `shadcn add` calls must be run from `apps/web/`.
- **[Trade-off]** Same-origin rewrites mean the web Next.js process must be reachable to use the API in dev — you can't hit the gateway directly from the browser anymore (you can still hit it via `curl`/Apollo Studio). That's the intended cost of avoiding CORS.
- **[Trade-off]** The protected-route check happens twice (middleware + page). That's deliberate (cheap signal at the edge, real check at the source) and means a stolen-then-revoked cookie still gets rejected by the page — middleware never returns stale-trusted output.
- **[Risk]** Codegen against a live gateway requires the gateway to be running. New contributors hitting `pnpm codegen` without docker-compose up get a confusing "ECONNREFUSED" error. → **Mitigation**: README points at `docker compose up` first; the script's failure mode is benign (build still works because `src/gql/` is committed); when CI lands we'll add a recorded SDL fallback under `CODEGEN_SCHEMA_URL`.
- **[Risk]** Fragment colocation works only when codegen has scanned the file containing the new fragment — adding a fragment without re-running codegen produces a runtime "fragment not found" error. → **Mitigation**: provide `pnpm codegen:watch` and document running it in a side terminal during dev. Bonus: Apollo Client's dev tools surface unknown-fragment errors clearly.
- **[Trade-off]** Committing `src/gql/` produces noisy diffs in PRs that touch many fragments at once. → **Mitigation**: an `.eslintignore` and `.gitattributes linguist-generated=true` entry tell GitHub to collapse those diffs by default; reviewers focus on the source fragments.
- **[Trade-off]** Atomic Design imposes folder rules that can feel over-engineered for tiny apps. → **Mitigation**: the foundation only seeds the structure; we won't enforce it via lint rules until at least a dozen real components exist and a pattern violation is observed.

## Open Questions

- Do we want a dark-mode toggle in the layout from day one, or only the CSS variables wired up so a toggle can be added later? **Default decision**: variables only, no toggle UI yet — adding it is one component later and not worth designing now.
- Should `getSession()` cache within a single request (React `cache()`) so multiple server components in one render don't re-hit `/auth/get-session`? **Default decision**: yes, wrap with `cache()` — it's free, idiomatic for App Router, and avoids the obvious foot-gun.
- Should we run codegen automatically as part of `nx serve @desafio/web` (e.g., a pre-task)? **Default decision**: no — keep `codegen` and `serve` orthogonal, document `pnpm codegen:watch` for active development. Implicit pre-tasks tend to confuse newcomers and slow down cold starts.
- Where does the `UserBadge` molecule's fragment get composed in the foundation, given there are no real feature pages? **Default decision**: the home page (server component) calls `getSession()` to render anonymous CTA, *and* runs a tiny GraphQL query that selects `me { ...UserBadge_UserFragment }` to prove the codegen + Apollo + cookie-forwarding pipeline end-to-end for authenticated users. If `me` doesn't exist on the gateway yet, fall back to spreading the fragment in a `query Foundation_HomePageQuery` against `viewer` or whatever the gateway exposes — verify before coding.
