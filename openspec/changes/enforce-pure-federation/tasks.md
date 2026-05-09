## 1. WP federation plugin: app_user_id meta + endpoint + hook

- [ ] 1.1 In `docker/wordpress/plugins/wp-graphql-federations/`, register a `User.appUser: AppUser` field via the WPGraphQL `register_graphql_field` API; resolver reads `get_user_meta($user->databaseId, 'app_user_id', true)` and returns `{ __typename: 'AppUser', id: <meta> }` when present, else `null`.
- [ ] 1.2 Register a WP REST route `POST /wp-json/desafio/v1/link-app-user` accepting `{ email, app_user_id }`, protected by the same JWT auth that guards existing service-account paths (validate `WP_GRAPHQL_SERVICE_TOKEN`-backed bearer); on success: `get_user_by('email', $email)` → `update_user_meta($id, 'app_user_id', $app_user_id)` → `200 { wp_user_id: <int> }`; 404 if no user; 400 if `app_user_id` is empty/non-UUID; 401 if the bearer is missing/invalid.
- [ ] 1.3 ~~Register a `user_register` action hook~~ **DEFERRED to v2.** Rationale: per session decision 2026-05-09, the WP→Better Auth lookup adds cross-DB / cross-service complexity. v1 ships with only the Better Auth signup hook (task 2.3). WP-admin-created users get linked via the backfill script (task 2.1).
- [ ] 1.4 Rebuild the WP container (`docker compose build wordpress && docker compose up -d wordpress`) and verify the new field via WPGraphQL: `{ user(id: "<wp-user-relay-id>") { appUser { __typename id } } }` returns the entity reference (or `null` for a user without the meta).
- [ ] 1.5 `curl -H "Authorization: Bearer $WP_GRAPHQL_SERVICE_TOKEN"` smoke-test the REST endpoint for the three branches: success (existing email + valid uuid), 404 (unknown email), 400 (empty app_user_id), 401 (no bearer).

## 2. Backfill script + Better Auth signup hook

- [ ] 2.1 Create `scripts/backfill-app-user-ids.sh` (sibling of `backfill-wp-user-ids.sh`) that selects `id, email` from `app_users` where `wp_user_id IS NOT NULL`, POSTs each `(email, id)` to `/wp-json/desafio/v1/link-app-user` with the service-account bearer, prints per-user OK/FAIL, and a final `Linked N users (M failures)` summary; `chmod +x` it.
- [ ] 2.2 Run `scripts/backfill-app-user-ids.sh` against the local stack and verify the resulting WP user metas with a sampling query (`{ user(id: "<wp-user-relay-id>") { appUser { id } } }`).
- [ ] 2.3 In `apps/users-subgraph/src/auth/`, add a Better Auth `after.user.create` hook that POSTs `{ email, app_user_id: newUser.id }` to `${WP_GRAPHQL_URL}/wp-json/desafio/v1/link-app-user` with the bearer, captures the returned `wp_user_id`, and writes it back into the `user.wp_user_id` column via the existing MikroORM EntityManager; the hook MUST swallow errors with a warning log and MUST NOT roll back the signup.
- [ ] 2.4 Wire the hook into `BetterAuthModule.forRootAsync` so it runs in production-mode boots; smoke-test by signing up a new user and verifying both `app_users.wp_user_id` and the corresponding WP user's `app_user_id` meta are populated within one round-trip.

## 3. New app: apps/mcp-server (Apollo MCP Server)

- [ ] 3.1 Scaffold `apps/mcp-server` mirroring the `apps/users-subgraph` layout: `package.json` with `@nx/rspack:rspack` build target (same `mode: production`, `skipTypeChecking: true`), `rspack.config.js` (with `pg-native` resolve.alias guard if any deps drag it in), `tsconfig.app.json` referencing the shared base config, `eslint.config.mjs`, `src/main.ts` bootstrap, `src/assets/` placeholder.
- [ ] 3.2 Add deps to `apps/mcp-server/package.json`: `@modelcontextprotocol/sdk` (the official Node MCP SDK — `@apollo/mcp-server` doesn't exist as an npm package; Apollo's MCP Server is a Rust binary distributed separately), `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `graphql`, `reflect-metadata`, `rxjs`, `tslib`. (No `@nestjs/graphql` — the MCP server doesn't expose its own GraphQL endpoint.)
- [ ] 3.3 Implement `src/main.ts` and `src/app/app.module.ts`: bootstrap NestJS, register a custom MCP server using `@modelcontextprotocol/sdk`'s `Server` class that proxies to `process.env.GATEWAY_URL` (default `http://localhost:3000/graphql`), expose exactly four tools (`createPost`, `updatePost`, `deletePost`, `listPosts`) whose `execute` POSTs the corresponding hand-written GraphQL operation to the gateway, bind the HTTP+SSE transport to `MCP_SERVER_PORT` (default `4000`) on path `/mcp`, configure per-call header passthrough so incoming `cookie` and `authorization` headers are forwarded verbatim on the outgoing gateway request.
- [ ] 3.4 Add startup-time gateway reachability check: HEAD or short GraphQL `__typename` query against `GATEWAY_URL`; log + exit non-zero if the gateway is down.
- [ ] 3.5 Verify `pnpm nx build mcp-server` succeeds with no TS errors and a `dist/main.js` is emitted.
- [ ] 3.6 Smoke-test the MCP server independently: start it with the gateway running, then `curl -N http://localhost:4000/mcp` (or use the MCP client equivalent) to verify the SSE handshake; call `tools/list` and confirm exactly the four tool names appear.
- [ ] 3.7 Manually invoke `tools/call` for `listPosts` (with cookie + bearer headers) and verify the call returns the federated gateway's data.

## 4. libs/ai: replace Vercel AI SDK with LangChain + MCP

- [x] 4.1 Update `libs/ai/package.json`: REMOVE `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `zod` (if unused after the swap); ADD `@langchain/core`, `@langchain/openai` (provides ChatOpenAI for NVIDIA-compat), `@langchain/anthropic`, `@langchain/mcp-adapters`, `@modelcontextprotocol/sdk` (peer dep of mcp-adapters).
- [x] 4.2 Delete `libs/ai/src/lib/infrastructure/vercel-ai-post-agent.ts` and `libs/ai/src/lib/infrastructure/tools/{create-post,update-post,delete-post,list-post,gateway-fetch}.tool.ts` (every file in `infrastructure/tools/`).
- [x] 4.3 Rewrite `libs/ai/src/lib/infrastructure/chat-model.factory.ts` to return a LangChain chat model: `nvidia` → `new ChatOpenAI({ apiKey, configuration: { baseURL: NVIDIA_BASE_URL ?? AI_BASE_URL }, model })`; `openai` → `new ChatOpenAI({ apiKey, configuration: { baseURL: AI_BASE_URL }, model })`; `anthropic` → `new ChatAnthropic({ apiKey, model })`; throw on missing key or unknown provider.
- [x] 4.4 Add `libs/ai/src/lib/infrastructure/langchain-mcp-post-agent.ts` implementing the existing `PostAgent` port: per `run({ prompt, userId, sessionCookie })` build a `MultiServerMCPClient` connecting to `process.env.MCP_SERVER_URL` (default `http://localhost:4000/mcp`) with `cookie` and `authorization` headers populated; load the four tools via `client.getTools()`; build a LangChain agent (`createReactAgent` from `@langchain/langgraph/prebuilt`) bound to `createChatModel()` and the tools; invoke with the `SYSTEM_PROMPT` (kept from the previous adapter — same "ALWAYS call listPosts first when updating/deleting" guidance) and the user's prompt; walk the resulting `messages` for the last successful tool result; map to `PostAgentResult` (CREATED/UPDATED/DELETED/NOOP) using the existing branching logic; close the MCP client at the end.
- [x] 4.5 Update `libs/ai/src/lib/ai.module.ts`: keep `{ provide: POST_AGENT, useClass: LangChainMcpPostAgent }`, keep `RunPostAgentHandler`, keep `CqrsModule` import. The exported surface is unchanged.
- [x] 4.6 Update `libs/ai/src/index.ts` named exports if any export name changed; verify the public surface (`AiModule`, `RunPostAgentCommand`, `RunPostAgentHandler`, `POST_AGENT`, types, errors) is unchanged.
- [x] 4.7 Run `pnpm install` to refresh the lockfile; verify zero `@ai-sdk/*` and zero `ai@^6` entries remain via `pnpm why @ai-sdk/openai` (expect "No packages match").
- [x] 4.8 Verify `pnpm nx build @desafio/ai` compiles cleanly. (No `build` target on this lib — it's TS path-mapped — so verified via `pnpm nx typecheck @desafio/ai` and `pnpm nx lint @desafio/ai`, both green.)

## 5. Web: Next.js Route Handler + form rewrite + GraphQL traversal swap

- [ ] 5.1 Add `apps/web/src/app/api/blog-copilot/run/route.ts`: `POST` handler that calls `getSession()`, validates body with zod (`{ prompt: z.string().min(5).max(500) }`), constructs a `RunPostAgentCommand(prompt, session.user.id, rawCookieString)`, and dispatches via the Nest CommandBus (boot a minimal Nest app context using `NestFactory.createApplicationContext(AiModule)` cached at module top-level so we don't re-bootstrap per request); map `PostAgentResult` to JSON response; map `AiGenerationFailedError` → 502, `WpPublishFailedError` → degraded 200 NOOP, others → 500.
- [ ] 5.2 Add `apps/web/src/lib/ai/route-handler-client.ts` (or co-locate in the route file) — a typed shim describing the JSON request/response so the form has compile-time types.
- [ ] 5.3 Update `apps/web/src/components/organisms/ai/blog-copilot-form.tsx`: replace the `useMutation(RUN_POST_AGENT_MUTATION)` import + call with a `fetch('/api/blog-copilot/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) })`; preserve the entire branching block (CREATED/UPDATED → push slug, DELETED → push /blog, NOOP inline) and toast logic; reuse the error-mapping helper.
- [ ] 5.4 Refactor `apps/web/src/lib/ai/errors.ts` from GraphQL `extensions.code` mapping to HTTP-response `error.code` mapping; same string outputs.
- [ ] 5.5 Delete `apps/web/src/lib/ai/operations/run-post-agent.mutation.ts`.
- [ ] 5.6 Find every fragment / query selecting `Post.appUser` and rewrite to traverse `Post.author.node.user.appUser` (selecting the same `UserBadge_UserFragment` inside). Affected files (verify with grep): `apps/web/src/lib/blog/operations/*.ts` and any inline operations in `apps/web/src/app/blog/**/page.tsx`.
- [ ] 5.7 Run `pnpm nx run @desafio/web:codegen` to regenerate `apps/web/src/gql/graphql.ts` and verify the `RunPostAgentMutation` type and the `Post.appUser` field disappear from the generated output.
- [ ] 5.8 Verify `pnpm nx build web` succeeds.

## 6. Remove ai-subgraph and PostAppUserResolver

- [ ] 6.1 Delete `apps/ai-subgraph/` entirely (`rm -rf apps/ai-subgraph`).
- [ ] 6.2 In `apps/users-subgraph/src/users/users.resolver.ts`, delete `PostAppUserResolver` and its imports; keep `AppUserReferenceResolver` untouched.
- [ ] 6.3 In `apps/users-subgraph/src/users/users.module.ts`, remove `PostAppUserResolver` from the providers list.
- [ ] 6.4 In `apps/users-subgraph/src/users/loaders/loader-factory.ts`, delete the `postAuthorWpId` loader and its WP-fetch helper; keep `appUserByWpId` (still used elsewhere).
- [ ] 6.5 In `apps/users-subgraph/src/schema.graphql`, remove the `appUser: AppUser` field from the `Post` type extension; if the only remaining content of the `extend type Post` block was that field, remove the whole `extend type Post` declaration too.
- [ ] 6.6 In `apps/gateway/src/app/app.module.ts`, remove the `{ name: 'ai', url: ... }` entry from `IntrospectAndCompose.subgraphs`.
- [ ] 6.7 Verify `pnpm nx run-many -t build -p users-subgraph gateway mcp-server web` succeeds end-to-end after deletions.

## 7. Ops: env, scripts, docs

- [ ] 7.1 Update `.env.example`: REMOVE `AI_SUBGRAPH_URL`; ADD `MCP_SERVER_URL=http://localhost:4000/mcp`, `MCP_SERVER_PORT=4000`, `MCP_TRANSPORT=http+sse`. Add comments noting the mcp-server is a separate process.
- [ ] 7.2 Update local `.env` accordingly.
- [ ] 7.3 Update `scripts/serve-prod.sh`: REMOVE the `start_node_app ai-subgraph 3002 ...` block; ADD a `start_node_app mcp-server 4000 apps/mcp-server/dist/main.js` block AFTER the gateway start (gateway must be up before mcp-server can introspect it); update the `PORTS=()` array (`3002` → `4000`); update the build set in the `nx run-many` line; update the final URL summary block.
- [ ] 7.4 Run `./scripts/serve-prod.sh` end-to-end and confirm: ports cleared, all four apps build, all four bind their ports in order, summary block prints all four URLs.

## 8. End-to-end verification + cleanup gates

- [ ] 8.1 Smoke E2E: signed-in user opens `/blog-copilot`, prompts "Create a post titled smoke", form posts to `/api/blog-copilot/run`, response is `CREATED` with the new slug, browser navigates to `/blog/<slug>`, the post page shows the author's app-side display name (sourced from the new federation path).
- [ ] 8.2 Smoke E2E: same user prompts "Update the post titled smoke to mention pure federation", response is `UPDATED`, `/blog/<slug>` reflects the change.
- [ ] 8.3 Smoke E2E: same user prompts "Delete the post titled smoke", response is `DELETED`, browser navigates to `/blog`, the post is gone from the listing.
- [ ] 8.4 Smoke E2E: anonymous visitor POSTs to `/api/blog-copilot/run` and receives HTTP 401 with `{ error: { code: "UNAUTHENTICATED" } }`.
- [ ] 8.5 Smoke E2E: signed-in user with intentionally short prompt (3 chars) receives HTTP 400 with `INVALID_PROMPT`.
- [ ] 8.6 Federated-graph compliance check: `curl -s http://localhost:3000/graphql -H 'content-type: application/json' -d '{"query":"{ __schema { queryType { name } mutationType { name fields { name } } } }"}'` lists ONLY federation-derived mutations from the WP subgraph (createPost, updatePost, deletePost, etc.) and NO `runPostAgent`.
- [ ] 8.7 Federated-graph compliance check: introspect `Post`'s field list and confirm `appUser` is absent (the join is exposed via `User.appUser` on the WP-owned type, not via `Post.appUser`).
- [ ] 8.8 Dead-code grep — must return zero hits outside `openspec/changes/archive/`: `git grep -nE "runPostAgent|RunPostAgentMutation|ai-subgraph|@ai-sdk|VercelAiPostAgent|PostAppUserResolver|postAuthorWpId"`.
- [ ] 8.9 Lockfile cleanliness: `grep -E "@ai-sdk|^\s+ai@\^6" pnpm-lock.yaml` returns zero matches.
- [ ] 8.10 Nx graph: `pnpm nx graph --json --file=/tmp/graph.json && jq '.graph.nodes | keys' /tmp/graph.json` shows no `ai-subgraph` node and includes `mcp-server`.
- [ ] 8.11 `pnpm nx run-many -t lint,build` clean across all remaining projects.
