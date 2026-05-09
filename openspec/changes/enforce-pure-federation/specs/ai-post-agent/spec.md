## REMOVED Requirements

### Requirement: Federated mutation `runPostAgent` accepts a prompt and returns a discriminated result

**Reason**: The challenge constrains our subgraphs to a single custom resolver (`Query.me`); a custom `Mutation.runPostAgent` violates that rule. The agent's user-facing behavior is preserved via a Next.js Route Handler at `POST /api/blog-copilot/run` (see the `web-blog-copilot` capability), which dispatches the same `RunPostAgentCommand` through the same CQRS handler. The federated supergraph no longer surfaces `Mutation.runPostAgent`, `RunPostAgentInput`, `RunPostAgentResult`, `PostAgentAction`, or `PostRef`.

**Migration**: Clients that previously sent `mutation { runPostAgent(input: { prompt: "..." }) { ... } }` to `/graphql` SHALL POST the same prompt to `/api/blog-copilot/run` instead. The response body shape is identical to the previous mutation's `RunPostAgentResult` (same `action`/`post`/`deletedDatabaseId`/`message` fields), only the transport changes.

### Requirement: Mutation requires an authenticated Better Auth session

**Reason**: Replaced by an equivalent server-side check in the Next.js Route Handler. The handler reads `getSession()` and rejects unauthenticated requests with HTTP 401 before invoking the agent. See the `web-blog-copilot` capability.

**Migration**: No client-facing change — unauthenticated requests still fail without invoking the LLM or any tool. Only the failure transport differs (HTTP 401 with `{ error: { code: "UNAUTHENTICATED" } }` instead of a GraphQL error).

### Requirement: Gateway composes `ai-subgraph` alongside `users` and `posts`

**Reason**: The `ai-subgraph` is removed entirely. The gateway's `IntrospectAndCompose.subgraphs` no longer includes the `ai` entry.

**Migration**: Operators MUST stop running the `ai-subgraph` process and remove its `AI_SUBGRAPH_URL` env entry. The gateway will refuse to start if asked to compose a non-existent subgraph, so a stale config is fail-fast rather than silent.

### Requirement: Web app exposes an authenticated copilot prompt page

**Reason**: The page-level requirement is reframed under the new `web-blog-copilot` capability, which owns the route handler, the form's HTTP-based submit flow, and the protected-route page. The user-facing UX (single multi-line prompt with 5–500 char zod validation, sonner toasts, slug-based redirects on CREATED/UPDATED, redirect to `/blog` on DELETED, NOOP renders inline) is preserved verbatim — only the transport changes from `useMutation(RUN_POST_AGENT_MUTATION)` to `fetch('/api/blog-copilot/run')`.

**Migration**: The previous `RunPostAgentMutation` Apollo operation is removed from web's GraphQL operations and from generated codegen; the form's submit handler swaps the mutation call for a `fetch` to the route handler. End-user behavior is identical.

## MODIFIED Requirements

### Requirement: Agent has exactly four tools, all routed through the federated gateway

The `PostAgent` infrastructure SHALL expose **exactly** four tools to the model: `createPost`, `updatePost`, `deletePost`, and `listPosts`. The tools SHALL be discovered via the Apollo MCP server (`apps/mcp-server`), which derives them from the federated supergraph and exposes them over the MCP HTTP+SSE transport. The agent SHALL connect to the MCP server using `@langchain/mcp-adapters` and bind the four tools to the LangChain agent loop. Each tool's `execute` SHALL ultimately POST a single GraphQL operation to `${GATEWAY_URL:-http://localhost:3000/graphql}` via the MCP server, NOT directly to WPGraphQL. No other tools (no `me`, no `post`, no `searchPosts`) are loaded in v1.

#### Scenario: Tools call the gateway through MCP, not WPGraphQL
- **WHEN** the agent invokes any of the four tools during a request
- **THEN** the LangChain agent calls the MCP server's `tools/call`; the MCP server issues a GraphQL operation to `GATEWAY_URL`; the outgoing HTTP request goes to the federated gateway, NOT to `WP_GRAPHQL_URL`
- **AND** the request includes the calling user's session cookie on the `cookie` header AND the WP service-account bearer on `authorization` header

#### Scenario: Tool input validation
- **WHEN** the model calls `createPost` with `title` as an empty string
- **THEN** the MCP server's input-schema validation (derived from the GraphQL operation) rejects the call before any HTTP request is made
- **AND** the error is fed back into the agent loop so the model can correct its arguments

#### Scenario: Disallowed tool surface
- **WHEN** the agent is initialized
- **THEN** the LangChain `tools` array bound to the model contains exactly the entries `createPost`, `updatePost`, `deletePost`, `listPosts` and no others (this is enforced in `apps/mcp-server`'s tool registration, not by filtering on the client)

### Requirement: Tools forward the calling user's session cookie

When the route handler validates the request, the raw session cookie SHALL be propagated through `RunPostAgentCommand` to the `LangChainMcpPostAgent` adapter and bound to each MCP tool invocation as the `cookie` HTTP header on the MCP HTTP+SSE call. The MCP server SHALL forward that header verbatim on its outgoing gateway request, so WordPress sees the user's session for every action. Authorship is preserved exactly as in the previous architecture: `createPost` attributes the new post to the caller (and `Post.appUser` resolves correctly via the existing `wp_user_id` mapping); `updatePost`/`deletePost` are subject to WordPress's standard ownership authorization.

#### Scenario: Mapped user creates a post with correct authorship
- **WHEN** a Better Auth user with `wp_user_id = 1` triggers a `CREATED` action via the route handler
- **THEN** the eventual WP `createPost` runs with the user's session
- **AND** the new post's `Post.author.node.databaseId` equals `1`
- **AND** querying `Post.author.user.appUser` (the new federation path) on the new post returns that Better Auth user

#### Scenario: Update is denied for another user's post
- **WHEN** a non-admin Better Auth user prompts the agent to update a post owned by someone else
- **THEN** the MCP server forwards the request to the gateway, the gateway forwards to WP, WP denies the update with an authorization error
- **THEN** the tool result surfaces the failure as a `WpPublishFailedError`; the agent maps it to a `NOOP` result with a `message` quoting WP's error; the post is unchanged

### Requirement: AI provider, model, and credentials are configured via environment

The route handler (and the underlying `LangChainMcpPostAgent` adapter) SHALL read its LLM configuration from environment variables: `AI_PROVIDER` (one of `"nvidia"`, `"openai"`, `"anthropic"`), `AI_MODEL` (e.g., `"meta/llama-3.3-70b-instruct"`, `"gpt-4o-mini"`, `"claude-haiku-4-5"`), `AI_API_KEY` (provider credential), and an optional `AI_BASE_URL` for OpenAI-compatible endpoint overrides. A factory function in `libs/ai`'s infrastructure layer SHALL select the LangChain chat-model class at module init based on `AI_PROVIDER` and SHALL throw a startup error if `AI_API_KEY` is missing or `AI_PROVIDER` is unknown. The factory SHALL treat `nvidia` as `ChatOpenAI` with `configuration.baseURL = 'https://integrate.api.nvidia.com/v1'`. The API key MUST NOT appear in any HTTP response or log output.

#### Scenario: Default config selects NVIDIA Llama (free tier)
- **WHEN** `AI_PROVIDER` is unset and `AI_MODEL` is unset
- **THEN** the factory returns a `ChatOpenAI` instance configured with `configuration.baseURL = 'https://integrate.api.nvidia.com/v1'` and model `meta/llama-3.3-70b-instruct`
- **AND** the only credential needed is a `build.nvidia.com` API key in `AI_API_KEY`

#### Scenario: Provider switch to Anthropic via env var
- **WHEN** `AI_PROVIDER=anthropic`, `AI_MODEL=claude-haiku-4-5`, and `AI_API_KEY=<anthropic-key>` are set
- **THEN** the factory returns a `ChatAnthropic` instance with the configured model on app startup
- **AND** no source code change is required

#### Scenario: Provider switch to plain OpenAI via env var
- **WHEN** `AI_PROVIDER=openai`, `AI_MODEL=gpt-4o-mini`, and `AI_API_KEY=<openai-key>` are set, with `AI_BASE_URL` unset
- **THEN** the factory returns a `ChatOpenAI` instance with the default OpenAI endpoint and the configured model
- **AND** no source code change is required

#### Scenario: OpenAI-compatible endpoint override
- **WHEN** `AI_PROVIDER=openai` and `AI_BASE_URL=http://localhost:11434/v1` are set (e.g., a local Ollama instance)
- **THEN** the factory returns `ChatOpenAI` with that `baseURL`

#### Scenario: Missing API key fails fast
- **WHEN** `AI_API_KEY` is not set at app startup
- **THEN** the app fails to initialize with a clear error message naming the missing variable

#### Scenario: Unknown provider fails fast
- **WHEN** `AI_PROVIDER=foobar` is set
- **THEN** the app fails to initialize with a clear error message naming the unknown provider

### Requirement: Agent logic lives in `libs/ai` with DDD layering

The agent's logic SHALL live in `libs/ai/` organized into `domain/`, `infrastructure/`, and `application/` subdirectories. The `domain/` layer SHALL declare a `PostAgent` port interface (`run({ prompt, userId, sessionCookie }): Promise<PostAgentResult>`) and the `PostAgentResult` discriminated union. The `application/` layer SHALL declare a `RunPostAgentCommand` (with `prompt`, `userId`, and `sessionCookie` fields) and its CQRS `CommandHandler` that depends on the port via DI. The `infrastructure/` layer SHALL provide the `LangChainMcpPostAgent` adapter and the LangChain chat-model factory. The route handler MUST NOT import LangChain or any provider package directly — it MUST dispatch the `RunPostAgentCommand` through `CommandBus`.

#### Scenario: Route handler dispatches via CommandBus
- **WHEN** the `/api/blog-copilot/run` route handler runs
- **THEN** its body MUST construct a `RunPostAgentCommand` and call `commandBus.execute(...)` and MUST NOT contain calls to LangChain `createReactAgent`, `ChatOpenAI`, MCP-adapter constructors, or any provider-package import

#### Scenario: Agent is swappable via the port
- **WHEN** a future test or implementation provides an alternative `PostAgent` to the DI container
- **THEN** the `RunPostAgentCommandHandler` MUST work without modification, using the new agent
