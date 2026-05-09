## ADDED Requirements

### Requirement: MCP server runs as a standalone NestJS app at apps/mcp-server

The repo SHALL contain a new application `apps/mcp-server` that runs an MCP server (built with `@modelcontextprotocol/sdk`'s `Server` class — Apollo's MCP Server is a separate Rust binary not available on npm; this app implements an equivalent MCP-shaped wrapper around the federated GraphQL gateway). The app SHALL listen on a dedicated TCP port (default `4000`, overridable via `MCP_SERVER_PORT`) and SHALL expose the MCP HTTP+SSE transport on a documented path (default `/mcp`).

#### Scenario: App boots and reports listening port
- **WHEN** the operator runs `node --env-file=.env apps/mcp-server/dist/main.js` with `MCP_SERVER_PORT=4000`
- **THEN** the app logs `MCP server listening on http://localhost:4000/mcp` and accepts incoming HTTP+SSE connections

#### Scenario: App fails fast when the gateway is unreachable
- **WHEN** the gateway is down at startup (or `GATEWAY_URL` points nowhere)
- **THEN** the MCP server logs an actionable error naming the unreachable gateway and exits non-zero, so process supervisors do not silently mask the misconfiguration

### Requirement: MCP server exposes the four post-agent operations as MCP tools

The MCP server SHALL register exactly four tools backed by hand-written GraphQL operations against the federated supergraph: `createPost`, `updatePost`, `deletePost`, and `listPosts`. Each tool's input schema SHALL be defined as a JSON Schema (or zod-converted-to-JSON-Schema) that mirrors the corresponding GraphQL operation's variables (Relay global `id` for `update`/`delete`; `forceDelete: true` is hard-coded into `deletePost`'s execution; `listPosts` excludes `content` to keep token usage low). No other tools SHALL be registered in v1.

#### Scenario: MCP `tools/list` returns exactly the four tools
- **WHEN** an MCP client calls `tools/list` against the server
- **THEN** the response contains exactly the keys `createPost`, `updatePost`, `deletePost`, `listPosts` with their input schemas, and no other tool entries

#### Scenario: Tool invocation hits the gateway, not WP directly
- **WHEN** an MCP client calls `tools/call` for `createPost`
- **THEN** the MCP server issues a single GraphQL `mutation` to `${GATEWAY_URL}/graphql` (NOT to `WP_GRAPHQL_URL`), and returns the GraphQL data payload as the tool result

### Requirement: MCP server forwards per-call auth headers to the gateway

The MCP server SHALL accept a `cookie` header (Better Auth session) and an `authorization` header (WP service-account bearer) on each incoming MCP HTTP+SSE call and SHALL forward both verbatim on the outgoing gateway request. Headers MUST be scoped per call — the server MUST NOT cache, share, or persist credentials across requests.

#### Scenario: Cookie + bearer flow through to WP
- **WHEN** a route handler invokes the MCP server with `cookie: better-auth.session_token=<...>` and `authorization: Bearer <wp-svc-token>` while calling `createPost`
- **THEN** the gateway receives both headers; the gateway's existing `CookieDataSource` forwards them to the WP subgraph; WP attributes the new post to the cookie's user

#### Scenario: Missing cookie returns an authorization error to the caller
- **WHEN** the route handler invokes a tool without the session cookie
- **THEN** the MCP server still calls the gateway, but the gateway's downstream authorization check fails and the tool result surfaces the error verbatim (the MCP server itself does NOT short-circuit; auth is the federated graph's responsibility)

### Requirement: MCP server is configured purely via environment

The MCP server SHALL read `GATEWAY_URL` (the gateway's `/graphql` endpoint), `MCP_SERVER_PORT` (default `4000`), and `MCP_TRANSPORT` (default `http+sse`; `stdio` permitted for future use) from the environment. It SHALL NOT take CLI flags and SHALL NOT read project-local config files.

#### Scenario: Defaults work without env overrides
- **WHEN** the app starts with only `GATEWAY_URL=http://localhost:3000/graphql` set
- **THEN** the MCP server binds `0.0.0.0:4000` and serves the HTTP+SSE transport

#### Scenario: Port override works
- **WHEN** the app starts with `MCP_SERVER_PORT=4500`
- **THEN** the MCP server binds port `4500`

### Requirement: MCP server is wired into the local prod-mode startup script

`scripts/serve-prod.sh` SHALL include `mcp-server` in its build set and SHALL launch it after the gateway and before the web app, so the agent never points at an unstarted MCP server. The script SHALL log the MCP server's URL alongside the other three apps on success.

#### Scenario: serve-prod brings up all five processes in order
- **WHEN** the operator runs `./scripts/serve-prod.sh`
- **THEN** the script kills ports 3000, 3001, 3002 (legacy), 4000, and 4200; builds users-subgraph, mcp-server, gateway, and web; then starts users-subgraph → gateway → mcp-server → web in that order, waiting for each to bind its port before launching the next

#### Scenario: serve-prod prints all four URLs on success
- **WHEN** all four apps are listening
- **THEN** the script prints `gateway → http://localhost:3000/graphql`, `users-subgraph → http://localhost:3001/graphql`, `mcp-server → http://localhost:4000/mcp`, and `web → http://localhost:4200`
