## Why

`apps/web` is currently a barebones Next.js 16 shell — a placeholder home page and an unused `api/hello` route. None of the wiring required to consume the federated GraphQL gateway or the Better Auth session cookies has been laid down yet. Every feature page on the roadmap (posts list, posts editor, newsletter, AI copilot) needs the same foundation, so building it once now unblocks all later work.

## What Changes

- Replace the placeholder home page with a clean, themed shell that renders different content for authenticated vs. anonymous visitors.
- Add an Apollo Client integration that talks to the federated gateway from both server components and client components, forwarding session cookies on every request.
- Wire the Better Auth client SDK against `users-subgraph`'s `/auth` endpoint and expose a typed `useSession()` plus a server-side `getSession()` helper.
- Set up GraphQL Codegen with `@graphql-codegen/client-preset` so every component declares the data it needs via a colocated fragment, and TypeScript enforces fragment masking via `graphql()` + `useFragment()` (the pattern recommended in The Guild's [fragments-with-graphql-codegen](https://the-guild.dev/graphql/hive/blog/unleash-the-power-of-fragments-with-graphql-codegen) write-up).
- Bake [Relay-style cursor pagination](https://relay.dev/docs/tutorial/connections-pagination/) into the Apollo Client setup: an extensible `typePolicies` registry so each feature can register its connections with `relayStylePagination()`, plus a `useRelayConnection()` helper hook that exposes `{ items, hasNextPage, loadMore, isLoadingMore }` for any Relay-spec connection.
- Adopt an Atomic Design directory layout for components (`atoms/`, `molecules/`, `organisms/`, `templates/`) that mirrors how fragments compose, and document where shadcn primitives, feature components, and page-level templates live.
- Initialize shadcn/ui (components.json, base CSS variables, theming) and seed the primitives the foundation needs (`Button`, `Input`, `Card`, `Sonner` toaster) into the atomic structure.
- Proxy gateway and auth traffic through Next.js `rewrites` so the browser sees a single same-origin URL — avoids cross-origin cookie/CORS gymnastics for local dev.
- Add a `middleware.ts` that protects a `/(protected)` route group by checking the Better Auth session cookie.
- Add `.env.example` entries and a sample `.env.local` template for the web app.
- **BREAKING** for any code currently importing the placeholder `apps/web/src/app/page.tsx` content (none today).

## Capabilities

### New Capabilities
- `web-frontend-foundation`: the cross-cutting plumbing every web feature consumes — Apollo Client setup, Better Auth client wiring, shadcn/ui baseline, route protection, and same-origin proxying.

### Modified Capabilities
<!-- none — gateway/users-subgraph contracts are unchanged; web only consumes them -->

## Impact

- **New code**: `apps/web/src/lib/apollo/{links,cache,client,type-policies,use-relay-connection}.ts`, `apps/web/src/lib/auth/{client,session,types}.ts`, `apps/web/src/components/{atoms,molecules,organisms,templates,providers}/` (atomic structure with shadcn primitives living under `atoms/ui/`), `apps/web/src/middleware.ts`, an `(protected)` route group, an updated `layout.tsx` providing the Apollo + theme providers, `apps/web/codegen.ts`, generated `apps/web/src/gql/` artifacts (committed), an Nx target `@desafio/web:codegen`.
- **Modified files**: `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/global.css` (shadcn CSS vars + Tailwind base), `apps/web/next.config.js` (rewrites), `apps/web/tailwind.config.js` (shadcn preset), `apps/web/package.json` (new deps + codegen script), `apps/web/eslint.config.mjs` (ignore `src/gql/`), `apps/web/.gitignore` if needed, `.env.example`.
- **Dependencies added**: `@apollo/client`, `@apollo/client-integration-nextjs`, `graphql`, `better-auth` (client portion only), `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`, `lucide-react`, `sonner`, plus shadcn devDependency `tw-animate-css` if Tailwind v4. Dev deps: `@graphql-codegen/cli`, `@graphql-codegen/client-preset`, `@parcel/watcher` (for codegen watch mode if needed). Generated shadcn primitives are committed into the repo; generated codegen output under `apps/web/src/gql/` is also committed so consumers don't need to run codegen before building.
- **Backend impact**: zero — no schema or API change. Same-origin proxy means no CORS work on `gateway` or `users-subgraph`.
- **Removed**: the Nx welcome boilerplate inside `page.tsx` and the placeholder `api/hello/route.ts`.
