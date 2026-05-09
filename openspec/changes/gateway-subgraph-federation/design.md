## Context

`apps/gateway` is a NestJS application currently using webpack, MikroORM, and no GraphQL layer. The project vision calls for a minimal Apollo Federation gateway that aggregates subgraphs (`users-subgraph`, future WordPress subgraph) and routes the Better Auth session cookie through to each service. The gateway must not own any database — it is purely a query-routing layer.

The `users-subgraph` is already running on port 3001 with a valid Apollo Federation schema (`_service { sdl }` verified). The gateway will be the single public-facing GraphQL endpoint (port 3000).

## Goals / Non-Goals

**Goals:**
- Replace the gateway's dead MikroORM/webpack setup with a minimal Apollo Federation gateway
- Federate `users-subgraph` as the first registered subgraph
- Forward the `better-auth.session_token` cookie from the client to each subgraph's request headers so the subgraph can resolve the session independently
- Expose a single `/graphql` endpoint that the Next.js frontend (and Apollo Studio) can query
- Build with Rspack (consistent with the rest of the monorepo)

**Non-Goals:**
- Gateway-level authentication/authorization — the gateway is cookie-passthrough only; each subgraph decides what to do with the session
- WordPress subgraph federation — that is a separate change
- Persisted queries, rate limiting, or caching — future changes
- Any database, CQRS, or domain logic inside the gateway

## Decisions

### Use `@apollo/gateway` + `IntrospectAndCompose` (not Apollo Router)
Apollo Router is a Rust binary and requires a separate runtime. `@apollo/gateway` (JS) runs inside NestJS and is the pattern the codebase already targets (`@nestjs/apollo` is installed workspace-wide). `IntrospectAndCompose` dynamically fetches each subgraph's SDL at startup — no supergraph schema file to maintain for now. When the graph stabilises, `LocalCompose` (static supergraph) can replace it.

**Alternative considered:** Apollo Router as a sidecar. Rejected — adds operational complexity, separate config file, different cookie-header forwarding model.

### Cookie forwarding via `RemoteGraphQLDataSource`
Each outgoing subgraph request needs the `cookie` header copied from the incoming gateway request. Apollo Gateway's `buildService` hook lets us return a custom `RemoteGraphQLDataSource` subclass that reads `context.req.headers.cookie` and injects it into each subgraph fetch. This is the standard Apollo pattern for forwarding auth headers.

```ts
class CookieDataSource extends RemoteGraphQLDataSource {
  willSendRequest({ request, context }) {
    const cookie = context?.req?.headers?.cookie;
    if (cookie) request.http?.headers.set('cookie', cookie);
  }
}
```

**Alternative considered:** Forwarding a parsed session token as a custom `x-session-token` header. Rejected — Better Auth on the subgraph reads the cookie directly; keeping the cookie format avoids changes to `users-subgraph`.

### Remove MikroORM from the gateway
The gateway has zero domain logic and no persistence needs. Keeping MikroORM would add database connection overhead and require `DB_*` env vars just to start the gateway. Removing it simplifies the dependency graph and startup time.

### Rspack over webpack
Webpack minifies constructor names, breaking any class-name-dependent runtime metadata. Rspack is already the monorepo standard. The `rspack.config.js` + `NxAppRspackPlugin` pattern is identical to `apps/users-subgraph`.

### Port allocation
- Gateway: 3000 (default NestJS port, becomes the public GraphQL entrypoint)
- users-subgraph: 3001 (unchanged)

## Risks / Trade-offs

- **`IntrospectAndCompose` startup dependency** → If `users-subgraph` is not running when the gateway starts, the gateway will fail at boot. Mitigation: start services in order (`users-subgraph` first), or use a health-check retry in docker-compose.
- **SDL introspection in production** → `IntrospectAndCompose` continuously polls subgraph SDLs. Acceptable in development; for production consider `LocalCompose` with a pre-built supergraph schema. Not addressed in this change.
- **Cookie forwarding is all-or-nothing** → All cookies (not just `better-auth.session_token`) are forwarded. This is safe for internal service-to-service communication but should be revisited if untrusted subgraphs are ever added.
