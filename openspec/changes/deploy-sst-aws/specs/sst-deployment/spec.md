## ADDED Requirements

### Requirement: Repository ships an SST v3 config that provisions the entire stack

The repo SHALL contain a top-level `sst.config.ts` that, on `sst deploy --stage prod`, provisions the full federated stack to AWS in one command. The config SHALL declare every infrastructure component (VPC, cluster, databases, EFS, services, web Lambda, secrets) — no manual AWS Console wiring SHALL be required after `aws configure`.

#### Scenario: Fresh-account deploy succeeds end-to-end
- **WHEN** an operator with `aws configure` set, all 5 secrets set via `sst secret set`, and a clean AWS account runs `sst deploy --stage prod`
- **THEN** the deploy completes successfully and prints stage outputs naming the public URLs for `web`, `gateway`, `mcp-server`, and `wordpress` (plus the VPC-internal `users-subgraph` discovery name); the four ECS services reach `RUNNING` status; both Aurora clusters are reachable from the cluster

#### Scenario: Single-command teardown
- **WHEN** the operator runs `sst remove --stage prod`
- **THEN** all SST-created resources (VPC, NAT instance, both Auroras, EFS, ECS cluster + services, ALBs, CloudFront, S3, Lambda functions) are torn down

### Requirement: Web app deploys via OpenNext on Lambda + CloudFront

The `apps/web` Next.js app SHALL deploy via the `sst.aws.Nextjs` component (OpenNext + Lambda streaming Function URL + CloudFront + S3 + image-optimization Lambda + ISR plumbing). The Next.js version SHALL stay on the v16 line; OpenNext's `main` is used since Next 16 entries past 15.3.2 are not in the explicit compatibility matrix.

#### Scenario: SSR pages render on the deployed CloudFront URL
- **WHEN** an unauthenticated visitor hits `https://<deployed-cloudfront>/blog`
- **THEN** the Next.js server renders the page server-side using `Foundation_BlogIndexQuery` against the deployed gateway, returning the HTML body with the post list

#### Scenario: Streaming route handler works through Lambda Function URL
- **WHEN** an authenticated client POSTs to `/api/blog-copilot/run`
- **THEN** the request reaches the Lambda streaming Function URL (NOT the API Gateway HTTP API path which has a 30s streaming cap), and the agent's response is returned within the route handler's normal response window

### Requirement: NestJS apps deploy as Fargate Services on a shared cluster

The three NestJS apps (`apps/gateway`, `apps/users-subgraph`, `apps/mcp-server`) SHALL each deploy as an `sst.aws.Service` on a shared `sst.aws.Cluster`. Each Service SHALL ship its own multi-stage Dockerfile (pnpm install → `nx build` → distroless Node + `dist/main.js`). Spot Fargate capacity SHALL be used for `gateway` and `mcp-server`; `users-subgraph` MAY use Spot. WordPress is the exception (separate requirement below) and uses on-demand capacity.

#### Scenario: Each Service has its own Dockerfile and ALB (or service discovery)
- **WHEN** the operator runs `sst deploy --stage prod`
- **THEN** SST builds and pushes three container images (one per app), creates three ECS task definitions, and starts one task per Service with the right port (3000, 3001, 4000 respectively); `gateway`, `users-subgraph`, and `mcp-server` each have their own ALB exposing the relevant port

#### Scenario: gateway can reach users-subgraph by service-discovery name
- **WHEN** the gateway boots and runs `IntrospectAndCompose` against `USERS_SUBGRAPH_URL`
- **THEN** the URL points at the users-subgraph's ALB (HTTP, in-VPC) and composition succeeds

### Requirement: WordPress deploys as a Fargate Service with EFS-mounted wp-content and pinned min-1 task

The WordPress container SHALL deploy as an `sst.aws.Service` mounting an `sst.aws.Efs` volume at `/var/www/html/wp-content`. Scaling SHALL be `min: 1, max: 1, spot: false` to keep at least one task always running (so the synchronous Better Auth signup hook never blocks on a cold start). The Dockerfile SHALL bake the local `wp-graphql-federations` plugin into the image so no bind mount is needed.

#### Scenario: wp-content survives task restarts
- **WHEN** an admin uploads media via the WP admin UI, then SST replaces the WordPress task (e.g., on a deploy)
- **THEN** the new task sees the previously uploaded media files at the same paths because they live on EFS

#### Scenario: Federation plugin loads in the deployed container
- **WHEN** the WordPress task starts on Fargate and an external client introspects WPGraphQL
- **THEN** the schema includes `User.appUser: AppUser` (sourced from the baked-in plugin), and the `POST /wp-json/desafio/v1/link-app-user` REST route responds

#### Scenario: Better Auth signup hook reaches WP fast
- **WHEN** a Better Auth signup fires the `databaseHooks.user.create.after` hook in users-subgraph and POSTs to the WP link endpoint
- **THEN** the request completes within ~1s in steady state because the WP task is already running (no cold-start penalty)

### Requirement: Postgres and MySQL run on Aurora Serverless v2 with min ACU = 0

Better Auth's Postgres SHALL run on `sst.aws.Aurora { engine: "postgres", scaling: { min: "0 ACU", max: "1 ACU" } }`. WordPress's MySQL SHALL run on `sst.aws.Aurora { engine: "mysql", scaling: { min: "0 ACU", max: "1 ACU" } }`. Both clusters SHALL live in the shared VPC and SHALL be reachable only from inside the VPC.

#### Scenario: Idle cost stays at storage-only
- **WHEN** the stack is idle (no requests for >5 min)
- **THEN** both Aurora clusters scale to 0 ACU and the AWS bill shows only storage charges (~$0.10/GB-month per cluster)

#### Scenario: First request after idle pays cold start
- **WHEN** a client makes the first request after a long idle period
- **THEN** Aurora scales up (~30s) and the request completes; the operator-facing UX cost is documented in DEPLOY.md

### Requirement: Single VPC with NAT-on-EC2

A single `sst.aws.Vpc("Vpc", { nat: "ec2" })` SHALL be shared across the cluster, both Auroras, and EFS. NAT-on-EC2 SHALL be used (one t3.nano-class instance) instead of NAT Gateway, accepting the SPOF for v1 in exchange for ~$30/mo cost savings.

#### Scenario: Outbound internet works through the NAT instance
- **WHEN** the LangChain agent in the web Lambda calls NVIDIA NIM
- **THEN** the request egresses via the NAT-EC2 instance (if the Lambda is VPC-attached) or directly (if not) and reaches the NVIDIA endpoint

#### Scenario: NAT failure triggers Auto Scaling replacement
- **WHEN** the NAT-EC2 instance crashes or is terminated
- **THEN** the Auto Scaling Group (managed by SST) replaces it within minutes; outbound from private subnets resumes

### Requirement: Cross-service URLs and credentials are wired via SST link / Secret

SST's `link: [...]` API SHALL inject cross-component URLs and credentials at deploy time. Sensitive values (`BetterAuthSecret`, `AiApiKey`, `WpGraphqlServiceToken`, `GoogleClientId`, `GoogleClientSecret`) SHALL be `sst.Secret` instances stored in SSM Parameter Store and decrypted at runtime per Service IAM role. Non-sensitive cross-service URLs (e.g., `GATEWAY_URL`, `USERS_SUBGRAPH_URL`, `MCP_SERVER_URL`, `WP_GRAPHQL_URL`, the two `DATABASE_URL` strings) SHALL flow through `Linkable.env()` automatically — they MUST NOT be secrets.

#### Scenario: Each Service sees only the env vars it links
- **WHEN** the gateway task boots
- **THEN** `process.env.USERS_SUBGRAPH_URL` and `process.env.WP_GRAPHQL_URL` are set; `BetterAuthSecret` is NOT set on the gateway because the gateway does not link it

#### Scenario: Missing secret fails fast at deploy time
- **WHEN** the operator runs `sst deploy --stage prod` without first running `sst secret set BetterAuthSecret <value>`
- **THEN** SST reports a missing-secret error before any AWS resource is touched

### Requirement: 5 secrets cover the full sensitive surface

The sst.config SHALL declare exactly 5 `sst.Secret` instances:

| Secret name | Set on | Consumed by |
|---|---|---|
| `BetterAuthSecret` | first deploy | users-subgraph (BETTER_AUTH_SECRET) |
| `AiApiKey` | first deploy | web (AI_API_KEY) |
| `WpGraphqlServiceToken` | second deploy (after WP boots) | users-subgraph, mcp-server (forwarded), web (forwarded by route handler) |
| `GoogleClientId` | first deploy | users-subgraph (GOOGLE_CLIENT_ID) |
| `GoogleClientSecret` | first deploy | users-subgraph (GOOGLE_CLIENT_SECRET) |

Operators SHALL set all 5 via `sst secret set <name> <value>` before any deploy that depends on them.

#### Scenario: Two-phase deploy for the WP service-account JWT
- **WHEN** the operator does the first deploy with `WpGraphqlServiceToken` set to a placeholder
- **THEN** WordPress boots, the operator mints a JWT via `wp jwt-auth-token issue desafio-svc` inside the running task, runs `sst secret set WpGraphqlServiceToken <jwt>`, and re-runs `sst deploy --stage prod`; the second deploy applies the new token to users-subgraph and mcp-server

### Requirement: DEPLOY.md provides a complete operator runbook

The repo SHALL contain a top-level `DEPLOY.md` that walks an operator from a clean machine to a working public demo URL. It SHALL cover: AWS credentials setup, the 5 `sst secret set` commands (including the two-phase WP token flow), `sst deploy --stage prod`, where to find the deploy outputs, how to run the two backfill scripts against the deployed stack, the documented cold-start UX caveat, and the `sst remove --stage prod` teardown command.

#### Scenario: New operator can deploy without context
- **WHEN** a new operator follows DEPLOY.md from top to bottom
- **THEN** the demo is reachable at the printed CloudFront URL within ~30 minutes of starting (most of the time spent waiting for Aurora + EFS provisioning)

#### Scenario: DEPLOY.md flags the cold-start caveat
- **WHEN** the operator reads the runbook
- **THEN** they see a clear warning that the first request after idle pays a ~30s Aurora cold start, with the mitigation (pin min ACU = 0.5) called out
