## ADDED Requirements

### Requirement: Federated mutation `runPostAgent` accepts a prompt and returns a discriminated result

The federated supergraph SHALL expose `Mutation.runPostAgent(input: RunPostAgentInput!): RunPostAgentResult!`, contributed by a new `ai-subgraph` (`apps/ai-subgraph`). The mutation accepts a single `prompt: String!` field and returns a `RunPostAgentResult` whose `action: PostAgentAction!` field is one of `CREATED`, `UPDATED`, `DELETED`, or `NOOP`. When the action is `CREATED` or `UPDATED`, `post: PostRef` is populated with `databaseId`, `slug`, `title`, and `status`. When the action is `DELETED`, `deletedDatabaseId: Int` is populated. The `message: String!` field is always populated with a short human-readable summary suitable for display.

#### Scenario: Authenticated client creates a post via the agent
- **WHEN** an authenticated client sends `mutation { runPostAgent(input: { prompt: "Write a short post about cursor pagination" }) { action post { databaseId slug title status } message } }` to the gateway
- **THEN** the gateway routes the operation to `ai-subgraph`; the subgraph dispatches `RunPostAgentCommand`; the command handler invokes the `PostAgent`; the agent calls the `createPost` tool; and the response is `{ action: "CREATED", post: { databaseId: <int>, slug: <string>, title: <string>, status: "publish" }, deletedDatabaseId: null, message: <string> }`
- **AND** the new post becomes immediately visible in `query { posts(first: 1) { edges { node { id title } } } }`

#### Scenario: Agent updates an existing post by title
- **WHEN** an authenticated client sends `mutation { runPostAgent(input: { prompt: "Add a closing paragraph to the post titled 'My intro to GraphQL'" }) { action post { databaseId slug } message } }`
- **THEN** the agent calls `listPosts` to find the matching post by title, calls `updatePost` with the matched `databaseId` and the new content, and the response is `{ action: "UPDATED", post: { databaseId: <int>, slug: <string>, ... }, deletedDatabaseId: null, message: <string> }`
- **AND** subsequent `query { post(id: "<slug>", idType: SLUG) { content } }` returns the updated content

#### Scenario: Agent deletes a post by title
- **WHEN** an authenticated client sends `mutation { runPostAgent(input: { prompt: "Delete the post titled 'Test post'" }) { action deletedDatabaseId message } }`
- **THEN** the agent calls `listPosts` to identify the post, calls `deletePost(databaseId: N)`, and the response is `{ action: "DELETED", post: null, deletedDatabaseId: N, message: <string> }`
- **AND** the deleted post no longer appears in `query { posts(first: 50) { edges { node { databaseId } } } }`

#### Scenario: Agent returns NOOP when no matching post is found
- **WHEN** an authenticated client sends `mutation { runPostAgent(input: { prompt: "Delete the post about quantum computing" }) { action message } }` and no post matches
- **THEN** the response is `{ action: "NOOP", post: null, deletedDatabaseId: null, message: <string explaining nothing matched> }`
- **AND** no destructive WP call is made

#### Scenario: Mutation result type is non-federated for v1
- **WHEN** the supergraph SDL is introspected
- **THEN** `RunPostAgentResult` and `PostRef` are plain object types, NOT `extend type Post`
- **AND** the resolver does not declare a federation key on the result

### Requirement: Mutation requires an authenticated Better Auth session

The `runPostAgent` mutation SHALL reject any request that does not carry a valid Better Auth session cookie. The check happens in the `ai-subgraph` via a NestJS guard that calls `BetterAuth.api.getSession({ headers })`; if `getSession` returns null or throws, the resolver MUST NOT execute the agent or any tool call.

#### Scenario: Anonymous client is rejected with a stable error code
- **WHEN** a client without a `better-auth.session_token` cookie sends `mutation { runPostAgent(input: { prompt: "..." }) { action message } }`
- **THEN** the response contains a GraphQL error with `extensions.code = "UNAUTHENTICATED"`
- **AND** no LLM API call is made
- **AND** no tool is invoked

#### Scenario: Expired session is rejected
- **WHEN** a client with an expired session token submits the mutation
- **THEN** the same `UNAUTHENTICATED` error is returned with no side effects

### Requirement: Agent has exactly four tools, all routed through the federated gateway

The `PostAgent` infrastructure SHALL expose **exactly** four Vercel AI SDK tools to the model: `createPost`, `updatePost`, `deletePost`, and `listPosts`. Each tool's `execute` SHALL POST a single GraphQL operation to `${GATEWAY_URL:-http://localhost:3000/graphql}`, NOT directly to WPGraphQL. Tool parameters SHALL be validated with zod. No other tools (no `me`, no `post`, no `searchPosts`) are loaded in v1.

#### Scenario: Tools call the gateway, not WPGraphQL
- **WHEN** the agent invokes any of the four tools during a request
- **THEN** the outgoing HTTP request goes to the value of `GATEWAY_URL` (the federated gateway), NOT to `WP_GRAPHQL_URL`
- **AND** the request includes the calling user's session cookie on the `cookie` header

#### Scenario: Tool parameter validation
- **WHEN** the model calls `createPost` with `title` as an empty string
- **THEN** the tool's zod parameters reject the call before any HTTP request is made
- **AND** the error is fed back into the agent loop so the model can correct its arguments

#### Scenario: Disallowed tool surface
- **WHEN** the agent is initialized
- **THEN** the `tools` map passed to `generateText` contains exactly the keys `createPost`, `updatePost`, `deletePost`, `listPosts` and no others

### Requirement: Tools forward the calling user's session cookie

When the `BetterAuthGuard` validates the request, the raw session cookie SHALL be propagated through `GqlContext` to the `RunPostAgentCommand` handler and on into the agent. Each tool's `execute` SHALL include that cookie on its outgoing gateway request, so the gateway forwards it to the WP `posts` subgraph and WordPress sees the user's session for every action. The result is that `createPost` attributes the new post to the caller (and `Post.appUser` resolves correctly via the existing `wp_user_id` mapping), and `updatePost`/`deletePost` are subject to WordPress's standard ownership authorization.

#### Scenario: Mapped user creates a post with correct authorship
- **WHEN** a Better Auth user with `wp_user_id = 1` triggers a `CREATED` action
- **THEN** the eventual WP `createPost` runs with the user's session
- **AND** the new post's `Post.author.node.databaseId` equals `1`
- **AND** querying `Post.appUser` on the new post returns that Better Auth user

#### Scenario: Update is denied for another user's post
- **WHEN** a non-admin Better Auth user prompts the agent to update a post owned by someone else
- **THEN** the gateway forwards the request to WP, WP denies the update with an authorization error
- **THEN** the tool throws `WP_PUBLISH_FAILED`, the agent surfaces the failure as a `NOOP` result with a `message` quoting WP's error, and the post is unchanged

### Requirement: AI provider, model, and credentials are configured via environment

The `ai-subgraph` SHALL read its LLM configuration from environment variables: `AI_PROVIDER` (one of `"nvidia"`, `"openai"`, `"anthropic"`), `AI_MODEL` (e.g., `"meta/llama-3.3-70b-instruct"`, `"gpt-4o-mini"`, `"claude-haiku-4-5"`), `AI_API_KEY` (provider credential), and an optional `AI_BASE_URL` for OpenAI-compatible endpoint overrides. A factory function in `libs/ai`'s infrastructure layer SHALL select the Vercel AI SDK provider package at module init based on `AI_PROVIDER` and SHALL throw a startup error if `AI_API_KEY` is missing or `AI_PROVIDER` is unknown. The factory SHALL treat `nvidia` as `@ai-sdk/openai` with `baseURL = 'https://integrate.api.nvidia.com/v1'`. The API key MUST NOT appear in any GraphQL response or log output.

#### Scenario: Default config selects NVIDIA Llama (free tier)
- **WHEN** `AI_PROVIDER` is unset and `AI_MODEL` is unset
- **THEN** the factory selects the `@ai-sdk/openai` provider configured with `baseURL = 'https://integrate.api.nvidia.com/v1'` and model `meta/llama-3.3-70b-instruct`
- **AND** the only credential needed is a `build.nvidia.com` API key in `AI_API_KEY`

#### Scenario: Provider switch to Anthropic via env var
- **WHEN** `AI_PROVIDER=anthropic`, `AI_MODEL=claude-haiku-4-5`, and `AI_API_KEY=<anthropic-key>` are set
- **THEN** the factory selects the `@ai-sdk/anthropic` provider with the configured model on subgraph startup
- **AND** no source code change is required

#### Scenario: Provider switch to plain OpenAI via env var
- **WHEN** `AI_PROVIDER=openai`, `AI_MODEL=gpt-4o-mini`, and `AI_API_KEY=<openai-key>` are set, with `AI_BASE_URL` unset
- **THEN** the factory selects the `@ai-sdk/openai` provider with the default OpenAI endpoint and the configured model
- **AND** no source code change is required

#### Scenario: OpenAI-compatible endpoint override
- **WHEN** `AI_PROVIDER=openai` and `AI_BASE_URL=http://localhost:11434/v1` are set (e.g., a local Ollama instance)
- **THEN** the factory selects `@ai-sdk/openai` with that `baseURL`

#### Scenario: Missing API key fails fast
- **WHEN** `AI_API_KEY` is not set at startup
- **THEN** the subgraph fails to initialize with a clear error message naming the missing variable

#### Scenario: Unknown provider fails fast
- **WHEN** `AI_PROVIDER=foobar` is set
- **THEN** the subgraph fails to initialize with a clear error message naming the unknown provider

### Requirement: Agent logic lives in `libs/ai` with DDD layering

The agent's logic SHALL live in `libs/ai/` organized into `domain/`, `infrastructure/`, and `application/` subdirectories. The `domain/` layer SHALL declare a `PostAgent` port interface (`run({ prompt, userId, sessionCookie }): Promise<PostAgentResult>`) and the `PostAgentResult` discriminated union. The `application/` layer SHALL declare a `RunPostAgentCommand` (with `prompt`, `userId`, and `sessionCookie` fields) and its CQRS `CommandHandler` that depends on the port via DI. The `infrastructure/` layer SHALL provide the `VercelAiPostAgent` adapter, the four tools, and the chat-model factory. The `ai-subgraph` resolver MUST NOT import the Vercel AI SDK or any provider package directly — it MUST dispatch the `RunPostAgentCommand` through `CommandBus`.

#### Scenario: Resolver dispatches via CommandBus
- **WHEN** the `runPostAgent` resolver runs
- **THEN** its body MUST construct a `RunPostAgentCommand` and call `commandBus.execute(...)` and MUST NOT contain calls to `generateText`, `tool(...)`, or any provider-package import

#### Scenario: Agent is swappable via the port
- **WHEN** a future test or implementation provides an alternative `PostAgent` to the DI container (e.g., a LangChain + MCP variant)
- **THEN** the `RunPostAgentCommandHandler` MUST work without modification, using the new agent

### Requirement: Web app exposes an authenticated copilot prompt page

The web app SHALL expose `/blog-copilot` under the `(protected)` route group. The page SHALL render a client form with a single multi-line prompt field validated by zod (5 to 500 characters), a Send submit button, and a typed Apollo `useMutation(RUN_POST_AGENT_MUTATION)` call. On success the page SHALL branch on `result.action`:

- `CREATED` or `UPDATED` → `router.push("/blog/<post.slug>")` and a sonner success toast quoting `result.message`.
- `DELETED` → `router.push("/blog")` and a sonner success toast `"Post deleted"` (with the message as the description).
- `NOOP` → stay on the page and render `result.message` as an inline notice; preserve the prompt text so the user can edit and retry.

On error the form SHALL display a user-readable message derived from the GraphQL error's `extensions.code` (mirroring the existing `mapAuthError` helper from the auth flow).

#### Scenario: Successful create redirects to the new post
- **WHEN** an authenticated user submits a valid prompt and the mutation succeeds with `action: "CREATED"` and `post.slug = "my-new-post"`
- **THEN** the page navigates to `/blog/my-new-post` and a sonner success toast shows the agent's `message`

#### Scenario: Successful delete redirects to the index
- **WHEN** the mutation succeeds with `action: "DELETED"` and `deletedDatabaseId = 42`
- **THEN** the page navigates to `/blog` and a sonner toast surfaces `"Post deleted"`

#### Scenario: NOOP keeps the user on the page
- **WHEN** the mutation succeeds with `action: "NOOP"` and a `message` like `"I couldn't find a post matching 'foo'"`
- **THEN** the page does NOT navigate
- **AND** the `message` renders inline as a notice
- **AND** the prompt textarea retains its previous value

#### Scenario: Empty prompt is rejected client-side
- **WHEN** the prompt field is empty (or under 5 chars) at submit time
- **THEN** the zod resolver attaches an inline error and the form does NOT call the mutation

#### Scenario: Anonymous visitor is redirected to sign-in
- **WHEN** a visitor without a session navigates to `/blog-copilot`
- **THEN** they are redirected to `/sign-in?next=%2Fblog-copilot` (the existing protected-route pattern: page-level `getSession()` + `redirect()`)

#### Scenario: Generation error is surfaced inline
- **WHEN** the mutation rejects with `extensions.code = "AI_GENERATION_FAILED"` (or any other agent-side error code)
- **THEN** the form shows a user-readable message (e.g., "We couldn't run the copilot. Please try again.") without navigating away
- **AND** the prompt text is preserved so the user can retry or edit

### Requirement: Gateway composes `ai-subgraph` alongside `users` and `posts`

The gateway's `IntrospectAndCompose` configuration in `apps/gateway/src/app/app.module.ts` SHALL include an `ai` subgraph entry pointing at `process.env.AI_SUBGRAPH_URL ?? 'http://localhost:3002/graphql'`. No other gateway code change is required; the existing cookie-forwarding `RemoteGraphQLDataSource` SHALL forward Better Auth cookies to the ai-subgraph automatically.

#### Scenario: Gateway composes the ai subgraph at startup
- **WHEN** the gateway starts and `ai-subgraph`, `users-subgraph`, and `posts` (WP) are all reachable
- **THEN** the gateway logs successful schema composition and the federated supergraph contains `Mutation.runPostAgent`

#### Scenario: Cookies are forwarded to ai-subgraph
- **WHEN** an authenticated client calls `runPostAgent` through the gateway
- **THEN** the outgoing HTTP request from the gateway to `ai-subgraph` carries the `cookie` header verbatim, enabling the subgraph's `BetterAuthGuard` to read the session
