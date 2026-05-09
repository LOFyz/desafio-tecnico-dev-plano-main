## Why

The brief calls for an AI-powered surface on top of the blog ("blog copilot, chat integrated pelo blog onde será possível atualizar posts...") and `libs/ai` exists in the repo as an empty placeholder waiting to be filled. The blog feed shipped in `web-blog-browse` proves the read path; the next missing capability is a **write** entry-point. The brief frames AI as the way users author and operate on content — not a single "create post" form, but a copilot that can **create, update, and delete** posts from natural language. This change introduces the smallest demoable copilot: one prompt input, one federated mutation, one Vercel AI SDK agent with four tools (create / update / delete / list), and the agent picks the right action(s) from the user's prompt.

It also shapes `libs/ai` along DDD seams so the future chat copilot (multi-turn, more tools — subscribers, tags, drafts, MCP if/when we want it) plugs into the same `Agent` port without re-architecting.

## What Changes

- Populate `libs/ai` as a DDD-layered library:
  - `domain/`:
    - `post-agent-result.ts` — discriminated union: `{ action: 'CREATED' | 'UPDATED', post: PostRef, message }` or `{ action: 'DELETED', databaseId, message }` or `{ action: 'NOOP', message }`.
    - `post-agent.ts` — port interface `PostAgent.run({ prompt, userId, sessionCookie }): Promise<PostAgentResult>`.
  - `infrastructure/`:
    - `chat-model.factory.ts` — selects a Vercel AI SDK `LanguageModel` from env (`AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, optional `AI_BASE_URL`). Three providers supported: `nvidia` (OpenAI-compatible at `https://integrate.api.nvidia.com/v1`, **free tier** on `build.nvidia.com`), `anthropic`, and `openai`. **Default `nvidia` + `meta/llama-3.3-70b-instruct`** so a fresh clone runs without paid API credits.
    - `tools/create-post.tool.ts`, `tools/update-post.tool.ts`, `tools/delete-post.tool.ts`, `tools/list-posts.tool.ts` — Vercel AI SDK `tool()` definitions that POST to the federated **gateway** with the calling user's session cookie. Each tool is a typed function the agent can call.
    - `vercel-ai-post-agent.ts` — `PostAgent` impl that runs `generateText({ model, tools, toolChoice: 'auto', maxSteps: 6, system, prompt })`. Walks the resulting message log to determine which tool(s) ran and produces a `PostAgentResult`.
  - `application/`: `RunPostAgentCommand` + handler (CQRS) that dispatches into the port.
- Add a new federation subgraph **`apps/ai-subgraph`** (NestJS Apollo Federation, port 3002) that contributes one mutation:
  ```graphql
  type Mutation {
    runPostAgent(input: RunPostAgentInput!): RunPostAgentResult!
  }
  ```
  The resolver is a thin adapter: it dispatches `RunPostAgentCommand` via NestJS `CommandBus`. A `BetterAuthGuard` rejects unauthenticated requests using the cookie the gateway already forwards.
- Wire `ai` into the gateway's `IntrospectAndCompose` subgraph list (one-line change to `apps/gateway/src/app/app.module.ts`).
- Add a new authenticated page `/(protected)/blog-copilot` to `apps/web/`:
  - Single-field prompt textarea, RHF + zod validation.
  - Typed `RUN_POST_AGENT` mutation via Apollo Client.
  - On success, react to the result's `action`:
    - `CREATED` / `UPDATED` → redirect to `/blog/<slug>` with sonner toast.
    - `DELETED` → redirect to `/blog` with sonner toast "Post deleted".
    - `NOOP` → stay on page, render the agent's `message` (e.g., "I couldn't find a post matching that").
  - On error, show an inline message mapped from the GraphQL error code.
- New env vars (documented in `.env.example`): `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL` (optional override), `AI_SUBGRAPH_URL`, `GATEWAY_URL`. Defaults: `AI_PROVIDER=nvidia`, `AI_MODEL=meta/llama-3.3-70b-instruct`, `AI_SUBGRAPH_URL=http://localhost:3002/graphql`, `GATEWAY_URL=http://localhost:3000/graphql`. Operators set `AI_API_KEY` to their NVIDIA key from `build.nvidia.com` (free) and the agent works with no further config.
- Created/updated posts publish with `status: PUBLISH` so they show up on `/blog` immediately. Authorship is pinned to the calling user automatically (the tools forward the user's session cookie when invoking the gateway, so WordPress attributes correctly).

## Capabilities

### New Capabilities
- `ai-post-agent`: end-to-end copilot for blog post CRUD via natural language, including the Vercel AI SDK agent in `libs/ai` (with create/update/delete/list tools routed through the federated gateway), the federated `runPostAgent` mutation in `ai-subgraph`, session-gated auth, the cookie-forwarded authorship contract, and the web prompt form that drives it.

### Modified Capabilities
_None._ The gateway's federation spec is generic about its subgraph set, so adding `ai` is a pure config change with no requirement-level impact.

## Impact

- **New lib** (`libs/ai/`): full DDD scaffold (`domain/`, `application/`, `infrastructure/`). New deps: `ai` (Vercel AI SDK), `@ai-sdk/openai` (used for both OpenAI and NVIDIA via `baseURL` override), `@ai-sdk/anthropic` (optional provider), `zod`, `@nestjs/cqrs`, `@nestjs/common`. Exports the Nest module + command + port + typed errors. No LangChain, no MCP client.
- **New app** (`apps/ai-subgraph/`): NestJS Apollo Federation subgraph mirroring `users-subgraph`'s build shape (rspack, tsconfig, project.json, `pg-native` `resolve.alias` guard since `libs/auth` transitively pulls `pg`). Imports `BetterAuthModule`, `CqrsModule`, and the new `AiModule`. Default port `3002`.
- **Gateway** (`apps/gateway/`): one-line addition to `IntrospectAndCompose.subgraphs` registering `ai` (env: `AI_SUBGRAPH_URL`, default `http://localhost:3002/graphql`). No other code change.
- **Web** (`apps/web/`): new route at `apps/web/src/app/(protected)/blog-copilot/page.tsx`, organism `apps/web/src/components/organisms/ai/blog-copilot-form.tsx` (client, RHF + zod), inline `graphql()` mutation literal at `apps/web/src/lib/ai/operations/run-post-agent.mutation.ts`. Codegen regenerates `src/gql/`. Dashboard gains a "Open blog copilot" link.
- **Auth boundary**: the mutation requires a valid Better Auth session — uses the existing cookie-forwarding from the gateway and a guard that calls `BetterAuth.api.getSession({ headers })`. The session cookie is also threaded down to each tool's gateway call so the agent's create/update/delete acts as the calling user; this means WordPress sees the user's identity for every action and `Post.appUser` resolves correctly via the existing `wp_user_id` mapping (and update/delete authorization is enforced by WordPress for posts the user owns).
- **WordPress**: no plugin or schema change. The agent's tools issue `mutation { createPost / updatePost / deletePost(...) }` and `query { posts(...) }` against the gateway, which routes to the WP `posts` subgraph.
- **Env vars** (`.env`, `.env.example`): adds `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_SUBGRAPH_URL`, `GATEWAY_URL`.
- **Cost / external dependency**: each prompt hits a paid LLM API and walks through one or more agent steps (cap `maxSteps: 6`). Documented; no in-app rate limiting in v1 beyond auth-required.

## Notes on the MCP / LangChain shape

The brief mentions Apollo MCP as the longer-term direction for the blog copilot. This change deliberately ships the agent **without** Apollo MCP and **without** LangChain to avoid standing up a separate MCP server app for what is still a single mutation. The Vercel AI SDK `tool()` shape is the local equivalent of MCP tools — typed functions the model can call — with the same gateway-as-backend property (every tool's `execute` POSTs to the gateway, not WPGraphQL directly). When the chat copilot lands, swapping the `PostAgent` port implementation to a LangChain-based one that loads MCP tools via `langchain-mcp-adapters` is purely an `infrastructure/` swap — `application/` and `domain/` stay untouched.
