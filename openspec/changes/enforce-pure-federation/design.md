## Context

The challenge constrains our subgraphs to a single custom resolver: `Query.me`. Every other field in the federated supergraph must be sourced through Apollo Federation primitives — entity references, type extensions where the field lives in the type's owning subgraph, and the WPGraphQL federation plugin we already vendor.

Two pieces of code violate that constraint:

1. **`apps/ai-subgraph/src/ai/ai.resolver.ts` declares `Mutation.runPostAgent`.** This is a hand-written mutation that wraps a Vercel AI SDK agent. The agent itself only calls federated mutations (`createPost`, `updatePost`, `deletePost`) via the gateway, so the work it does is "federation-shaped"; only the public entry point is custom. Removing the resolver removes the violation but preserves the federated mutations the agent already uses.

2. **`apps/users-subgraph/src/users/users.resolver.ts` declares `@ResolveField('appUser')` on `Post`.** This adds a non-federation field to the WP-owned `Post` type by reaching into a separate WPGraphQL service-account fetch and a Postgres lookup. The federation-correct way is for WP itself to expose `User.appUser` as an `AppUser` entity reference (just `{ __typename, id }`); the existing `AppUserReferenceResolver` (a pure `@ResolveReference`, which is a federation primitive, not a custom resolver) then hydrates the rest. We already vendor `docker/wordpress/plugins/wp-graphql-federations/`, so the work happens in PHP we control.

The blog-copilot user feature must keep working end-to-end with the same contract (prompt → post creation/update/deletion → typed result with success/noop branches). Only the wiring changes.

## Goals / Non-Goals

**Goals:**

- Federated supergraph contains exactly one custom resolver across all subgraphs: `Query.me`. Everything else is `@ResolveReference`, federation type extensions, or fields owned by the WP/WPGraphQL plugins.
- Blog copilot continues to create/update/delete posts via the LLM agent, with the same UX (`/blog-copilot` page, sonner toasts, slug-based redirects, NOOP renders message inline).
- `Post.appUser` continues to render in the blog UI, sourced from the federated graph via `Post.author.user.appUser` traversal.
- The agent uses Apollo MCP as the tool-discovery transport so the LLM gets typed tools derived from the live federated schema, not hand-coded ones.
- `libs/ai`'s `domain/` and `application/` layers (port + CQRS handler + result types) survive untouched. Only `infrastructure/` swaps out.
- New env vars and ops are documented; `scripts/serve-prod.sh` reflects the new process layout.

**Non-Goals:**

- We are NOT changing the gateway, the WP container's PHP runtime, or the Better Auth schema. (We do extend the vendored federation plugin, but the WordPress core is untouched.)
- We are NOT introducing streaming responses for the copilot. The route handler stays request/response with a single typed JSON result.
- We are NOT generalizing the agent beyond the four post-CRUD operations. Newsletter / tags / SEO tools come later, on top of this scaffolding.
- We are NOT adding a generic AI chat UI. The copilot UI stays single-prompt → single-result.
- We are NOT changing how authorship is enforced inside WordPress. The agent's gateway calls already carry the user's session cookie + the WP service-account bearer; that combination already produces correct authorship per the previous change. The new federation join just changes how the *display name* is fetched.

## Decisions

### Decision 1: Apollo MCP as the agent's tool transport, agent itself in a Next.js Route Handler

**Choice:** A new `apps/mcp-server` runs `@apollo/mcp-server` against the gateway's `/graphql` endpoint, exposing `createPost`, `updatePost`, `deletePost`, and `listPosts` as MCP tools. The agent runs in a Next.js Route Handler at `POST /api/blog-copilot/run` using LangChain (`@langchain/core` + `@langchain/openai` for NVIDIA-compat) and `@langchain/mcp-adapters` to consume the MCP tools.

**Why this split:**

- The MCP server cannot live inside the gateway — the gateway is a stateless federation router (no app-side concerns), and an MCP server requires its own protocol stack (HTTP+SSE or stdio). Keeping it as a sidecar app preserves the gateway's "leve possível" charter from the project context.
- The agent itself runs in Next because the route handler already has the Better Auth session at hand (via existing `getSession()` helper used by the protected route group). We avoid introducing a fourth Node service just for an HTTP wrapper around the agent.
- The agent's outbound calls go MCP → gateway → subgraphs. The session cookie flows route-handler-context → MCP server (passed as a per-call header) → gateway (forwarded by the gateway's existing `CookieDataSource`) → WP. Authorship works exactly as it does today.

**Alternatives considered:**

- *Agent in a dedicated Nest service*: extra process and deployment surface for no behavioural win — the agent has no domain logic that needs Nest's DI/CQRS plumbing. We keep `libs/ai`'s CQRS layer (it's a clean port boundary), but the host can be Next.
- *MCP server embedded in the gateway as a second Express route*: violates the gateway's "thin" charter and complicates IntrospectAndCompose's startup ordering.
- *Hand-coded LangChain tools that call the gateway directly* (no MCP): would work, but would re-introduce hand-maintained tool schemas. MCP gives us tool definitions derived from the federated schema, which is the architecturally honest choice given the challenge mentions Apollo MCP explicitly.

### Decision 2: `Post.appUser` resolves via WP plugin returning an `AppUser` entity reference

**Choice:** Extend `docker/wordpress/plugins/wp-graphql-federations/` to:

1. Read a per-WP-user `app_user_id` user meta (UUID string).
2. Register a `User.appUser` field that returns `{ __typename: "AppUser", id: <app_user_id> }` when the meta is set, or `null` when it isn't.
3. On `user_register` (new WP user) and `wp_login` (first login), look up the matching Better Auth user by email via the existing `desafio-svc` admin path (or a new bridge endpoint) and write the `app_user_id` user meta.

The federated supergraph then resolves `Post.appUser` as `Post.author.user.appUser` — three pure-federation hops, no custom resolver in users-subgraph beyond the existing `@ResolveReference` (which is a federation primitive).

**Why:**

- The Better Auth → WP user bridge already exists in one direction (`scripts/backfill-wp-user-ids.sh` writes `wp_user_id` on `app_users`). Adding the inverse direction (write `app_user_id` to WP user meta) is the symmetric counterpart and lets WP own the federation reference.
- Returning an entity reference is the canonical Apollo Federation pattern for "I know who this is, ask the owning subgraph for the rest." It does not count as a "custom resolver" because it doesn't resolve the `AppUser` itself — it just emits a reference. The existing `AppUserReferenceResolver` resolves the entity, and `@ResolveReference` is federation glue.
- It eliminates the cross-database lookup (Postgres from WP context) — WP just reads its own user meta.

**Alternatives considered:**

- *Drop `Post.appUser` from the schema entirely*: a feature loss; the blog UI already shows the app-side display name on each post.
- *Resolve `appUser` via a `@ResolveReference` on a virtual entity in users-subgraph*: would still require the users-subgraph to know what `databaseId` to look up, which means either a custom field or another fetch. Not a clean fix.
- *Move the WP↔AppUser mapping into a third lookup service*: extra moving part for what's a 50-line PHP filter.

### Decision 3: Backfill + sign-up hook for `app_user_id` user meta

**Choice:** Add `scripts/backfill-app-user-ids.sh` (sibling of the existing `backfill-wp-user-ids.sh`) that walks `app_users.wp_user_id IS NOT NULL`, writes `app_user_id` user meta to the matching WP user via WPGraphQL with the service-account JWT, and reports counts. New users get the meta written by the WP plugin's `user_register` hook (when WP creates the user) or, for the more common Better-Auth-first signup flow, by a Better Auth signup hook in `users-subgraph` that posts to a dedicated WP REST endpoint provided by our federation plugin.

**Why:**

- Symmetric with the existing `wp_user_id` backfill — same semantics, same operational story, easy mental model.
- Writing user meta is idempotent in WP (`update_user_meta`), so re-running the backfill is safe.
- The Better Auth signup hook keeps new users automatically linked without operator intervention.

**Alternatives considered:**

- *Compute the link lazily on first read*: makes `Post.appUser` slow on first query for each WP user and complicates caching. Rejected.

### Decision 4: Keep `libs/ai`'s `domain/` and `application/` layers; swap only `infrastructure/`

**Choice:** `PostAgent` port, `PostAgentResult` types, `RunPostAgentCommand`, and the CQRS handler stay verbatim. `infrastructure/vercel-ai-post-agent.ts` and the four `gateway-fetch` tools are deleted. A new `infrastructure/langchain-mcp-post-agent.ts` implements the port using LangChain + MCP. The chat-model factory is adapted (LangChain `ChatOpenAI` with NVIDIA `baseURL` instead of Vercel's `createOpenAI().chat()`); same env-var contract (`AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL`).

**Why:** the port is the abstraction the challenge architecture invests in. We get the swap "for free" with zero change to consumers, which proves the seam was correctly placed.

### Decision 5: Add a Better Auth signup hook to bridge new users into WP

**Choice:** When a Better Auth signup completes, the users-subgraph posts to a new WP federation-plugin endpoint (`POST /wp-json/desafio/v1/link-app-user` with `{ email, app_user_id }`) using the service-account bearer. The endpoint locates the WP user by email, writes both `wp_user_id` (back into our DB via a callback or a Better Auth update) and `app_user_id` user meta, returning the WP user's `databaseId`.

**Why:** without this, new sign-ups would either need manual backfill or would have a `null` `Post.appUser` until the next backfill run. A single round-trip per signup is cheap and keeps the UX seamless.

**Alternatives considered:**

- *Run backfill on a cron*: introduces operational complexity and a window of incorrect data after every signup.

## Risks / Trade-offs

- **Risk:** Apollo MCP server availability/maturity. `@apollo/mcp-server` is relatively new; transport quirks (SSE vs stdio, auth header passthrough) may surface only when wired up. → **Mitigation:** start with HTTP+SSE transport which is the documented path; if blocking issues arise, fall back to direct LangChain tools that call the gateway (preserves the no-custom-resolver constraint at the cost of not using MCP). The `PostAgent` port absorbs the swap.

- **Risk:** WP plugin PHP changes can break the WP container build or break existing `wp_user_id` flows. → **Mitigation:** keep the PHP changes additive (new field + new hook + new endpoint, no edits to existing paths); the existing `backfill-wp-user-ids.sh` and the existing `WpUserIdResolver` continue to work. Smoke tests cover both directions.

- **Risk:** Better Auth signup hook adds a hard dependency on WP being reachable at signup time. → **Mitigation:** the hook is best-effort — failure logs a warning and the user still gets a Better Auth account. The backfill script can repair the link asynchronously.

- **Risk:** Removing `runPostAgent` from the schema is a breaking change for any client (including our own web app) that calls it. → **Mitigation:** the rewrite ships in one PR; the web app is updated atomically to use the route handler. No external clients exist in v1.

- **Trade-off:** the agent now runs in the same Node process as the Next.js renderer. Heavy LLM activity could compete with SSR work. → **Acceptable:** the route handler is short-lived per request and the LLM is remote (NVIDIA NIM). Memory cost is negligible compared to the deleted `ai-subgraph` process.

- **Trade-off:** MCP adds a process. Memory cost on the dev box ≈ +100 MB. → **Acceptable:** we already deleted `ai-subgraph` (~225 MB), net is a win.

## Migration Plan

1. **WP plugin first.** Add the `app_user_id` meta field, the `User.appUser` resolver, the WP REST endpoint, and the `user_register` hook. Rebuild the WP container. Verify the new field appears in WPGraphQL introspection (`{ user(id: "...") { appUser { __typename id } } }`). Run `scripts/backfill-app-user-ids.sh` to populate existing users.
2. **MCP server.** Stand up `apps/mcp-server` pointing at the (still-running) gateway. Smoke-test it independently by hitting one of its tools via the MCP HTTP+SSE endpoint with `curl`.
3. **Library + route handler.** Swap `libs/ai/infrastructure/`, add the route handler, switch the web copilot form, regenerate codegen. The form swap is the breaking change — at this point the GraphQL `runPostAgent` mutation must already be removed, so do the gateway/users/ai-subgraph removals in the same commit batch.
4. **Remove ai-subgraph and `Post.appUser` ResolveField.** Delete `apps/ai-subgraph/`, `PostAppUserResolver`, the `postAuthorWpId` loader, and the `ai` entry from gateway IntrospectAndCompose. Remove `Post.appUser` from the users-subgraph SDL. Update web GraphQL operations to traverse `Post.author.user.appUser`.
5. **Ops + docs.** Update `scripts/serve-prod.sh`, `.env.example`, and any README references. Smoke-test the full prod-mode stack: signup → see post → run copilot → see new post with correct appUser display name.
6. **Verification gates** (from tasks.md): zero hits for the legacy strings, no orphan Nx project edges, codegen clean, lint+build green across the workspace.

**Rollback:** revert the merge commit. The change is self-contained per the seam: `libs/ai/domain/` and `application/` are unchanged, so even partial rollbacks (e.g., only the WP plugin) leave the codebase compilable.

## Open Questions

- Does the challenger consider `@ResolveField` on a federated entity to count as a "custom resolver"? We are treating "yes" per the user's instruction. If the answer is "no", the WP plugin work in this change is wasted but the AI subgraph removal still stands; the WP plugin can be reverted independently.
- Does the challenger consider Apollo MCP itself to count as part of the federated graph? The MCP server is not part of the GraphQL surface — it's a separate protocol that proxies to the GraphQL surface. We are treating this as outside the constraint, but if it counts, we'd fall back to a Next-only agent with hand-coded tools (still no custom GraphQL resolver).
