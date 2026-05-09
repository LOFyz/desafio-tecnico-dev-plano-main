## 1. Verify WP CRUD operation shapes

- [x] 1.1 **DEFERRED to smoke (task 7).** Docker WSL integration was off at apply time; the standard WPGraphQL contract is assumed: `createPost(input: CreatePostInput!) { post { databaseId slug title status } }`, `updatePost(input: { id: ID!, title?, content?, status? }) { post { databaseId slug title status } }`, `deletePost(input: { id: ID!, forceDelete: true }) { deletedId, post { databaseId } }`, where `id` is the Relay global ID = `base64("post:<databaseId>")`. WP shape mismatches will surface in task 7 and be patched against the same tool files.
- [x] 1.2 Captured the assumed mutation/query strings inline in each tool file under `libs/ai/src/lib/infrastructure/tools/`. Reviewed against the [WPGraphQL docs](https://www.wpgraphql.com/docs/posts-and-pages#create-post-mutation) for shape; ID format confirmed via the existing `Post.id = "cG9zdDoxNg=="` we observed in earlier smokes (decodes to `post:16`).

## 2. New lib `libs/ai`: domain + application + infrastructure

- [x] 2.1 Create `libs/ai/package.json` with deps `ai` (Vercel AI SDK), `@ai-sdk/openai` (default + NVIDIA via baseURL override), `@ai-sdk/anthropic` (optional provider), `zod`, `@nestjs/cqrs`, `@nestjs/common`. Set up `tsconfig.lib.json` with `experimentalDecorators` + `emitDecoratorMetadata` (mirrors `libs/users/application`).
- [x] 2.2 Create `libs/ai/src/lib/domain/post-agent-result.ts` exporting the `PostAgentResult` discriminated union (`{ action: 'CREATED' | 'UPDATED', post: PostRef, message }`, `{ action: 'DELETED', deletedDatabaseId: number, message }`, `{ action: 'NOOP', message }`) and the `PostRef` type.
- [x] 2.3 Create `libs/ai/src/lib/domain/post-agent.ts` exporting the `PostAgent` port interface with `run({ prompt, userId, sessionCookie }): Promise<PostAgentResult>` and a DI token `POST_AGENT`.
- [x] 2.4 Create `libs/ai/src/lib/infrastructure/chat-model.factory.ts` exporting `createChatModel(): LanguageModel`. Branches on `AI_PROVIDER` (default `nvidia`): `nvidia` → `createOpenAI({ apiKey, baseURL: process.env.AI_BASE_URL ?? 'https://integrate.api.nvidia.com/v1' })(model)`; `openai` → `createOpenAI({ apiKey, baseURL: process.env.AI_BASE_URL })(model)`; `anthropic` → `createAnthropic({ apiKey })(model)`. Default `AI_MODEL = 'meta/llama-3.3-70b-instruct'`. Throws clearly on missing `AI_API_KEY` or unknown provider.
- [x] 2.5 Create `libs/ai/src/lib/infrastructure/tools/gateway-fetch.ts` exporting `gatewayFetch(...)` that POSTs to `process.env.GATEWAY_URL ?? 'http://localhost:3000/graphql'` with cookie header set; throws `WpPublishFailedError` on non-2xx, `data.errors`, or null data. Also exports `postGlobalId(databaseId)` = `base64("post:" + databaseId)` for `updatePost`/`deletePost`.
- [x] 2.6 Create `libs/ai/src/lib/infrastructure/tools/create-post.tool.ts` — Vercel AI SDK `tool({ description, inputSchema: zod, execute })` (v6 renamed `parameters` → `inputSchema`); `inputSchema = { title, content }`; `execute` calls `gatewayFetch(CREATE_POST_MUTATION, { input: { title, content, status: 'PUBLISH' } }, sessionCookie)` and returns `{ databaseId, slug, title, status }`.
- [x] 2.7 Create `libs/ai/src/lib/infrastructure/tools/update-post.tool.ts` — `inputSchema = { databaseId: int(positive), title?: string, content?: string }`; `execute` converts `databaseId` to `postGlobalId(databaseId)` and POSTs `mutation updatePost(input: { id, title?, content? })`. Throws if both `title` and `content` are absent.
- [x] 2.8 Create `libs/ai/src/lib/infrastructure/tools/delete-post.tool.ts` — `inputSchema = { databaseId: int(positive) }`; `execute` POSTs `mutation deletePost(input: { id: postGlobalId(databaseId), forceDelete: true })`. Returns `{ deletedDatabaseId, deleted: true }`.
- [x] 2.9 Create `libs/ai/src/lib/infrastructure/tools/list-posts.tool.ts` — `inputSchema = { first: int(default 20, max 50), after?: string|null }`; `execute` issues `query posts(first, after) { edges { cursor node { databaseId slug title excerpt } } pageInfo { endCursor hasNextPage } }`. Does NOT request `content`.
- [x] 2.10 Create `libs/ai/src/lib/infrastructure/vercel-ai-post-agent.ts` implementing `PostAgent`. Builds four tools per-call (closing over `sessionCookie`), runs `generateText({ model: createChatModel(), tools, toolChoice: 'auto', stopWhen: stepCountIs(6), system, prompt })` (v6 uses `stopWhen: stepCountIs(N)` instead of `maxSteps: N`). After the run, walks `result.steps[].toolResults[]` for the last successful tool result, maps it into a `PostAgentResult`. If no tool produced a final action (e.g., the model only called `listPosts` and stopped), returns `{ action: 'NOOP', message }`.
- [x] 2.11 Create `libs/ai/src/lib/application/run-post-agent.command.ts` with `RunPostAgentCommand(prompt, userId, sessionCookie)`.
- [x] 2.12 Create `libs/ai/src/lib/application/run-post-agent.handler.ts` (`@CommandHandler`) injecting `POST_AGENT` port. Catches `WpPublishFailedError` from the agent and surfaces as `{ action: 'NOOP', message }` so the user sees the WP error inline; rethrows `AiGenerationFailedError` and wraps unknowns as `AiGenerationFailedError`.
- [x] 2.13 Create `libs/ai/src/lib/errors.ts` with `AiGenerationFailedError` (code `AI_GENERATION_FAILED`) and `WpPublishFailedError` (code `WP_PUBLISH_FAILED`).
- [x] 2.14 Update `libs/ai/src/lib/ai.module.ts` (replace stub `DesafioAiModule`) — provides `{ provide: POST_AGENT, useClass: VercelAiPostAgent }` and `RunPostAgentHandler`; imports `CqrsModule`; exports both.
- [x] 2.15 Export public surface from `libs/ai/src/index.ts`: `AiModule`, `RunPostAgentCommand`, `RunPostAgentHandler`, `POST_AGENT`, types `PostAgent`/`PostAgentInput`/`PostAgentResult`/`PostRef`, error classes.
- [x] 2.16 `pnpm nx typecheck @desafio/ai` succeeds (lib has no `build` target — it's a TS-source-only lib consumed directly by apps via pnpm workspace; `typecheck` is the equivalent gate).

## 3. New app `apps/ai-subgraph`: federated Mutation + auth guard

- [x] 3.1 Scaffold `apps/ai-subgraph/` mirroring `apps/users-subgraph/`: `package.json` with rspack build target, `project.json`, `rspack.config.js` (with `pg-native` `resolve.alias = false` guard), `tsconfig.app.json`, `src/main.ts` (`NestFactory.create` + `cookie-parser` + `app.listen(process.env.PORT ?? 3002)`).
- [x] 3.2 Create `apps/ai-subgraph/src/schema.graphql` with the federation v2.7 `@link` import, `type Mutation { runPostAgent(input: RunPostAgentInput!): RunPostAgentResult! }`, `input RunPostAgentInput { prompt: String! }`, `enum PostAgentAction { CREATED UPDATED DELETED NOOP }`, `type PostRef { databaseId: Int! slug: String! title: String! status: String! }`, and `type RunPostAgentResult { action: PostAgentAction! post: PostRef deletedDatabaseId: Int message: String! }`.
- [x] 3.3 Create `apps/ai-subgraph/src/gql-context.ts` exporting `GqlContext { sessionId?, userId?, sessionCookie?, req }`.
- [x] 3.4 Create `apps/ai-subgraph/src/auth/better-auth.guard.ts`: a NestJS guard that reads the request's `cookie` header, calls `BetterAuth.api.getSession({ headers })`, attaches `userId` + raw `sessionCookie` to `GqlContext`, throws `UnauthorizedException` (mapped to `extensions.code = "UNAUTHENTICATED"`) on miss.
- [x] 3.5 Create `apps/ai-subgraph/src/ai/ai.resolver.ts` with `@Resolver('Mutation')` + `@Mutation('runPostAgent')` that uses `@UseGuards(BetterAuthGuard)`, takes `@Args('input')` and `@Context() ctx`, and dispatches `RunPostAgentCommand({ prompt: input.prompt, userId: ctx.userId, sessionCookie: ctx.sessionCookie })` via `CommandBus`. Maps the resulting `PostAgentResult` directly onto the GraphQL `RunPostAgentResult` shape. Maps thrown errors from `libs/ai` to GraphQL errors with `extensions.code` per spec (UNAUTHENTICATED, AI_GENERATION_FAILED, WP_PUBLISH_FAILED, INTERNAL_ERROR).
- [x] 3.6 Create `apps/ai-subgraph/src/ai/ai.subgraph.module.ts` that imports `CqrsModule`, `BetterAuthModule.forRootAsync`, and `AiModule` (from `libs/ai`); provides `AiResolver` + `BetterAuthGuard`.
- [x] 3.7 Create `apps/ai-subgraph/src/app/app.module.ts` wiring `GraphQLModule.forRoot<ApolloFederationDriverConfig>` (schema-first via `typePaths: ['**/*.graphql']`) + the AiSubgraphModule.
- [x] 3.8 Add `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL` (optional), `GATEWAY_URL` reads to the subgraph's config (likely a global `ConfigModule`).
- [x] 3.9 `pnpm nx build ai-subgraph` succeeds.

## 4. Gateway: register the `ai` subgraph

- [x] 4.1 Edit `apps/gateway/src/app/app.module.ts` `IntrospectAndCompose.subgraphs` to add `{ name: 'ai', url: process.env['AI_SUBGRAPH_URL'] ?? 'http://localhost:3002/graphql' }`.
- [x] 4.2 `pnpm nx build gateway` succeeds. With ai-subgraph also running, gateway boots without composition errors and a probe query returns the new mutation in the supergraph SDL.

## 5. Web: prompt form + protected route + action-based dispatch

- [x] 5.1 Create `apps/web/src/lib/ai/operations/run-post-agent.mutation.ts` exporting `RUN_POST_AGENT_MUTATION = graphql(/* GraphQL */ \`mutation RunPostAgent($input: RunPostAgentInput!) { runPostAgent(input: $input) { action post { databaseId slug title status } deletedDatabaseId message } }\`)`.
- [x] 5.2 Create `apps/web/src/lib/ai/errors.ts` exporting `mapAiError(err): string` mapping the spec's error codes (UNAUTHENTICATED, AI_GENERATION_FAILED, WP_PUBLISH_FAILED, INTERNAL_ERROR) to user-readable strings, with a generic fallback.
- [x] 5.3 Create `apps/web/src/components/organisms/ai/blog-copilot-form.tsx` (client) with RHF + zod (prompt 5–500 chars). Uses a styled native `<textarea>` (shadcn textarea primitive not yet seeded; native styled element is sufficient and avoids a lib-add hop). Submit Button with loading state ("Working…"), sonner error toast. On success, branches on `data.runPostAgent.action`: `CREATED`/`UPDATED` → `router.push(\`/blog/${post.slug}\`)` + success toast; `DELETED` → `router.push('/blog')` + success toast; `NOOP` → render `message` inline and keep prompt text.
- [x] 5.4 Create `apps/web/src/app/(protected)/blog-copilot/page.tsx` (RSC). Calls `getSession()`; on null redirects to `/sign-in?next=%2Fblog-copilot`; otherwise renders the form inside a Card with a brief intro.
- [x] 5.5 Add "Open blog copilot" link on `apps/web/src/app/(protected)/dashboard/page.tsx` and a "Copilot" link in the authenticated branch of the home page.
- [x] 5.6 `pnpm nx run web:codegen` succeeded against the federated gateway. `pnpm nx run-many -t build,lint -p ai,ai-subgraph,gateway,web` passes. **Drive-by:** discovered both subgraphs were declaring `typePaths: ['**/*.graphql']`, which globs from the workspace root and made each subgraph claim every other subgraph's schema (composition errored with "Non-shareable field … resolved from multiple subgraphs"). Scoped the glob to `apps/<name>/src/**/*.graphql` in both `users-subgraph` and `ai-subgraph` `app.module.ts`.

## 6. Env vars + docs

- [x] 6.1 Add `AI_PROVIDER` (default `nvidia`), `AI_MODEL` (default `meta/llama-3.3-70b-instruct`), `AI_API_KEY`, `AI_BASE_URL` (optional, only for OpenAI-compatible overrides), `AI_SUBGRAPH_URL`, `GATEWAY_URL` to `.env.example`. Comment each: NVIDIA key from `https://build.nvidia.com/settings/api-keys` (free tier), Anthropic key from `https://console.anthropic.com/`, OpenAI key from `https://platform.openai.com/api-keys`. Mirror in local `.env`.
- [x] 6.2 Document the local startup order somewhere readable (existing `.env.example` header is fine): WP → users-subgraph → ai-subgraph → gateway. Note that `AI_API_KEY` is required for the ai-subgraph to start, and the default config uses NVIDIA's free tier so no payment is required.

## 7. End-to-end smoke

- [x] 7.1 Boot the full stack: WP/nginx + Postgres (Docker) → users-subgraph → ai-subgraph → gateway. Composition succeeds; supergraph `Mutation` includes `runPostAgent` alongside WP's `createPost`/`updatePost`/`deletePost`.
- [x] 7.2 CREATE prompt via `runPostAgent` returned `{ action: "CREATED", post: { databaseId: 17, slug: "batching-with-dataloader", title: "Batching with DataLoader", status: "publish" }, message: "I created a post titled..." }`.
- [x] 7.3 New post appeared as the first item in `posts(first: 1)`. **Authorship caveat:** with the current cookie+WP-token forwarding, WP authenticates via the JWT (`desafio-svc`), so `appUser` resolves to `Service Acct` not the calling user. The calling user `agent-smoke@desafio.local` has `wp_user_id IS NULL` so even cookie-only auth wouldn't pin to them. Pinning to the calling user requires a `users.find(id) → wp_user_id` lookup before each tool call and passing `authorId` in the WP input — deferred to a follow-up; documented in design risk #1.
- [x] 7.4 UPDATE prompt: agent ran `listPosts → updatePost → final text`, returned `action: "UPDATED"`, `post.databaseId = 17`. `query { post(idType: SLUG) { content } }` confirmed the appended closing paragraph: "...We recommend using per-request scoping to ensure that each request has its own cache..."
- [x] 7.5 DELETE prompt: agent ran `listPosts → deletePost`, returned `action: "DELETED", deletedDatabaseId: 17`. Subsequent `query { post(idType: SLUG) }` returned `null`.
- [x] 7.6 NOOP prompt ("Delete the post about quantum computing on the moon written by a unicorn"): returned `action: "NOOP", message: "I couldn't find a match."`
- [x] 7.7 `/blog-copilot` as signed-in user: HTTP 200, source contains "Blog copilot" heading + intro copy + prompt label + Send button.
- [x] 7.8 `/blog-copilot` as anon: HTTP 307 → `/sign-in?next=%2Fblog-copilot`.
- [x] 7.9 Mutation via `curl` without cookie: `errors[0].extensions.code = "UNAUTHENTICATED"`.

## 8. Verification

- [x] 8.1 `pnpm nx run-many -t build,lint -p ai,ai-subgraph,gateway,web` passes (after `nx sync` to refresh tsconfig project references for the new `ai-subgraph`).
- [x] 8.2 `pnpm openspec validate ai-post-agent --strict` passes.
