## 1. Install Dependencies

- [x] 1.1 Add `@apollo/gateway`, `@nestjs/apollo`, `@nestjs/graphql`, `graphql`, `cookie-parser`, `@types/cookie-parser` to `apps/gateway/package.json` dependencies
- [x] 1.2 Add `@nx/rspack` to root devDependencies (if not already present) and run `pnpm install`

## 2. Migrate Gateway Build to Rspack

- [x] 2.1 Delete `apps/gateway/webpack.config.js` (if exists)
- [x] 2.2 Create `apps/gateway/rspack.config.js` using `NxAppRspackPlugin` with `target: 'node'` (mirror `apps/users-subgraph/rspack.config.js`)
- [x] 2.3 Update `apps/gateway/package.json` build target executor from `nx:run-commands` to `@nx/rspack:rspack`; set `rspackConfig`, `main`, `outputPath`, `skipTypeChecking: true`, `optimization: false`, `target: 'node'`
- [x] 2.4 Update `apps/gateway/tsconfig.app.json` if needed to align with rspack executor expectations

## 3. Rewrite AppModule

- [x] 3.1 Remove `DbModule`, `MikroOrmModule`, `AppController`, `AppService` imports from `apps/gateway/src/app/app.module.ts`
- [x] 3.2 Add `GraphQLModule.forRoot<ApolloGatewayDriverConfig>` with `ApolloGatewayDriver` and `IntrospectAndCompose` configured from `USERS_SUBGRAPH_URL` env var
- [x] 3.3 Implement `CookieDataSource extends RemoteGraphQLDataSource` in `apps/gateway/src/app/cookie-data-source.ts` — `willSendRequest` copies `context.req.headers.cookie` to the outgoing request
- [x] 3.4 Wire `buildService` in `ApolloGatewayDriverConfig` to return `CookieDataSource` for every subgraph URL
- [x] 3.5 Delete `apps/gateway/src/app/app.controller.ts` and `apps/gateway/src/app/app.service.ts`

## 4. Update main.ts

- [x] 4.1 Mount `cookie-parser` middleware in `apps/gateway/src/main.ts`
- [x] 4.2 Confirm gateway listens on port 3000 (or `process.env.PORT`)

## 5. Environment & Config

- [x] 5.1 Add `USERS_SUBGRAPH_URL=http://localhost:3001/graphql` to `.env.example`
- [x] 5.2 Update `apps/gateway/package.json` — remove `@desafio/db` and MikroORM workspace deps; add only what is needed

## 6. Verification

- [x] 6.1 Run `pnpm nx build gateway` — confirm build succeeds with no TypeScript errors
- [x] 6.2 Start `users-subgraph` (`pnpm nx serve users-subgraph`), then start the gateway (`pnpm nx serve gateway`) — confirm gateway logs successful schema composition
- [x] 6.3 Call `POST /auth/sign-up/email` on `users-subgraph` (port 3001) to obtain a session cookie
- [x] 6.4 Send `query { me { id email name } }` to the gateway (port 3000) with the session cookie — confirm authenticated user is returned
- [x] 6.5 Send `query { me { id } }` to the gateway without a cookie — confirm `data.me` is `null`
