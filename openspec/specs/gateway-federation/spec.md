## ADDED Requirements

### Requirement: Gateway serves a unified federated GraphQL endpoint
`apps/gateway` SHALL expose a single `/graphql` endpoint powered by `ApolloGatewayDriver` with `IntrospectAndCompose`, aggregating all registered subgraphs into one supergraph.

#### Scenario: Subgraph query routed through gateway
- **WHEN** a client sends `query { me { id email name } }` to the gateway's `/graphql` endpoint
- **THEN** the gateway routes the query to `users-subgraph` and returns the response

#### Scenario: Federation introspection available
- **WHEN** a client sends `query { _service { sdl } }` to the gateway
- **THEN** the gateway returns an error (gateway does not expose `_service`), confirming it is a composed gateway and not a subgraph

#### Scenario: Gateway starts successfully with users-subgraph running
- **WHEN** `users-subgraph` is reachable at `USERS_SUBGRAPH_URL` and the gateway starts
- **THEN** the gateway logs successful schema composition and begins accepting requests at `/graphql`

### Requirement: Gateway forwards session cookie to every subgraph
The gateway SHALL copy the incoming HTTP request's `cookie` header verbatim to every outgoing subgraph request via a custom `RemoteGraphQLDataSource`.

#### Scenario: Cookie present in client request
- **WHEN** a client request carries a `better-auth.session_token` cookie and queries `me { id email name }`
- **THEN** the subgraph receives the cookie header and resolves the authenticated user

#### Scenario: Cookie absent in client request
- **WHEN** a client request has no cookie header
- **THEN** the subgraph receives no cookie header and `me` resolves to `null`

### Requirement: Gateway has no database dependency
The gateway's `AppModule` SHALL NOT import `DbModule`, `MikroOrmModule`, or any persistence layer.

#### Scenario: Gateway starts without DB_HOST configured
- **WHEN** the gateway starts with no `DB_*` environment variables set
- **THEN** the gateway starts successfully and accepts GraphQL requests without throwing a database error

### Requirement: Gateway build uses Rspack
`apps/gateway` SHALL use the `@nx/rspack:rspack` executor for its build target, with `NxAppRspackPlugin` configured for a Node.js target.

#### Scenario: Build succeeds with no TypeScript errors
- **WHEN** `pnpm nx build gateway` is run
- **THEN** the build completes successfully and emits a `dist/main.js` bundle
