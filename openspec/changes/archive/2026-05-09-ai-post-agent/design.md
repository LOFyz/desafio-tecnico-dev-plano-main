## Context

Today's stack is two NestJS Apollo Federation subgraphs (`users`, `posts` via WPGraphQL) composed by `apps/gateway` running `ApolloGatewayDriver` + `IntrospectAndCompose`. The gateway is intentionally thin — it forwards the Better Auth cookie to every subgraph and composes — so it doesn't host its own resolvers. The `libs/ai` directory exists with no source code; the brief calls for an MCP-driven blog copilot **as the eventual goal**, but standing up Apollo MCP as its own service for what is still a single mutation is more infrastructure than this change needs.

Instead, this change ships the agent locally using the **Vercel AI SDK** (`ai` package). The SDK supports tool-calling natively: we declare typed tools in `libs/ai/infrastructure/`, the model decides when to call them, and the agent loop returns when the model emits a final answer. Tools shipped in v1 cover the full CRUD lifecycle: `createPost`, `updatePost`, `deletePost`, and `listPosts` (so the agent can find the right post when the user names it by title). Each tool's `execute` calls the **federated gateway** — preserving the user's "gateway is our backend" principle — with the calling user's session cookie attached so WordPress sees their identity. Swapping to a LangChain + MCP adapter later is a single `infrastructure/` swap because the application layer depends on a port (`PostAgent`).

Constraints in play:
- The user has stated `users-subgraph` is "only for authentication"; mutations should live in the gateway, "or in a lib applying DDD and imported in gateway." Since `ApolloGatewayDriver` doesn't natively host local resolvers, the practical interpretation is: a dedicated subgraph that imports the DDD lib, composed by the gateway.
- The brief mandates schema-first GraphQL on subgraphs and CQRS at the application layer.
- WPGraphQL exposes `createPost`, `updatePost`, `deletePost`, and `posts` natively — no plugin work needed for v1.
- Better Auth sessions are cookie-based and the gateway already forwards `cookie` to every subgraph (per `gateway-federation` spec).

## Goals / Non-Goals

**Goals:**
- A logged-in user submits a single natural-language prompt at `/blog-copilot`, clicks Send, and within ~10–25 seconds sees the result of the agent's action: created post → redirect to `/blog/<slug>`; updated post → redirect to `/blog/<slug>`; deleted post → redirect to `/blog`; nothing matched → message stays inline.
- The mutation `runPostAgent(input: RunPostAgentInput!)` is exposed through the federated gateway, gated by the existing Better Auth cookie session, and returns a discriminated result the web app can react to.
- `libs/ai` has a clean DDD seam: a `domain` port for "run the agent on this prompt for this user" and an `infrastructure` adapter that builds a Vercel AI SDK agent with the four tools. Future MCP/LangChain variants plug into the same port.
- All tools call the **federated gateway**, not WPGraphQL directly — preserving the gateway-as-backend principle.
- Provider is swappable via env var (`AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`).

**Non-Goals:**
- No streaming responses to the client. The mutation is synchronous — request in, action(s) executed, single response back.
- No chat history, no multi-turn conversations, no "edit this draft and try again" loop. Each prompt is independent.
- **No Apollo MCP server, no LangChain in this change.** The Vercel AI SDK's native tool-calling stands in for MCP for v1; swapping later is a port swap.
- No additional tools beyond create/update/delete/list for v1. Read tools beyond `listPosts` (e.g., `me`, `searchPosts`), write tools (subscribers, tags, drafts, scheduling), and any non-post operations come with the chat copilot.
- No queueing, retries beyond the LLM client's defaults, idempotency keys, or async background jobs.
- No rate-limiting infrastructure beyond "must be authenticated."
- No image generation, no embedding storage, no semantic search.
- No content moderation pipeline.
- No edits to the existing `users-subgraph` or WPGraphQL plugin.
- No "undo" surface for accidental deletes — the agent's destructive actions are immediate.
- No prompt-engineering UI (system prompt selectors, temperature sliders, etc.).
- No SST deploy. Local-only for v1.

## Decisions

### 1. Mutation lives in a new `ai-subgraph`, not the gateway and not `users-subgraph`

`ApolloGatewayDriver` is built to compose subgraphs and forward queries; adding local resolvers requires custom driver hacks that fight the framework. `users-subgraph` is per the user's stated principle "only for authentication." The clean path is a new subgraph that owns AI-related GraphQL surface and dispatches into `libs/ai`. Same pattern leaves room for future AI mutations (chat, drafts, summarization).

### 2. One mutation, multi-tool agent (not three separate mutations)

We deliberately ship a single `runPostAgent(prompt)` mutation rather than `createPostFromAi`, `updatePostFromAi`, `deletePostFromAi`. Reasoning:

- **Shape matches "copilot."** A copilot takes a prompt and figures out what to do. Three separate mutations would force the web UI to ask the user "which action do you want?" first, which is the opposite of an agent.
- **Tool selection is what the model is good at.** With the four tools loaded and `toolChoice: 'auto'`, the model picks between create / update / delete / list based on the prompt's intent, often using `listPosts` as a lookup step before update/delete.
- **Future expansion is additive.** Adding `summarize`, `draft`, `tag`, `publishLater` is just adding more tools to the agent's toolset — no new GraphQL operations.

The result type is a **discriminated union** over `action` so the web can branch on what happened:

```graphql
type RunPostAgentResult {
  action: PostAgentAction!     # CREATED | UPDATED | DELETED | NOOP
  post: PostRef                # populated on CREATED + UPDATED
  deletedDatabaseId: Int       # populated on DELETED
  message: String!             # human-readable summary
}

enum PostAgentAction { CREATED  UPDATED  DELETED  NOOP }

type PostRef {
  databaseId: Int!
  slug: String!
  title: String!
  status: String!
}
```

`NOOP` covers "I couldn't find a matching post" or "the prompt didn't ask for anything actionable." The agent always produces some result; failures throw with stable error codes (see decision #11).

### 3. Agent uses Vercel AI SDK with native tool-calling, not LangChain + MCP

The Vercel AI SDK's `generateText({ model, tools, toolChoice, maxSteps, system, prompt })` gives a tool-calling agent loop in ~30 lines: the model decides when to call a tool, the SDK runs `tool.execute`, the result feeds back into the model, and the loop terminates when the model emits a final response (or `maxSteps` is hit). Tools are declared with `tool({ description, parameters: zod, execute })`.

This is the same shape as MCP tools — a name, a JSON-Schema-ish parameter schema, and an `execute` function — without the wire transport. When the chat copilot lands, we can either:
- Swap to LangChain + `langchain-mcp-adapters` and stand up Apollo MCP, or
- Keep Vercel AI SDK and add an MCP client via the SDK's experimental MCP integration.

Either path is a single `infrastructure/` change since the application layer depends on the `PostAgent` port.

Default chat model: **`meta/llama-3.3-70b-instruct` via NVIDIA NIM** (`build.nvidia.com`), accessed through `@ai-sdk/openai` with `baseURL: 'https://integrate.api.nvidia.com/v1'`. NVIDIA's hosted inference is OpenAI-compatible, so the existing OpenAI provider package serves both. NVIDIA's developer tier is free within generous monthly quotas — picking it as the default means a fresh clone with a free `build.nvidia.com` key works without paid API credits. Anthropic Claude (`@ai-sdk/anthropic`) and direct OpenAI remain selectable via `AI_PROVIDER`.

Tool-calling reliability ranking on the supported providers:
- `meta/llama-3.3-70b-instruct` (NVIDIA, default) — strong tool calls, free tier.
- `meta/llama-3.1-405b-instruct` (NVIDIA) — strongest free option, slower.
- `nvidia/llama-3.1-nemotron-70b-instruct` (NVIDIA) — strong, NVIDIA's own RLHF.
- `claude-haiku-4-5` (Anthropic) — strongest overall, paid.
- `gpt-4o-mini` (OpenAI) — strong, paid.
- Smaller Llama 8B / Mistral 7B variants are unreliable for tool-calling and are not recommended.

### 4. Tools call the **gateway**, not WPGraphQL

Each tool's `execute` POSTs to `${GATEWAY_URL:-http://localhost:3000/graphql}` with the calling user's session cookie. The gateway routes to the WP `posts` subgraph as part of the federated supergraph. This preserves the user's "gateway is our backend" principle: any future tool we add (subscribers, tags, etc.) goes through the same single endpoint with the same auth contract.

Concrete tool shapes (parameters validated by zod):

```ts
createPost(title, content)                              → { databaseId, slug, title, status }
updatePost(databaseId, title?, content?)                → { databaseId, slug, title, status }
deletePost(databaseId)                                  → { deletedDatabaseId, deleted: true }
listPosts(first = 20, after? = null)                    → { edges: [{ databaseId, slug, title, excerpt }], hasNextPage, endCursor }
```

`listPosts` returns `databaseId` so the agent can hand it to `updatePost` or `deletePost`. It does NOT return `content` to keep token usage low — if the agent needs the body of a post (rare for v1), it can call `listPosts` first then `updatePost` with `content`.

Rejected alternative: tool calls WPGraphQL at `${WP_GRAPHQL_URL}` directly with the `desafio-svc` JWT. Faster (one less hop), but bypasses the gateway, loses the user's identity, creates a second auth contract for tools to learn, and would attribute every action to the service account.

### 5. Cookie-forwarding for authorship and authorization

The ai-subgraph guard captures the raw `cookie` header from the request and attaches it to `GqlContext.sessionCookie`. The handler passes it into the agent; the agent passes it into each tool's `execute` (built per-request); the tool sets it on the outgoing gateway request. The gateway's existing cookie-forwarding `RemoteGraphQLDataSource` then carries it to the `posts` subgraph (WP). WordPress sees the user's session, so:

- `createPost` attributes the new post to the user (and `Post.appUser` resolves correctly via the existing `wp_user_id` mapping).
- `updatePost` and `deletePost` are subject to WordPress's standard authorization (a user can typically edit their own posts; admins can edit any).

This means there's no special author-pinning code: the cookie path does it for free, the same way it would if the user opened WP admin and clicked the action.

### 6. `libs/ai` follows DDD layering inside one lib (not split)

```
libs/ai/
├── src/
│   ├── index.ts                                      (public exports: AiModule, command, port, errors, result types)
│   └── lib/
│       ├── domain/
│       │   ├── post-agent-result.ts                  (PostAgentResult discriminated union + PostRef)
│       │   └── post-agent.ts                         (port: PostAgent.run(input): Promise<PostAgentResult>)
│       ├── infrastructure/
│       │   ├── chat-model.factory.ts                 (AI_PROVIDER → ai SDK LanguageModel)
│       │   ├── tools/
│       │   │   ├── create-post.tool.ts
│       │   │   ├── update-post.tool.ts
│       │   │   ├── delete-post.tool.ts
│       │   │   ├── list-posts.tool.ts
│       │   │   └── gateway-fetch.ts                  (shared: builds the fetch with cookie)
│       │   └── vercel-ai-post-agent.ts               (PostAgent impl)
│       ├── application/
│       │   ├── run-post-agent.command.ts             (CQRS Command: prompt + userId + sessionCookie)
│       │   └── run-post-agent.handler.ts             (CommandHandler dispatching the port)
│       ├── errors.ts                                 (typed error classes mapped to GraphQL codes)
│       └── ai.module.ts                              (Nest Module wiring port + handler)
```

The handler depends on the **port** (DI token), not the Vercel AI SDK adapter.

Rejected alternative: split into three sibling libs (`@desafio/ai-domain`, `@desafio/ai-application`, `@desafio/ai-infrastructure`). The AI surface is small enough that one lib with internal layering is cleaner. We can split when the chat copilot doubles the scope.

### 7. Auth: `BetterAuthGuard` on the resolver + cookie-passthrough to the agent

The ai-subgraph adds a NestJS guard:

```ts
const session = await this.betterAuth.api.getSession({ headers: request.headers });
if (!session) throw new UnauthorizedException();
ctx.userId = session.user.id;
ctx.sessionCookie = request.headers['cookie'] ?? '';
```

`userId` and the **raw session cookie** land on `GqlContext`. The handler passes both into the agent. Each tool reads `sessionCookie` from its closure scope (built per-request) and sets it on the gateway request.

### 8. Subgraph schema is schema-first (matches `users-subgraph` pattern)

```graphql
extend schema
  @link(url: "https://specs.apollo.dev/federation/v2.7", import: ["@key"])

type Mutation {
  runPostAgent(input: RunPostAgentInput!): RunPostAgentResult!
}

input RunPostAgentInput {
  prompt: String!
}

type RunPostAgentResult {
  action: PostAgentAction!
  post: PostRef
  deletedDatabaseId: Int
  message: String!
}

enum PostAgentAction {
  CREATED
  UPDATED
  DELETED
  NOOP
}

type PostRef {
  databaseId: Int!
  slug: String!
  title: String!
  status: String!
}
```

`PostRef` is intentionally a small **non-federated** type — not an `extend type Post`. Returning the federated `Post` would force the ai-subgraph to declare `extend type Post @key(fields: "databaseId")` and either contribute fields or reference WP's. Overhead for v1; the slug is enough for the web app to navigate to `/blog/<slug>` where the existing `PostDetailQuery` loads the full post.

### 9. Web UI: protected route, RHF + zod, action-based dispatch

`/(protected)/blog-copilot/page.tsx` follows the existing protected-route pattern (page-level `getSession()` + redirect, since there is no `middleware.ts` in the repo). Renders a client `<BlogCopilotForm />` organism: prompt textarea (5–500 chars, zod-validated), Apollo `useMutation`, sonner toast on error, on success branches on `result.action`:

- `CREATED` / `UPDATED` → `router.push(\`/blog/${post.slug}\`)` + success toast quoting `message`.
- `DELETED` → `router.push('/blog')` + success toast `"Post deleted: ${message}"`.
- `NOOP` → keep the user on the page, render `message` as an inline notice (e.g., "I couldn't find a post matching 'foo'"). Prompt text is preserved so the user can edit and retry.

No streaming, no progress bar — a generic "Working…" spinner during the in-flight mutation is enough. Generation typically completes in 10–25 seconds via the agent loop (more if the agent needs to `listPosts` first).

### 10. Provider configuration via env vars + a small factory

```ts
// libs/ai/src/lib/infrastructure/chat-model.factory.ts
export function createChatModel(): LanguageModel {
  const provider = process.env.AI_PROVIDER ?? 'nvidia';
  const model = process.env.AI_MODEL ?? 'meta/llama-3.3-70b-instruct';
  const apiKey = process.env.AI_API_KEY;
  const baseURL = process.env.AI_BASE_URL; // optional override
  if (!apiKey) throw new Error('AI_API_KEY is required');
  switch (provider) {
    case 'nvidia':
      return createOpenAI({
        apiKey,
        baseURL: baseURL ?? 'https://integrate.api.nvidia.com/v1',
      })(model);
    case 'openai':
      return createOpenAI({ apiKey, baseURL })(model);
    case 'anthropic':
      return createAnthropic({ apiKey })(model);
    default:
      throw new Error(`Unknown AI_PROVIDER: ${provider}`);
  }
}
```

NVIDIA NIM is OpenAI-compatible, so `@ai-sdk/openai` covers both — the only difference is the `baseURL`. `AI_BASE_URL` is an escape hatch for self-hosted vLLM, Ollama, or any other OpenAI-compatible endpoint.

Lives in `infrastructure/`, constructed once at module init.

### 11. Token usage / cost mitigation + safety on destructive ops

- `maxSteps: 6` on the agent (typically 1–3 tool calls + final response; cap allows lookup-then-action chains).
- `maxTokens: 1500` on the model output.
- `toolChoice: 'auto'` (model decides whether to call a tool; for prompts that ask for nothing actionable, the model can return a `NOOP` directly).
- Single attempt; no auto-retry on non-rate-limit errors beyond the SDK's defaults.
- Auth-required (no anonymous abuse).
- **Destructive ops are limited by WordPress authorization**, not the agent: WP rejects `updatePost`/`deletePost` for posts the user doesn't own. The tool surfaces those as `WP_PUBLISH_FAILED` and the agent returns a `NOOP` with the WP error message in `message`.
- System prompt explicitly nudges the model to **confirm via `listPosts` before destructive actions** when the prompt is ambiguous about which post.
- Logged token counts in the subgraph for ad-hoc inspection. No metrics export in v1.

### 12. Errors are surfaced as GraphQL errors with stable codes

The handler converts known failures to GraphQL errors with `extensions.code`:
- `UNAUTHENTICATED` — guard rejected
- `AI_GENERATION_FAILED` — agent run threw or terminated without a usable result
- `WP_PUBLISH_FAILED` — a tool's gateway call returned an error (used as a thrown error from `execute`; the agent typically wraps this into a `NOOP` result rather than throwing all the way up)
- `INTERNAL_ERROR` — anything else

Web maps these to user-facing strings via a small `mapAiError(err)` helper, mirroring the existing `mapAuthError` from `web-auth-ui-flows`. `NOOP` is NOT an error — it returns successfully and the form renders the message inline.

### 13. ai-subgraph is its own Nx app, mirroring `users-subgraph`

Same shape: `package.json` with rspack build target, `tsconfig.app.json`, `rspack.config.js` (with the same `pg-native` `resolve.alias` guard since `libs/auth` transitively pulls `pg`), `src/main.ts`, `src/app/app.module.ts`. Port 3002 by default. Listens on the same Express stack with `cookie-parser` so it can read the Better Auth cookie.

## Risks / Trade-offs

- **[Risk] Destructive ops on the wrong post.** The agent might delete/update a post the user didn't intend. → Mitigation: WP enforces ownership at the gateway hop (so a user can't delete others' posts unless admin). System prompt instructs the agent to call `listPosts` first when the prompt is ambiguous. Documented as a known v1 trade-off — no "undo" is provided.
- **[Risk] LLM API key in subgraph env.** The subgraph holds a paid API key; if its env is committed by mistake, costs spike. → Mitigation: `AI_API_KEY` documented in `.env.example` with a placeholder; never logged; never returned through GraphQL. Same hygiene as `WP_GRAPHQL_SERVICE_TOKEN`.
- **[Risk] Generated content can be off-brand or harmful.** No moderation in v1. → Mitigation: limited to authenticated users, tight `maxSteps` and `maxTokens`. A future change can add a moderation step before the `createPost`/`updatePost` tool call. Documented as a v1 limitation.
- **[Risk] WP `createPost` / `updatePost` / `deletePost` shape may differ from expected.** Schema introspection wasn't possible during proposal (Docker integration off). → Mitigation: first-task verification with `curl` for each operation before declaring tools. If shapes differ, design adjusts before code lands.
- **[Risk] Posts published immediately (PUBLISH) show up on the public blog feed.** Fine for one user, problematic if abused. → Mitigation: auth-gated, demo scope. A future change can flip to `DRAFT` + admin review.
- **[Risk] Agent might pick the wrong tool.** The model could call `deletePost` when the user said "remove the second paragraph" (which would be an `updatePost`). → Mitigation: precise tool descriptions ("deletePost permanently removes a post"; "updatePost changes the title or content of an existing post"); system prompt with examples of intent → tool mapping; `maxSteps: 6` to allow corrections.
- **[Trade-off] Sync mutation can stall the user for ~25s.** No streaming feedback. → Acceptable for v1; the spinner + button-disabled state communicates "working." Streaming is a follow-up tied to the chat copilot.
- **[Trade-off] One subgraph for one mutation feels heavy.** Adds an Nx app, a port, a deployment unit. → Acceptable: cleanly seats future AI mutations and avoids polluting `users-subgraph`.
- **[Trade-off] Vercel AI SDK now, MCP later.** We're consciously trading the brief's eventual MCP target for a smaller v1 footprint (no extra app, no LangChain). The port-based DDD layout makes the swap cheap when we get there.
- **[Trade-off] No `ai-domain`/`ai-application`/`ai-infrastructure` split.** → Single `libs/ai` with internal layering is cheaper for a small surface. Splitting becomes worth it when the chat copilot lands.
