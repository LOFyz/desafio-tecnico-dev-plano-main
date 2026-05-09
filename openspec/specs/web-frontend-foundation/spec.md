### Requirement: Same-origin proxy for gateway and auth traffic

The web app SHALL expose the federated GraphQL gateway and the Better Auth endpoints under same-origin paths so that browser requests carry session cookies as first-party. `next.config.js` SHALL define rewrites that map `/api/graphql` to `${NEXT_PUBLIC_GATEWAY_URL}/graphql` and `/api/auth/:path*` to `${NEXT_PUBLIC_AUTH_URL}/auth/:path*`. Application code MUST address those upstream services exclusively through `/api/graphql` and `/api/auth/...` — direct cross-origin URLs are forbidden in client and server code paths that run in or are called from the web app.

#### Scenario: Browser issues a GraphQL operation
- **WHEN** a client component executes any Apollo Client operation
- **THEN** the network request MUST be sent to `/api/graphql` on the same origin as the page
- **AND** the request MUST include the Better Auth session cookie as a first-party cookie

#### Scenario: Browser hits the auth endpoints
- **WHEN** the Better Auth client SDK calls any of its endpoints (`/get-session`, `/sign-in`, `/sign-out`, etc.)
- **THEN** the network request MUST be sent under `/api/auth/...` on the same origin as the page

#### Scenario: Upstream URL configuration
- **WHEN** the web app starts up
- **THEN** the rewrite destinations MUST resolve from `NEXT_PUBLIC_GATEWAY_URL` and `NEXT_PUBLIC_AUTH_URL` environment variables
- **AND** the variables MUST default to `http://localhost:3000` and `http://localhost:3001` respectively when unset

### Requirement: Apollo Client available in server and client components

The web app SHALL provide a single Apollo Client configuration that works in both React Server Components and client components. A `getClient()` helper SHALL return a request-scoped client for server components, and an `<ApolloProvider>`-equivalent SHALL wrap client subtrees so they share a per-session client. Both paths MUST use the same `httpLink` pointing at `/api/graphql` with `credentials: 'include'`.

#### Scenario: Server component fetches data
- **WHEN** a server component imports `getClient()` and calls `query()`
- **THEN** the call MUST succeed without leaking client state across requests
- **AND** the request MUST forward the incoming `cookie` header so the gateway sees the user's session

#### Scenario: Client component subscribes to a query
- **WHEN** a client component renders inside the root layout
- **THEN** `useQuery` and related hooks MUST work without additional setup in the component
- **AND** the underlying client MUST be reused across re-renders within a browser session

### Requirement: Session helpers for both client and server

The web app SHALL expose a typed `useSession()` hook for client components and a `getSession()` async function for server components. Both MUST return the same shape: an object containing `user` and `session` when authenticated, or `null` when anonymous. `getSession()` MUST be deduplicated within a single React render via `cache()`.

#### Scenario: Anonymous server render
- **WHEN** a server component calls `getSession()` and the request has no session cookie
- **THEN** the function MUST return `null`
- **AND** the function MUST NOT throw

#### Scenario: Authenticated server render
- **WHEN** a server component calls `getSession()` with a valid session cookie
- **THEN** the function MUST return `{ user, session }` populated from the upstream `/auth/get-session` response

#### Scenario: Client subscribes to session
- **WHEN** a client component calls `useSession()`
- **THEN** the hook MUST return the current session (or `null`) reactively
- **AND** the hook MUST update when the user signs in or signs out without a full page reload

#### Scenario: Multiple server components call getSession in one render
- **WHEN** two or more server components call `getSession()` during the same request
- **THEN** the upstream `/auth/get-session` endpoint MUST be hit at most once per request

### Requirement: Route protection via middleware on a protected group

The web app SHALL ship a `middleware.ts` that runs only on URL paths belonging to a `(protected)` route group. The middleware MUST redirect unauthenticated requests to `/sign-in?next=<encoded-original-path>` based on the absence of the Better Auth session cookie. The middleware MUST NOT validate the cookie's contents — that responsibility belongs to the page itself via `getSession()`.

#### Scenario: Anonymous visit to a protected route
- **WHEN** a request without the session cookie hits any URL in the `(protected)` group
- **THEN** middleware MUST respond with a 302/307 redirect to `/sign-in?next=<original-path-encoded>`

#### Scenario: Authenticated visit to a protected route
- **WHEN** a request with a session cookie hits any URL in the `(protected)` group
- **THEN** middleware MUST allow the request to proceed without modification

#### Scenario: Public routes are not gated
- **WHEN** a request hits a URL outside the `(protected)` group (including the home page, sign-in, and static assets)
- **THEN** middleware MUST NOT run a session check

### Requirement: shadcn/ui foundation primitives are installed and themed

The web app SHALL be initialized with shadcn/ui using the `default` style, `slate` base color, and CSS-variable theming. The repo MUST contain a committed `apps/web/components.json`, the `cn()` utility at `apps/web/src/lib/utils.ts`, and the foundation primitives `Button`, `Input`, `Card`, and the `Sonner` toaster — all imported via the `@/components/atoms/ui/*` path alias (configured via `components.json` `aliases.ui`). The root layout MUST mount `<Toaster />` so any feature can fire toasts without additional setup.

#### Scenario: Importing a primitive
- **WHEN** any page or component imports `@/components/atoms/ui/button` (or any other seeded primitive)
- **THEN** the import MUST resolve and the component MUST render with the configured shadcn theme

#### Scenario: shadcn add writes to the atomic location
- **WHEN** a developer runs `pnpm dlx shadcn@latest add <primitive>` from `apps/web/`
- **THEN** the new file MUST land under `apps/web/src/components/atoms/ui/` (per the configured alias), not under `apps/web/src/components/ui/`

#### Scenario: Firing a toast from a feature
- **WHEN** any client component calls `toast(...)` from `sonner`
- **THEN** the toast MUST render in the layout-mounted `<Toaster />` without the feature needing to mount its own

### Requirement: Themed home page replaces the placeholder

The web app's home page SHALL render different content for anonymous and authenticated visitors. Anonymous visitors MUST see a sign-in call-to-action linking to `/sign-in`. Authenticated visitors MUST see a personalized greeting using their Better Auth user name and a sign-out action. The Nx welcome boilerplate and the unused `app/api/hello/route.ts` MUST be removed.

#### Scenario: Anonymous visitor lands on the home page
- **WHEN** an anonymous visitor opens `/`
- **THEN** the page MUST render a sign-in CTA linking to `/sign-in`
- **AND** the page MUST NOT show the Nx welcome boilerplate

#### Scenario: Authenticated visitor lands on the home page
- **WHEN** an authenticated visitor opens `/`
- **THEN** the page MUST render a greeting that includes the user's name from the session
- **AND** the page MUST expose a sign-out control wired to the Better Auth client

### Requirement: Atomic Design folder layout for components

The web app SHALL organize all components under `apps/web/src/components/` into the buckets `atoms/`, `molecules/`, `organisms/`, `templates/`, and `providers/`. Each bucket MUST exist as a directory in the foundation, even if some are initially populated by only a `.gitkeep` or a single component. shadcn primitives MUST live under `atoms/ui/`. Page files under `apps/web/src/app/` MUST import only from `templates/`, `organisms/`, or `providers/` — pages SHALL NOT import directly from `atoms/` or `molecules/` except for trivially layout-only helpers.

#### Scenario: Atomic directories exist
- **WHEN** a developer inspects `apps/web/src/components/`
- **THEN** subdirectories `atoms/`, `molecules/`, `organisms/`, `templates/`, `providers/` MUST all exist

#### Scenario: shadcn primitive is placed atomically
- **WHEN** the foundation seeds the `Button` primitive
- **THEN** the file MUST live at `apps/web/src/components/atoms/ui/button.tsx`

### Requirement: GraphQL Codegen client-preset pipeline

The web app SHALL use `@graphql-codegen/cli` with `@graphql-codegen/client-preset` to generate type-safe GraphQL artifacts. A `apps/web/codegen.ts` file MUST configure the preset to scan `src/**/*.{ts,tsx}` (excluding `src/gql/**/*`) and emit to `apps/web/src/gql/`. The schema source MUST default to `http://localhost:3000/graphql` and MUST be overridable via the `CODEGEN_SCHEMA_URL` env var. The repo MUST commit the generated `apps/web/src/gql/` directory so a fresh checkout can build without first running codegen against a live gateway. The package MUST expose `codegen` and `codegen:watch` scripts and equivalent Nx targets `@desafio/web:codegen` and `@desafio/web:codegen:watch`.

#### Scenario: Generated artifacts are present after codegen
- **WHEN** a developer runs `pnpm nx run @desafio/web:codegen` against a running gateway
- **THEN** `apps/web/src/gql/index.ts` MUST exist and re-export `graphql`, `useFragment`, `FragmentType`
- **AND** the generated files MUST be free of TypeScript errors when type-checked

#### Scenario: Build does not require codegen on a clean checkout
- **WHEN** a developer clones the repo, runs `pnpm install`, and runs `pnpm nx build @desafio/web`
- **THEN** the build MUST succeed without first running codegen
- **AND** the build MUST NOT require the gateway to be reachable

#### Scenario: Schema URL override
- **WHEN** `CODEGEN_SCHEMA_URL` is set in the environment
- **THEN** codegen MUST use that URL as the schema source, not the default

### Requirement: Components consume data via colocated fragments

Any component that displays data fetched from GraphQL SHALL declare a colocated fragment using the generated `graphql()` tag, type its props as `FragmentType<typeof FragmentDoc>`, and unmask the fragment at render time via `useFragment()`. Components MUST NOT type their props using the generated query/operation result types directly — they MUST go through `FragmentType`. The foundation MUST ship at least one example component (`UserBadge`) that demonstrates this pattern end-to-end, and the home page MUST consume it for authenticated users so the entire pipeline (gateway → cookie forwarding → fragment masking) is exercised.

#### Scenario: Fragment-bearing component types its props correctly
- **WHEN** a component declares `const Foo_BarFragment = graphql(`fragment Foo_BarFragment on Bar { id }`)`
- **THEN** the component's props MUST be typed as `{ bar: FragmentType<typeof Foo_BarFragment> }`
- **AND** the component body MUST call `useFragment(Foo_BarFragment, props.bar)` before reading any field

#### Scenario: Fragment masking blocks unauthorized access at type-check
- **WHEN** a component tries to read a field on the unmasked `props.bar` that is not part of `Foo_BarFragment`
- **THEN** TypeScript MUST emit a compile error pointing at the property access

#### Scenario: Foundation pipeline is verified by UserBadge on the home page
- **WHEN** an authenticated visitor opens `/`
- **THEN** the page's server-side query MUST spread `UserBadge_UserFragment` into the operation
- **AND** the rendered `UserBadge` MUST display the user's name from the masked fragment data

### Requirement: Relay-style cursor pagination is supported by the Apollo cache and a shared hook

The Apollo cache SHALL be constructed via `createCache()` from `apps/web/src/lib/apollo/cache.ts`, which composes `typePolicies` from a registry file `apps/web/src/lib/apollo/type-policies.ts`. The foundation MUST seed the registry empty and document — in a comment in that file — how to register a Relay connection using `relayStylePagination()` from `@apollo/client/utilities`. Both the server-side `getClient()` and the client-side provider MUST share the same cache configuration. The foundation MUST also export a `useRelayConnection<TData>(query, variables, { connectionPath })` hook from `apps/web/src/lib/apollo/use-relay-connection.ts` that returns `{ items, hasNextPage, loadMore, isLoadingMore }` for any connection following the Relay cursor-connection spec, where `connectionPath` accepts a string (`'posts'`) or string array (`['me', 'posts']`) addressing the connection field within the query result.

#### Scenario: Type-policies registry exists and is documented
- **WHEN** a developer opens `apps/web/src/lib/apollo/type-policies.ts`
- **THEN** they MUST see `export const typePolicies: TypePolicies = {};`
- **AND** they MUST see a comment showing the example registration pattern using `relayStylePagination()`

#### Scenario: Cache is shared between server and client
- **WHEN** both `getClient()` and the Apollo provider construct their caches
- **THEN** both MUST call `createCache()` from `apps/web/src/lib/apollo/cache.ts`
- **AND** both MUST receive the same `typePolicies` registry

#### Scenario: A registered Relay connection paginates correctly
- **WHEN** a feature appends a `relayStylePagination()` policy to the registry for a field, and a component calls `useRelayConnection(query, vars, { connectionPath: '<field>' })`
- **THEN** repeated `loadMore()` calls MUST append new edges to `items` without duplicating prior edges
- **AND** `hasNextPage` MUST flip to `false` after the last page is loaded

#### Scenario: connectionPath supports nested fields
- **WHEN** a query returns a connection at `me.posts`
- **THEN** `useRelayConnection(query, vars, { connectionPath: ['me', 'posts'] })` MUST resolve the connection at that path

### Requirement: Documented environment variables for the web app

The web app's required environment variables SHALL be documented in `.env.example` at the repo root. The variables `WEB_PORT`, `NEXT_PUBLIC_GATEWAY_URL`, `NEXT_PUBLIC_AUTH_URL`, and `CODEGEN_SCHEMA_URL` MUST appear with the same local-dev defaults the rewrites and codegen pipeline use, so a fresh checkout works after `cp .env.example .env`.

#### Scenario: Fresh checkout
- **WHEN** a developer copies `.env.example` to `.env` and runs the web dev server
- **THEN** the rewrites MUST resolve to the local gateway and users-subgraph URLs without further configuration
- **AND** running `pnpm nx run @desafio/web:codegen` MUST resolve the gateway schema URL without further configuration
