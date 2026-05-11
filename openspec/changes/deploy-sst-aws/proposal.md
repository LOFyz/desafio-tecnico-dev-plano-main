## Why

The federated stack (gateway + users-subgraph + mcp-server + Next.js web + WordPress headless CMS) currently only runs locally via `scripts/serve-prod.sh`. The challenge brief calls for an SST-deployed AWS target so the application can be demoed at a public URL. Without this, the work in `enforce-pure-federation` and earlier changes can't be exercised by anyone outside the developer's machine.

## What Changes

- **Add `sst.config.ts`** at the repo root, defining all infrastructure as code via SST v3 (Ion):
  - `sst.aws.Vpc` (single, shared, `nat: "ec2"` to dodge the ~$32/mo NAT Gateway charge in v1).
  - `sst.aws.Cluster` shared across all four Services.
  - `sst.aws.Aurora` (postgres) — Better Auth + app's `user` table; min ACU = 0 (scale-to-zero).
  - `sst.aws.Aurora` (mysql) — WordPress; min ACU = 0.
  - `sst.aws.Efs` — `/wp-content` for WordPress media + plugin uploads.
  - `sst.aws.Service` × 4: `gateway`, `users-subgraph`, `mcp-server`, `wordpress`. Spot Fargate where possible. ALBs only on the externally-reachable three (`gateway`, `mcp-server`, `wordpress`); `users-subgraph` stays VPC-internal and is reached via service discovery from the gateway.
  - `sst.aws.Nextjs` — the web app (OpenNext on Lambda + CloudFront + S3, streaming Function URL).
  - `sst.Secret` × 5: `BetterAuthSecret`, `AiApiKey`, `WpGraphqlServiceToken`, `GoogleClientId`, `GoogleClientSecret`. (DB URLs / inter-service URLs are wired via `sst.Linkable`, not secrets.)
- **Add three new Dockerfiles** for the NestJS apps (`apps/{gateway,users-subgraph,mcp-server}/Dockerfile`). Multi-stage: pnpm install → `nx build` → distroless Node runtime around the rspack-bundled `dist/main.js`.
- **Update `docker/wordpress/Dockerfile`** to bake the local `wp-graphql-federations` plugin into the image (replacing the bind-mount workflow we use locally — bind mounts don't translate to Fargate). Also drop the local-only `docker-compose.yaml` bind mount in v2 of this change (still useful for local dev so we keep it for now; the SST deploy uses the Dockerfile-baked copy).
- **Add `DEPLOY.md`** at repo root: an end-to-end runbook covering `aws configure`, the five `sst secret set` invocations, `sst deploy --stage prod`, where to find the outputs (web URL, gateway URL, mcp URL, WP URL, DB hostnames), and how to run `scripts/backfill-wp-user-ids.sh` + `scripts/backfill-app-user-ids.sh` against the deployed stack.
- **Add SST + OpenNext devDeps** to the workspace `package.json`: `sst`, `aws-cdk-lib`, `@opennextjs/aws`. (Pulumi providers are pulled in transitively by SST.)
- **Update `apps/web/next.config.js`** if needed — the existing `experimental.proxyTimeout` and `serverExternalPackages` settings stay; only the `rewrites()` block may need to switch from hard-coded `localhost` defaults to env-driven values that point at the deployed gateway/auth URLs in production.
- **Update `apps/web/src/lib/auth/session.ts`** and the gateway's cookie forwarder if needed to pick up the deployed URL from env vars rather than the hard-coded localhost defaults.
- **Wire cross-service URLs** through SST `link` so each Service / the Nextjs app sees the right `GATEWAY_URL`, `USERS_SUBGRAPH_URL`, `MCP_SERVER_URL`, `WP_GRAPHQL_URL`, `DATABASE_URL` (postgres), and `WORDPRESS_DB_*` (mysql) at runtime.
- **Document caveats**: NAT-on-EC2 is a single point of failure (acceptable for v1 demo), Aurora scale-to-zero adds ~30s cold-start to the first request after idle, MCP server's HTTP+SSE long-lived connections hit Fargate (not Lambda) by design.

## Capabilities

### New Capabilities
- `sst-deployment`: SST v3 infrastructure-as-code definition that provisions VPC, two Aurora clusters, EFS, four Fargate Services, and the Next.js Lambda + CloudFront + S3 distribution. Defines the cross-service linking contract, secret surface, and the resulting public URL set.

### Modified Capabilities
- `wp-app-user-meta`: the WP plugin install path becomes the baked-in image (the federation plugin's source ships inside the Docker image), not a bind mount. The plugin's runtime behavior is unchanged.

## Impact

- **Code added**: `sst.config.ts`, `apps/{gateway,users-subgraph,mcp-server}/Dockerfile`, `DEPLOY.md`, `.gitignore` entries for `.sst/`.
- **Code modified**: `docker/wordpress/Dockerfile` (COPY the local plugin in), workspace `package.json` (devDeps for SST + OpenNext), possibly `apps/web/next.config.js` (env-driven rewrite destinations) and `apps/web/src/lib/auth/session.ts` (env-driven upstream URL).
- **External infra created on first deploy**: 1 VPC, 1 NAT-EC2 instance, 2 Aurora clusters, 1 EFS filesystem, 1 ECS cluster, 4 ECS services + 3 ALBs, 1 CloudFront distribution, 1 S3 bucket, ~5 Lambda functions (Next.js server + image opt + warmer + ISR + revalidation).
- **Cost** (rough, idle-friendly): ~$75–100/mo with both Auroras scaled to 0 and Spot Fargate min-1 task for each Service. NAT-on-EC2 saves ~$30/mo vs NAT Gateway at the cost of HA. WP needs always-on (min 1 task) so the Better Auth signup hook doesn't block.
- **Secrets the operator must set before deploy**: `BetterAuthSecret`, `AiApiKey`, `WpGraphqlServiceToken`, `GoogleClientId`, `GoogleClientSecret`. The first deploy fails fast with a clear error if any are missing.
- **Deferred to a follow-up change**: custom domain + Route 53 wiring, dev/prod multi-stage CI, RDS Proxy in front of Aurora, scale-to-min-1 hardening for the gateway and mcp-server, SST Console alerts, refactor Better Auth signup hook to fire-and-forget.
