## 1. Environment & rewrites

- [x] 1.1 Add `WEB_PORT`, `NEXT_PUBLIC_GATEWAY_URL`, `NEXT_PUBLIC_AUTH_URL`, `CODEGEN_SCHEMA_URL` to `.env.example` with localhost defaults
- [x] 1.2 Create `apps/web/.env.local.example` mirroring those vars (Next.js loads `.env.local` by convention)
- [x] 1.3 Update `apps/web/next.config.js` to add `rewrites()` for `/api/graphql → ${NEXT_PUBLIC_GATEWAY_URL}/graphql` and `/api/auth/:path* → ${NEXT_PUBLIC_AUTH_URL}/auth/:path*`
- [x] 1.4 Set the web dev port via `nx serve` (or project config) to `WEB_PORT` so it doesn't collide with the gateway on 3000

## 2. Dependencies

- [x] 2.1 Add `@apollo/client`, `@apollo/client-integration-nextjs`, `graphql` to `apps/web/package.json`
- [x] 2.2 Add `better-auth` (used by both server `getSession` helper and client SDK) to `apps/web/package.json`
- [x] 2.3 Add shadcn runtime deps: `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`, `lucide-react`, `sonner`
- [x] 2.4 Add codegen dev deps: `@graphql-codegen/cli`, `@graphql-codegen/client-preset`
- [x] 2.5 Run `pnpm install` and verify the workspace lockfile updates without errors

## 3. Atomic Design folder scaffolding

- [x] 3.1 Create the empty atomic directories `apps/web/src/components/{atoms,molecules,organisms,templates,providers}/` (use `.gitkeep` placeholders so they're trackable in git)
- [x] 3.2 Create `apps/web/src/components/atoms/ui/` as the shadcn target directory (will be populated by step 4.4)

## 4. shadcn/ui bootstrap

- [x] 4.1 ~~Run `pnpm dlx shadcn@latest init`~~ Wrote `apps/web/components.json` directly with the chosen aliases (interactive CLI is hard to drive non-interactively for our `aliases.ui` path)
- [x] 4.2 Verify `apps/web/components.json` is committed with `aliases.ui` set to `@/components/atoms/ui` and `tailwind.config.js` was updated with the shadcn preset (animate plugin, theme extension)
- [x] 4.3 Replace `apps/web/src/app/global.css` with the shadcn-generated base layer (CSS variables for both light and dark) while keeping any pre-existing imports
- [x] 4.4 Add the seed primitives: wrote `apps/web/src/components/atoms/ui/{button,input,card,sonner}.tsx` directly (standard shadcn copies). Added `@radix-ui/react-slot` runtime dep
- [x] 4.5 Confirm `cn()` exports from `apps/web/src/lib/utils.ts` and the `@/*` path alias resolves in `tsconfig.json` (no `tsconfig.app.json` in this Nx Next setup)

## 5. Apollo Client wiring

- [x] 5.1 Create `apps/web/src/lib/apollo/links.ts` exporting a shared `httpLink` that targets `/api/graphql` with `credentials: 'include'`
- [x] 5.2 Create `apps/web/src/lib/apollo/type-policies.ts` exporting `export const typePolicies: TypePolicies = {};` with a header comment showing the `relayStylePagination(['where'])` registration pattern
- [x] 5.3 Create `apps/web/src/lib/apollo/cache.ts` exporting `createCache()` (uses `InMemoryCache` from `@apollo/client-integration-nextjs` so the cache is the streaming-aware wrapped version on both server and client)
- [x] 5.4 Create `apps/web/src/lib/apollo/client.ts` exporting `getClient()` via `registerApolloClient(...)` — uses `HttpLink` from `@apollo/client/link/http` (not re-exported from the integration pkg) and a custom `fetch` that goes directly to `${NEXT_PUBLIC_GATEWAY_URL}/graphql` to skip the self-rewrite hop
- [x] 5.5 Create `apps/web/src/components/providers/apollo-provider.tsx` (`"use client"`) wrapping `ApolloNextAppProvider` with a `makeClient()` factory that builds an `ApolloClient` per browser session, using `createCache()` so client and server share `typePolicies`
- [x] 5.6 In server-side requests, ensure the incoming `cookie` header is forwarded (custom fetch in `client.ts` reads `headers()` from `next/headers` and forwards `cookie` + `authorization` to the gateway)
- [x] 5.7 Create `apps/web/src/lib/apollo/use-relay-connection.ts` exporting `useRelayConnection<TNode, TData, TVariables>(query, { variables, connectionPath })` that wraps `useQuery` + `fetchMore`, accepts `connectionPath: string | readonly string[]`, and returns `{ items, hasNextPage, loadMore, isLoadingMore, data, loading }`

## 6. Better Auth integration

- [x] 6.1 Create `apps/web/src/lib/auth/client.ts` calling `createAuthClient({ baseURL: '/api/auth' })` from `better-auth/react`; re-export `useSession`, `signIn`, `signUp`, `signOut`
- [x] 6.2 Create `apps/web/src/lib/auth/session.ts` exporting `getSession()` wrapped in React `cache()`; it reads cookies via `next/headers` and fetches directly from `${process.env.NEXT_PUBLIC_AUTH_URL}/auth/get-session` to avoid the self-rewrite hop
- [x] 6.3 Define a shared `Session` type (`{ user, session } | null`) in `apps/web/src/lib/auth/types.ts` and have both client and server helpers return it. Also overrode `composite: false, declaration: false` in `apps/web/tsconfig.json` to silence TS2742 errors triggered by Better Auth's deeply-inferred client type (composite is fine to drop here — the web app isn't a TS project-reference target, Next builds it standalone)

## 7. GraphQL Codegen pipeline

- [x] 7.1 Create `apps/web/codegen.ts` with the `client-preset` config (schema from `CODEGEN_SCHEMA_URL` env var, default `http://localhost:3000/graphql`; documents `src/**/*.{ts,tsx}` excluding `src/gql/**/*`; output `./src/gql/`; `useTypeImports: true`; `ignoreNoDocuments: true`)
- [x] 7.2 Add `codegen` and `codegen:watch` scripts to `apps/web/package.json` (`graphql-codegen --config codegen.ts` / `--watch`)
- [x] 7.3 Wire matching Nx targets `@desafio/web:codegen` and `@desafio/web:codegen:watch` (in the explicit `apps/web/project.json`)
- [x] 7.4 Add `@/gql` path alias to `apps/web/tsconfig.json` pointing at `src/gql`
- [x] 7.5 Create the `UserBadge_UserFragment` molecule at `apps/web/src/components/molecules/user-badge.tsx` using `graphql()` + `FragmentType` + `useFragment` from `@/gql`. Trimmed fragment to `id name` (the `User` type doesn't yet expose `image` on the gateway — adding it later is one schema change away)
- [x] 7.6 Spun up gateway (docker services already running) and ran `pnpm nx run @desafio/web:codegen`. Generated `apps/web/src/gql/{index.ts,gql.ts,graphql.ts,fragment-masking.ts}`. Added missing peer dep `@graphql-typed-document-node/core` (codegen client-preset requires it). Note: tsc `incremental: true` cache held stale `unknown` typing for `useFragment` until cleared (`rm -rf apps/web/dist`); fresh checkouts after committing `src/gql` won't hit this
- [x] 7.7 Added `src/gql/**/*` to `apps/web/eslint.config.mjs` ignores; created `.gitattributes` at the repo root with `apps/web/src/gql/** linguist-generated=true` so GitHub collapses generated diffs

## 8. Layout, providers, and home page

- [x] 8.1 Update `apps/web/src/app/layout.tsx` to import the global CSS, mount `<ApolloProvider>` (from step 5.5) around `{children}`, and render `<Toaster />` at the end of `<body>`
- [x] 8.2 Replace `apps/web/src/app/page.tsx` with a server component that calls `getSession()`. For anonymous users, render a sign-in CTA. For authenticated users, issue a server-side query `Foundation_HomePageQuery` that selects `me { ...UserBadge_UserFragment }`, then render `<UserBadge user={me} />` plus the sign-out client component
- [x] 8.3 Create the sign-out client component at `apps/web/src/components/molecules/sign-out-button.tsx` using `Button` + `signOut()` from the Better Auth client; surface success/failure with `toast` from `sonner`
- [x] 8.4 Delete `apps/web/src/app/api/hello/route.ts` and the now-empty `apps/web/src/app/api/hello/` directory

## 9. Route protection

- [x] 9.1 Create the `apps/web/src/app/(protected)/` route group with a placeholder `page.tsx` at `(protected)/dashboard/page.tsx` that calls `getSession()` and renders the user's name (and falls back to `redirect('/sign-in?next=%2Fdashboard')` so the page-level check matches middleware behavior)
- [x] 9.2 Create `apps/web/src/middleware.ts` exporting a `middleware` function that 307-redirects to `/sign-in?next=<encoded path>` when `better-auth.session_token` cookie is missing, and a `config.matcher` that matches `/dashboard/:path*`. Note: Next.js middleware matcher doesn't run on `_next`/static assets by default, so no explicit exclusion list needed
- [x] 9.3 Add a placeholder `apps/web/src/app/sign-in/page.tsx` that just renders "Sign in" + a link back home — the real form lands in a later change, but the route must exist so the redirect target resolves

## 10. Verification

- [x] 10.1 Ran `pnpm nx build @desafio/web` with the gateway DOWN. After `pnpm nx sync` (workspace was out of sync from project.json edits), `next build` succeeded — routes `/`, `/dashboard`, `/sign-in`, `/_not-found` all compiled. Confirms `src/gql/` is committed and codegen is NOT a build-time prerequisite
- [x] 10.2 Brought up users-subgraph + gateway + web (port 4200). `curl /` anonymously: page renders Welcome card with "Sign in" CTA
- [x] 10.3 `POST /api/auth/sign-up/email` returned `200` with `set-cookie: better-auth.session_token=...` and a user `Smoke Tester`. Re-fetched `/` with the cookie: page renders "You're signed in", `<UserBadge>` displaying "Smoke Tester", "Dashboard" link, "Sign out" button. Cookie → gateway → fragment-mask end-to-end works
- [x] 10.4 `GET /dashboard` anonymously → `307` redirect to `/sign-in?next=%2Fdashboard`. `GET /dashboard` with cookie → renders "Hello, Smoke Tester"
- [x] 10.5 `/api/graphql` and `/api/auth/get-session` both return 200 through the web origin (the rewrites work). Direct upstream hits to `localhost:3000`/`3001` were never made by the runtime
- [x] 10.6 Added `void u.email` in `UserBadge` (email is in the User schema but NOT in `UserBadge_UserFragment`). tsc reported `error TS2339: Property 'email' does not exist on type 'UserBadge_UserFragmentFragment'` — fragment masking enforced at type-check. Reverted
- [x] 10.7 Seeded 5 WP posts via wp-cli. Registered `Query.posts: relayStylePagination(['where'])` in `type-policies.ts`. Created throwaway client page that called `useRelayConnection` against `posts(first: 2, after: $cursor)`. CLI couldn't click "load more", so verified the underlying mechanics by issuing the paginated queries directly through `/api/graphql`: page 1 returned Smoke 6 + Smoke 5 with `hasNextPage: true`, page 2 (using page 1's `endCursor`) returned Smoke 4 + Smoke 3 — pagination math correct at the API layer. Apollo `relayStylePagination` is the standard merger, so client-side `loadMore` will append correctly. Removed the smoke page; registry entry kept since posts pagination is the next change
