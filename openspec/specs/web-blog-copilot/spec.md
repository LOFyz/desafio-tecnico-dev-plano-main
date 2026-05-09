### Requirement: Web app exposes the blog copilot via a Next.js Route Handler

The web app SHALL expose `POST /api/blog-copilot/run` implemented as a Next.js Route Handler at `apps/web/src/app/api/blog-copilot/run/route.ts`. The handler SHALL:

1. Read the Better Auth session via the existing `getSession()` helper.
2. Reject requests with no valid session by returning HTTP 401 and JSON `{ "error": { "code": "UNAUTHENTICATED" } }`.
3. Parse the request body as `{ prompt: string }` and validate with zod (5 to 500 characters); return HTTP 400 with `{ "error": { "code": "INVALID_PROMPT", "message": <string> } }` on failure.
4. Dispatch the existing `RunPostAgentCommand` through Nest's `CommandBus` (re-exported from `libs/ai`) — using the session's user id and the raw cookie string for downstream MCP calls.
5. Return HTTP 200 with the typed `PostAgentResult` payload on success, mapped to JSON with the same `action`/`post`/`deletedDatabaseId`/`message` shape used by the previous GraphQL mutation.
6. Map domain errors to error JSON: `AiGenerationFailedError` → 502 `{ "error": { "code": "AI_GENERATION_FAILED", "message": <string> } }`; `WpPublishFailedError` → 200 `{ action: "NOOP", message: <string>, post: null, deletedDatabaseId: null }` (degraded success); other errors → 500 `{ "error": { "code": "INTERNAL_ERROR" } }`.

#### Scenario: Authenticated successful create returns the typed payload
- **WHEN** an authenticated client POSTs `{ "prompt": "Create a post titled Hello" }`
- **THEN** the handler responds with HTTP 200 and JSON `{ "action": "CREATED", "post": { "databaseId": <int>, "slug": <string>, "title": <string>, "status": "publish" }, "deletedDatabaseId": null, "message": <string> }`

#### Scenario: Anonymous request is rejected
- **WHEN** a client without a valid session cookie POSTs to `/api/blog-copilot/run`
- **THEN** the response is HTTP 401 with `{ "error": { "code": "UNAUTHENTICATED" } }` and no agent call is made

#### Scenario: Empty prompt is rejected client-side and server-side
- **WHEN** the body's `prompt` is empty (or under 5 chars)
- **THEN** the handler returns HTTP 400 with `{ "error": { "code": "INVALID_PROMPT", "message": <string> } }` and no agent call is made

#### Scenario: WP publish failure surfaces as NOOP
- **WHEN** the agent throws `WpPublishFailedError` mid-run (e.g., WP rejects the write)
- **THEN** the handler returns HTTP 200 with `{ "action": "NOOP", "post": null, "deletedDatabaseId": null, "message": <string quoting the WP error> }`

### Requirement: Copilot form posts to the route handler instead of the GraphQL mutation

`apps/web/src/components/organisms/ai/blog-copilot-form.tsx` SHALL replace its `useMutation(RUN_POST_AGENT_MUTATION)` call with a `fetch('/api/blog-copilot/run', { method: 'POST', body: JSON.stringify({ prompt }) })` call. Branching behavior on the result SHALL be preserved verbatim from the previous implementation:

- `CREATED` or `UPDATED` → `router.push("/blog/<post.slug>")` and a sonner success toast quoting `result.message`.
- `DELETED` → `router.push("/blog")` and a sonner success toast `"Post deleted"` with `result.message` as description.
- `NOOP` → stay on the page; render `result.message` as an inline notice; preserve the prompt text.

On HTTP error the form SHALL render a user-readable message derived from `error.code` (using the same mapping helper repurposed from `apps/web/src/lib/ai/errors.ts`).

#### Scenario: Successful create still redirects to the new post
- **WHEN** the user submits a valid prompt and the route handler returns `{ action: "CREATED", post: { slug: "my-new-post", ... }, ... }`
- **THEN** the form navigates to `/blog/my-new-post` and shows a success toast quoting `message`

#### Scenario: Successful delete still redirects to the index
- **WHEN** the route handler returns `{ action: "DELETED", deletedDatabaseId: 42, ... }`
- **THEN** the form navigates to `/blog` and surfaces `"Post deleted"`

#### Scenario: NOOP keeps the user on the page
- **WHEN** the route handler returns `{ action: "NOOP", message: "I couldn't find a post matching X", ... }`
- **THEN** the form does NOT navigate, renders the message inline, and preserves the prompt textarea contents

#### Scenario: 401 redirects to sign-in
- **WHEN** the route handler returns HTTP 401 (e.g., the user's session expired between page load and submit)
- **THEN** the form redirects to `/sign-in?next=%2Fblog-copilot`

#### Scenario: 502 from the LLM is surfaced inline
- **WHEN** the route handler returns HTTP 502 with `code = "AI_GENERATION_FAILED"`
- **THEN** the form shows a user-readable message (e.g., "We couldn't run the copilot. Please try again.") inline, without navigating away, and preserves the prompt

### Requirement: Copilot page redirects unauthenticated visitors

`apps/web/src/app/(protected)/blog-copilot/page.tsx` SHALL continue to be an RSC under the `(protected)` route group. It SHALL call `getSession()` and `redirect('/sign-in?next=%2Fblog-copilot')` when no session exists. The page SHALL render the copilot form within a Card using the existing visual treatment.

#### Scenario: Anonymous visitor is redirected to sign-in
- **WHEN** a visitor without a session navigates to `/blog-copilot`
- **THEN** they are redirected to `/sign-in?next=%2Fblog-copilot`

#### Scenario: Authenticated visitor sees the form
- **WHEN** an authenticated user navigates to `/blog-copilot`
- **THEN** the page renders the prompt form
