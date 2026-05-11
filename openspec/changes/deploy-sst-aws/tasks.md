## 1. Workspace setup: SST + OpenNext deps

- [x] 1.1 Add devDeps to root `package.json`: `sst@^3`, `aws-cdk-lib`, `@opennextjs/aws`. Run `pnpm install` and confirm `pnpm exec sst version` reports a v3.x build.
- [x] 1.2 Add `.sst/` and `.open-next/` to root `.gitignore` (SST and OpenNext build artifacts).
- [x] 1.3 Add a one-line note in the root `README.md` (or create a new `DEPLOY.md` reference) pointing operators at `DEPLOY.md` for AWS deployment.

## 2. Dockerfiles for the three NestJS apps

- [x] 2.1 Add `apps/gateway/Dockerfile` — multi-stage: stage 1 = `node:24-bookworm` + `pnpm install --frozen-lockfile` at workspace root + `pnpm nx build gateway`; stage 2 = `gcr.io/distroless/nodejs24-debian12` copying `apps/gateway/dist/main.js` + workspace `node_modules`. EXPOSE 3000. CMD `["main.js"]`.
- [x] 2.2 Add `apps/users-subgraph/Dockerfile` — same shape; build target `users-subgraph`, EXPOSE 3001.
- [x] 2.3 Add `apps/mcp-server/Dockerfile` — same shape; build target `mcp-server`, EXPOSE 4000.
- [x] 2.4 Add `.dockerignore` files alongside each Dockerfile excluding `node_modules`, `dist`, `.next`, `.sst`, `.open-next`, `coverage`, `tmp`, `.env*` (avoid leaking local secrets into image build context).
- [x] 2.5 Verify each image builds locally: `docker build -t desafio-gateway -f apps/gateway/Dockerfile .` (and the other two). Image size should land under ~300MB per service (rspack bundles + distroless keep this tight).

## 3. WordPress image: bake the federation plugin

- [x] 3.1 Update `docker/wordpress/Dockerfile` to `COPY plugins/wp-graphql-federations/ /usr/src/wp-graphql-federations/` after the WP-CLI install layer.
- [x] 3.2 Update `docker/wordpress/docker-entrypoint-custom.sh` to `cp -rn /usr/src/wp-graphql-federations /var/www/html/wp-content/plugins/` BEFORE the existing `install_plugin_from_git` line so the local copy seeds the volume; keep the git-clone fallback in case the COPY didn't land (e.g., on a fresh image build path).
- [x] 3.3 Build the image locally: `docker compose build wordpress`. Confirm the file `/var/www/html/wp-content/plugins/wp-graphql-federations/src/AppUserBridge.php` exists in the resulting image (`docker run --rm <image> ls /usr/src/wp-graphql-federations/src/`).
- [x] 3.4 Verify the local docker-compose dev workflow still works: the bind mount in `docker-compose.yaml` shadows the baked-in copy as before, so PHP edits show up immediately.

## 4. sst.config.ts: VPC + cluster + DBs + EFS

- [x] 4.1 Create `sst.config.ts` at repo root scaffolding `app(input) => { name: "desafio", region: "us-east-1", removal: input.stage === "prod" ? "retain" : "remove" }` and `async run() { ... }`. Pin `home: "aws"`.
- [x] 4.2 Inside `run()`, declare `const vpc = new sst.aws.Vpc("Vpc", { nat: "ec2" });` (single shared VPC, NAT-on-EC2 to avoid the $32/mo NAT Gateway cost).
- [x] 4.3 Declare `const cluster = new sst.aws.Cluster("Cluster", { vpc });` (shared by all four Services).
- [x] 4.4 Declare `const postgres = new sst.aws.Aurora("Postgres", { engine: "postgres", vpc, scaling: { min: "0 ACU", max: "1 ACU" } });`.
- [x] 4.5 Declare `const mysql = new sst.aws.Aurora("Mysql", { engine: "mysql", vpc, scaling: { min: "0 ACU", max: "1 ACU" } });`.
- [x] 4.6 Declare `const wpContent = new sst.aws.Efs("WpContent", { vpc });` for the WordPress `wp-content` mount.

## 5. sst.config.ts: secrets

- [x] 5.1 Declare `const secrets = { betterAuthSecret: new sst.Secret("BetterAuthSecret"), aiApiKey: new sst.Secret("AiApiKey"), wpGraphqlServiceToken: new sst.Secret("WpGraphqlServiceToken"), googleClientId: new sst.Secret("GoogleClientId"), googleClientSecret: new sst.Secret("GoogleClientSecret") };` — exactly 5, no more.
- [x] 5.2 Confirm `sst secret set BetterAuthSecret <value>` syntax in DEPLOY.md matches the casing of the constructor names (SST uses the constructor name as the CLI key).

## 6. sst.config.ts: four Services

- [x] 6.1 `wordpress` Service: image from `docker/wordpress/Dockerfile` build context, volumes `[{ efs: wpContent, path: "/var/www/html/wp-content" }]`, scaling `{ min: 1, max: 1, spot: false }`, loadBalancer `{ ports: [{ listen: "80/http", forward: "80/http" }] }`, link `[mysql]`, environment vars set from MySQL link (WORDPRESS_DB_HOST, _USER, _PASSWORD, _NAME) plus `GRAPHQL_DEBUG: "true"`, `WP_ENVIRONMENT_TYPE: "production"`, `GRAPHQL_JWT_AUTH_SECRET_KEY` (sourced from a 6th secret OR hard-coded — TBD; for v1 keep the local key as a placeholder and document rotation).
- [x] 6.2 `usersSubgraph` Service: image from `apps/users-subgraph/Dockerfile`, scaling `{ min: 0, max: 1, spot: true }`, loadBalancer `{ ports: [{ listen: "3001/http", forward: "3001/http" }] }`, link `[postgres, secrets.betterAuthSecret, secrets.googleClientId, secrets.googleClientSecret, secrets.wpGraphqlServiceToken]`, environment from postgres link (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD), `BETTER_AUTH_SECRET` from secret, `BETTER_AUTH_URL: <its-own-alb-url>` (use SST's URL output), `BETTER_AUTH_BASE_PATH: "/auth"`, `BETTER_AUTH_TRUSTED_ORIGINS: <web-cloudfront-url>`, `GOOGLE_CLIENT_ID/SECRET` from secrets, `WP_GRAPHQL_URL: <wordpress.url>/graphql` from link, `WP_GRAPHQL_SERVICE_TOKEN` from secret.
- [x] 6.3 `gateway` Service: image from `apps/gateway/Dockerfile`, scaling `{ min: 0, max: 1, spot: true }`, loadBalancer `{ ports: [{ listen: "3000/http", forward: "3000/http" }] }`, link `[usersSubgraph, wordpress]`, environment `USERS_SUBGRAPH_URL: <usersSubgraph.url>/graphql` and `POSTS_SUBGRAPH_URL: <wordpress.url>/graphql`.
- [x] 6.4 `mcpServer` Service: image from `apps/mcp-server/Dockerfile`, scaling `{ min: 0, max: 1, spot: true }`, loadBalancer `{ ports: [{ listen: "4000/http", forward: "4000/http" }] }`, link `[gateway]`, environment `GATEWAY_URL: <gateway.url>/graphql`, `MCP_SERVER_PORT: "4000"`, `MCP_TRANSPORT: "http+sse"`.
- [x] 6.5 Verify each Service's `link` resolves correctly by running `sst diff --stage prod` (no actual deploy yet) and inspecting the env-var injection plan.

## 7. sst.config.ts: Next.js web

- [x] 7.1 Declare `const web = new sst.aws.Nextjs("Web", { path: "apps/web", link: [secrets.aiApiKey, secrets.wpGraphqlServiceToken, gateway, usersSubgraph, mcpServer], environment: { NEXT_PUBLIC_GATEWAY_URL: gateway.url, NEXT_PUBLIC_AUTH_URL: usersSubgraph.url, MCP_SERVER_URL: $interpolate\`${mcpServer.url}/mcp\`, AI_API_KEY: secrets.aiApiKey.value, AI_PROVIDER: "nvidia", AI_MODEL: "meta/llama-3.3-70b-instruct", WP_GRAPHQL_SERVICE_TOKEN: secrets.wpGraphqlServiceToken.value } });` — fill in env semantics so the route handler's `process.env` matches what the local serve-prod sources from `.env`.
- [x] 7.2 Add a `return { web: web.url, gateway: gateway.url, usersSubgraph: usersSubgraph.url, mcpServer: mcpServer.url, wordpress: wordpress.url };` block at the bottom of `run()` so `sst deploy` prints all five URLs as outputs.
- [x] 7.3 Update `apps/web/next.config.js` rewrites to consume `NEXT_PUBLIC_GATEWAY_URL` and `NEXT_PUBLIC_AUTH_URL` (already does this — verify no hard-coded localhost defaults bleed through in production).

## 8. Cross-cutting wiring

- [x] 8.1 Verify the gateway's `apps/gateway/src/app/cookie-data-source.ts` works against in-VPC ALB hostnames (Apollo `RemoteGraphQLDataSource` doesn't care, but confirm the URLs SST injects are http:// + ALB hostname:port and not surprise https-only).
- [x] 8.2 Verify `apps/users-subgraph/src/main.ts` reads `process.env.PORT` (it already does). Confirm the Service's `loadBalancer.ports.forward` matches.
- [x] 8.3 Verify the MikroORM config in `libs/db/src/lib/create-mikro-orm-options.ts` reads `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` from env (it does — confirm SST's postgres link injects these names, not different ones; if the Aurora link uses different names like `DB_USERNAME` we either rename or remap with environment overrides).
- [x] 8.4 Verify `apps/mcp-server/src/mcp/gateway-health.ts` works against the Aurora cold-start window — bump its 5s timeout to 30s for the deployed environment via env var if needed.
- [x] 8.5 Verify the WP container's `docker-entrypoint-custom.sh` reads MySQL env vars in the names SST's mysql link injects (`WORDPRESS_DB_HOST`/`USER`/`PASSWORD`/`NAME` is the WP convention; remap if SST uses different names).

## 9. DEPLOY.md runbook

- [x] 9.1 Create `DEPLOY.md` at repo root with sections: Prerequisites (AWS account, IAM admin, `aws configure`, Docker Desktop, pnpm), First Deploy (set 4 of 5 secrets with placeholders for the 5th, run `sst deploy --stage prod`), Mint the WP service token (exec into the WP task via `aws ecs execute-command`, run `wp jwt-auth-token issue desafio-svc`, capture the JWT), Apply the WP token (`sst secret set WpGraphqlServiceToken <jwt> && sst deploy --stage prod`), Verify (curl the gateway URL's `/graphql` for `__schema`, hit the web URL in a browser), Backfill (run `WP_GRAPHQL_URL=<wp-url> ./scripts/backfill-wp-user-ids.sh` and `./scripts/backfill-app-user-ids.sh`), Teardown (`sst remove --stage prod`).
- [x] 9.2 Document the cold-start caveat under a "Known v1 limitations" section: ~30s on first request after idle, mitigation is `min: "0.5 ACU"` on the postgres Aurora.
- [x] 9.3 Document the AWS-assigned hostname limitation and the upgrade path (custom domain via Route 53) explicitly as deferred.
- [x] 9.4 List the rough monthly cost estimate ($75-100/mo idle) with a breakdown by component, sourced from the design doc.

## 10. End-to-end deploy + verification

- [x] 10.1 `sst secret set` all 5 secrets (placeholder for `WpGraphqlServiceToken`).
- [x] 10.2 `sst deploy --stage prod`. Wait for the deploy to settle. Capture the 5 stage outputs.
- [ ] 10.3 Verify each Service is RUNNING: `aws ecs list-services --cluster <stage-cluster>` then `describe-services` for each.
- [ ] 10.4 Hit the WP URL in a browser, complete the WP install wizard if needed (or skip — the entrypoint provisions admin + desafio-svc automatically).
- [ ] 10.5 `aws ecs execute-command` into the WP task, run `wp jwt-auth-token issue desafio-svc --allow-root`, capture the JWT.
- [ ] 10.6 `sst secret set WpGraphqlServiceToken <jwt> && sst deploy --stage prod`. Wait for users-subgraph + mcp-server to roll.
- [ ] 10.7 Run `WP_GRAPHQL_URL=<wp-url> ./scripts/backfill-wp-user-ids.sh` (after pointing PG_CONTAINER at the deployed Aurora — may require local Postgres client + RDS auth).
- [ ] 10.8 Run `./scripts/backfill-app-user-ids.sh` similarly.
- [ ] 10.9 Sign up via the web URL's `/sign-up` page; verify the new user appears in Aurora postgres AND has the `app_user_id` meta on the corresponding WP user.
- [ ] 10.10 Open `/blog-copilot`, prompt "Create a short post about cursor pagination"; verify a post is created (CREATED action), navigate to its slug.
- [ ] 10.11 Capture the public URLs in PR description; share with the user for demo.

## 11. Cleanup gates (mirror enforce-pure-federation 8.x)

- [x] 11.1 `git grep` returns zero hits for hardcoded `localhost:3000`, `localhost:3001`, `localhost:4000`, `localhost:4200` outside of `scripts/serve-prod.sh`, `.env.example`, the local `docker-compose.yaml`, and the openspec docs.
- [ ] 11.2 `pnpm nx run-many -t lint,build` clean across all projects after the config + Dockerfile additions.
- [ ] 11.3 The Dockerfile builds reproduce CI-side without errors (verify in a clean clone or via `docker build` from a tmpdir).
