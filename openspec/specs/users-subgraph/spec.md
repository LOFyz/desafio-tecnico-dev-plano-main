## ADDED Requirements

### Requirement: users-subgraph is an Apollo Federation subgraph serving GraphQL
`apps/users-subgraph` SHALL be a NestJS application registered as an Apollo Federation subgraph using `ApolloFederationDriver` in schema-first mode, exposing a `/graphql` endpoint with a valid subgraph SDL.

#### Scenario: Subgraph responds to federation introspection
- **WHEN** Apollo Router or the gateway sends a `_service { sdl }` introspection query
- **THEN** the subgraph returns its SDL including federation directives (`@key`, `@shareable`, etc.)

#### Scenario: GraphQL playground accessible in development
- **WHEN** the app runs in development mode and a browser navigates to `/graphql`
- **THEN** a GraphQL playground (or sandbox) is rendered

### Requirement: me query returns the current authenticated user from Better Auth session
The GraphQL schema SHALL define `type Query { me: User }` where `User` is a federation entity type. The `MeResolver` SHALL dispatch a CQRS `GetMeQuery` with the `sessionId` from GraphQL context; the handler returns the Better Auth session's user or `null`.

#### Scenario: Authenticated request returns user
- **WHEN** a request carries a valid Better Auth session cookie and resolves `query { me { id email name } }`
- **THEN** the response contains the authenticated user's `id`, `email`, and `name`

#### Scenario: Unauthenticated request returns null
- **WHEN** a request has no session cookie and resolves `query { me { id } }`
- **THEN** `data.me` is `null` and no error is thrown

#### Scenario: Expired session returns null
- **WHEN** a request carries an expired session token
- **THEN** `data.me` is `null`

### Requirement: GraphQL context carries sessionId extracted from cookie
The `GraphQLModule` context factory SHALL extract the `better-auth.session_token` cookie from the HTTP request and expose it as `sessionId` in the typed `GqlContext`. All resolvers receive this context.

#### Scenario: Cookie present in request
- **WHEN** the incoming HTTP request has a `cookie` header containing `better-auth.session_token=<token>`
- **THEN** `context.sessionId` equals `<token>`

#### Scenario: Cookie absent in request
- **WHEN** the incoming HTTP request has no `better-auth.session_token` cookie
- **THEN** `context.sessionId` is `undefined`

### Requirement: Better Auth REST handler is mounted at /auth/**
`apps/users-subgraph` SHALL mount the Better Auth HTTP handler at `/auth` so that the Better Auth client can call sign-in, sign-out, session, and OAuth redirect endpoints via REST.

#### Scenario: Sign-in endpoint responds
- **WHEN** a POST request is sent to `/auth/sign-in/email` with valid credentials
- **THEN** the response sets a session cookie and returns a 200 status

#### Scenario: Session endpoint responds
- **WHEN** a GET request is sent to `/auth/get-session` with a valid session cookie
- **THEN** the response returns the current session object as JSON
