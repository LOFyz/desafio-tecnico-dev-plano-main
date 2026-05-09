## Why

The challenge requires that the only custom GraphQL resolver our subgraphs may declare is `Query.me` — every other field must be served by Apollo Federation primitives (entity references, cross-subgraph type extensions resolved by the WP plugin). Today we violate that rule in two places: the `ai-subgraph` exposes a custom `Mutation.runPostAgent`, and the `users-subgraph` declares a custom `@ResolveField('appUser')` on `Post`. We need to bring the codebase back into compliance without losing the blog copilot feature or the "post author = our app user" link in the UI.

## What Changes

- **BREAKING** Remove the `ai-subgraph` app entirely (deletes `Mutation.runPostAgent` from the federated schema).
- Replace the in-graph AI mutation with an out-of-band agent: a new `apps/mcp-server` runs the Apollo MCP server pointed at the gateway, and a Next.js Route Handler at `POST /api/blog-copilot/run` runs a LangChain agent that talks to the MCP server. The federated graph stays untouched.
- Rewrite `libs/ai` to swap the Vercel AI SDK + hand-written gateway-fetch tools for LangChain + `@langchain/mcp-adapters`. The CQRS handler, `PostAgent` port, and result types stay; only the infrastructure adapter changes.
- **BREAKING** Remove `PostAppUserResolver` (the `@ResolveField('appUser')` on `Post`) from `users-subgraph`. `Post.appUser` instead resolves through pure federation: the WPGraphQL federation plugin returns `{ __typename: "AppUser", id }` for `User.appUser`, and the existing `AppUserReferenceResolver` (a federation entity resolver, not a custom resolver) supplies the rest.
- Extend the vendored WPGraphQL federation plugin to (a) read an `app_user_id` user meta and expose `User.appUser` as an `AppUser` entity reference, and (b) write that meta on user creation via WordPress hooks so new sign-ups are linked automatically.
- Add a backfill script that walks existing WordPress users, looks up the matching Better Auth user by email, and writes the `app_user_id` user meta — sibling to the existing `scripts/backfill-wp-user-ids.sh`.
- Update web's blog-copilot form to POST to the route handler instead of calling the GraphQL mutation. Update `Post.appUser` selections to traverse `Post.author.user.appUser` so the federation join works.
- Remove the `ai` entry from the gateway's `IntrospectAndCompose.subgraphs` list.
- Update `scripts/serve-prod.sh` to drop `ai-subgraph` and add `mcp-server` in the correct startup order (subgraphs → mcp-server → gateway → web).
- Update `.env.example` and the env loader: drop `AI_SUBGRAPH_URL`, add `MCP_SERVER_URL` and `MCP_TRANSPORT`.

## Capabilities

### New Capabilities
- `mcp-server`: standalone Apollo MCP server process that introspects the gateway and exposes the WP CRUD operations (createPost, updatePost, deletePost, listPosts) as MCP tools for downstream LangChain agents.
- `wp-app-user-meta`: WPGraphQL federation plugin support for an `app_user_id` user meta — exposed via `User.appUser` as an entity reference, written on user creation, and seeded via a backfill script.
- `web-blog-copilot`: Next.js Route Handler at `POST /api/blog-copilot/run` that authenticates the session, runs the LangChain + MCP agent server-side, and returns the typed post-agent result.

### Modified Capabilities
- `ai-post-agent`: replaces the custom `Mutation.runPostAgent` resolver and the Vercel AI SDK adapter with the route-handler + LangChain/MCP architecture. The `PostAgent` port, CQRS command/handler, and result types are preserved verbatim; only the infrastructure adapter and the entry point change.
- `post-author-federation`: drops the custom `@ResolveField('appUser')` on `Post`. The `Post.appUser` field is now sourced through pure federation by traversing `Post.author.user.appUser`, with WP returning the `AppUser` entity reference.

(The `users-subgraph` and `gateway-federation` capabilities are also touched at the implementation level — `PostAppUserResolver` is deleted from `users-subgraph` and the `ai` subgraph is removed from the gateway's `IntrospectAndCompose` — but no requirements in those specs change. The relevant requirements live in `post-author-federation` and `ai-post-agent` respectively.)

## Impact

- **Code removed**: `apps/ai-subgraph/` (entire app), `libs/ai/src/lib/infrastructure/{vercel-ai-post-agent.ts,tools/*}`, `apps/web/src/lib/ai/operations/run-post-agent.mutation.ts`, `PostAppUserResolver` and `postAuthorWpId` loader from `users-subgraph`.
- **Code added**: `apps/mcp-server/` (Apollo MCP server app), `libs/ai/src/lib/infrastructure/langchain-mcp-post-agent.ts`, `apps/web/src/app/api/blog-copilot/run/route.ts`, `scripts/backfill-app-user-ids.sh`, PHP code in `docker/wordpress/plugins/wp-graphql-federations/` for the `app_user_id` meta + hook.
- **Dependencies**: remove `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic` from `libs/ai/package.json`; add `@langchain/core`, `@langchain/openai`, `@langchain/mcp-adapters`. `apps/mcp-server` adds `@apollo/mcp-server`.
- **Schema**: `Mutation.runPostAgent`, `RunPostAgentInput`, `PostAgentAction`, `RunPostAgentResult`, `PostRef` removed from the federated schema. `Post.appUser` no longer comes from users-subgraph; clients must traverse `Post.author.user.appUser`.
- **Env vars**: `AI_SUBGRAPH_URL` removed; `MCP_SERVER_URL` and `MCP_TRANSPORT` added.
- **Ops**: `scripts/serve-prod.sh` updated; one new background process (mcp-server). The WP container needs a fresh build to pick up the federation-plugin changes.
- **Compliance**: meets the "only `Query.me` is custom; everything else federation" rule for the entire federated schema.
