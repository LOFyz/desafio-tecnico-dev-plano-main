## Context

The application is a 5-process stack (Apollo Federation gateway, users-subgraph, mcp-server, Next.js web, headless WordPress) plus two databases (Postgres for Better Auth, MySQL for WordPress). Today it only runs locally via `scripts/serve-prod.sh`. The deployment target is AWS via SST v3 (Ion); the goal is the cheapest viable demo URL set, not a hardened production rollout. The challenge brief explicitly mentions SST as the deployment story.

## Goals / Non-Goals

**Goals:**

- A single `sst deploy --stage prod` (after `sst secret set` for the 5 secrets) brings the entire stack up on AWS.
- Total cost ≤ ~$100/mo at idle.
- The four federated services + the web app each get a public URL (CloudFront for web, ALB for the externally-reachable Services). Users-subgraph stays VPC-internal.
- The Better Auth ↔ WP user bridge keeps working: signup hook reaches WP via service discovery; backfill scripts can target the deployed URLs.
- The MCP server's HTTP+SSE transport works (i.e., we don't accidentally route it through Lambda where the 15-min cap and 30s API Gateway streaming cap would bite).
- A short `DEPLOY.md` covers the operator's first-deploy and second-deploy paths.

**Non-Goals:**

- No custom domain. The demo runs on the AWS-assigned `*.cloudfront.net` and `*.elb.amazonaws.com` hostnames.
- No multi-stage CI. One `prod` stage; deploys are operator-triggered from a workstation.
- No RDS Proxy, no read replicas, no autoscaling tuning beyond defaults.
- No HA on the NAT path — `nat: "ec2"` is a single instance. Acceptable for a demo.
- No refactor of the Better Auth signup hook (still synchronous to WP). WP min-task = 1 keeps the hop fast in steady state.
- No SST Console / observability rollout beyond CloudWatch defaults.
- No `dev` stage. (The local stack via `scripts/serve-prod.sh` IS the dev environment.)

## Decisions

### Decision 1: Hybrid serverless — Lambda for web, Fargate for the four NestJS / WP services

**Choice:** `sst.aws.Nextjs` (Lambda + CloudFront + S3 via OpenNext) for `apps/web`. `sst.aws.Service` on a shared `sst.aws.Cluster` (Fargate) for `apps/{gateway,users-subgraph,mcp-server}` and the WordPress container.

**Why:**

- Next.js is the canonical OpenNext target; SSR + ISR + image optimization come for free, and the Lambda streaming Function URL handles the route handler at `/api/blog-copilot/run` without the API Gateway 30s streaming cap.
- The three NestJS apps run a long-lived HTTP server (Apollo Federation, MCP HTTP+SSE). Wrapping a long-lived Express in Lambda is awkward and the SSE on `mcp-server` would bump straight into Lambda's 15-min hard cap. Fargate is the right primitive.
- WordPress is a stateful PHP app with a filesystem (`wp-content`). It must run as a long-lived container with persistent storage. EFS-backed Fargate is the standard pattern.

**Alternatives considered:**

- *All-Lambda*: would force us to rewrite the MCP server's transport (no SSE), would fight Apollo Gateway's startup composition cost on cold starts, and still wouldn't host WordPress. Rejected.
- *All-Fargate including web*: doable, but loses CloudFront + S3 + image optimization for free. Adds ALB cost for the web app. Rejected.

### Decision 2: Single VPC with NAT-on-EC2

**Choice:** One `sst.aws.Vpc("Vpc", { nat: "ec2" })` shared across the cluster, both Auroras, and the EFS filesystem. NAT-on-EC2 instead of the default NAT Gateway.

**Why:** NAT Gateway is ~$32/mo per AZ baseline; NAT-on-EC2 is a t3.nano (~$3-4/mo). For a demo, the SPOF and lack of HA on the NAT instance is acceptable. SST recommends `nat: "ec2"` for cost-conscious deployments.

**Trade-off:** if the NAT instance crashes, outbound internet from private subnets stops until SST/Auto Scaling replaces it (typically minutes). The federated graph itself keeps working since Apollo composition is intra-VPC. The agent's call to NVIDIA NIM stops working until NAT recovers. **Acceptable for v1.**

### Decision 3: Aurora Serverless v2 (postgres + mysql) with min ACU = 0

**Choice:** Two `sst.aws.Aurora` instances — one `engine: "postgres"` for Better Auth, one `engine: "mysql"` for WordPress. Both with `scaling: { min: "0 ACU", max: "1 ACU" }`.

**Why:** Aurora Serverless v2 with min ACU = 0 means we pay storage only (~$0.10/GB-month) when idle. First request after idle pays a ~30s cold start to scale up. For a demo where idle is the steady state, this is the cheapest option that doesn't sacrifice the "real RDS" semantics MikroORM and WordPress expect.

**Trade-off:** WordPress is more sensitive to DB cold-start than the federated graph because it pre-loads many plugins on each request. We could pin the WP DB to min ACU = 0.5 (~$43/mo) if cold starts become a UX problem. Start at 0; reassess after first demo run.

**Alternatives considered:**

- *RDS Postgres `db.t4g.micro`*: ~$14/mo always-on. Cheaper than Aurora at idle, but doesn't scale and lacks the auto-pause story. Aurora's flexibility wins for a demo that might briefly see real traffic.
- *Neon / Supabase external*: pulls Postgres outside the VPC, requires public-internet hops and SSL config. Rejected.

### Decision 4: ALBs only on the externally-reachable Services; users-subgraph is VPC-internal

**Choice:** `gateway`, `mcp-server`, and `wordpress` get `loadBalancer: { ports: [...] }`. `users-subgraph` doesn't — it gets `serviceConnect`-style discovery only. The gateway reaches it via `users-subgraph.<cluster-namespace>:3001` from inside the VPC.

**Why:** ALBs cost ~$16/mo each. Avoiding the unnecessary one for users-subgraph saves $16/mo with no behavioral cost (nothing outside the VPC ever needs to call users-subgraph directly — even Better Auth's REST handler is reached via the web app's `/api/auth/*` rewrite, which proxies through... actually the web app proxies to `BETTER_AUTH_URL`. We need to expose Better Auth somehow.).

**Caveat to resolve at implementation time:** `apps/web/src/lib/auth/client.ts` calls `BETTER_AUTH_URL` directly from the browser via the `/api/auth/*` rewrite. If `users-subgraph` stays VPC-internal, the rewrite has no upstream to point at. **Resolution:** keep users-subgraph VPC-internal but ALSO expose its `/auth/**` paths via an ALB listener rule on the **gateway**'s ALB (path-based routing: `/auth/*` → users-subgraph, `/graphql` → gateway). One ALB, two upstreams. Or — simpler — give users-subgraph its own ALB after all, accepting the $16/mo. **For v1, simpler wins.** Update plan: users-subgraph **does** get an ALB.

### Decision 5: Cross-service URLs via `sst.Linkable`, secrets via `sst.Secret`

**Choice:** Every Service and the Nextjs declare `link: [...]` listing the other components they need URLs/credentials for. `sst.Secret` holds the 5 sensitive values; non-sensitive cross-service URLs flow through `Linkable.env()` automatically.

**Why:** SST's link API generates env vars at deploy time with the right shape per component. We don't have to duplicate URL knowledge across components. Secrets are stored in SSM Parameter Store and decrypted at runtime per service IAM role.

**The 5 secrets:**

| Secret | Used by | Notes |
|---|---|---|
| `BetterAuthSecret` | users-subgraph | Replaces `BETTER_AUTH_SECRET` |
| `AiApiKey` | web (route handler) | NVIDIA NIM key (or OpenAI/Anthropic per `AI_PROVIDER`) |
| `WpGraphqlServiceToken` | users-subgraph, mcp-server, web (no direct usage but tools forward it) | Service-account JWT minted from WP's `desafio-svc` user |
| `GoogleClientId` | users-subgraph | Better Auth Google OAuth |
| `GoogleClientSecret` | users-subgraph | Better Auth Google OAuth |

### Decision 6: Bake `wp-graphql-federations` into the WP image

**Choice:** Modify `docker/wordpress/Dockerfile` to `COPY plugins/wp-graphql-federations/ /usr/src/wp-graphql-federations/`, then tweak `docker-entrypoint-custom.sh` to `cp -r` it into `/var/www/html/wp-content/plugins/` on first boot if not already present (the existing entrypoint already activates it once present).

**Why:** the local dev workflow uses a docker-compose bind mount, but Fargate has no equivalent. The image must self-contain the plugin. The existing `install_plugin_from_git` in the entrypoint becomes a fallback for the upstream version that's never used in the deployed path.

**Trade-off:** any change to the plugin's PHP requires rebuilding and pushing the WP image. Acceptable — we don't iterate on PHP often and SST handles the image build/push automatically.

### Decision 7: WordPress min task = 1; the others can scale-to-zero on Spot

**Choice:** `wordpress` Service: `scaling: { min: 1, max: 1, spot: false }`. Others: `scaling: { min: 0, max: 1, spot: true }`.

**Why:** the Better Auth signup hook does a synchronous fetch to WP. If WP is cold (task scaled to 0 takes ~1 minute to bring up), signup blocks for that minute. Pinning WP to min 1 task keeps signup snappy. The other three services tolerate cold starts (gateway re-composes on first request, mcp-server has its own startup probe to gateway, web is independent — Lambda handles that).

**Trade-off:** WP-on-Fargate min-1 = ~$13/mo for the task (Spot would halve but is risky for stateful workloads). Acceptable.

## Risks / Trade-offs

- **Risk:** OpenNext doesn't yet have a stamped-in compatibility entry for Next 16 (matrix tops out at 15.3.2); behavior on the latest minor is "should work". → **Mitigation:** if the deploy fails, pin to Next 15.3.2 + OpenNext 3.6.2 as a known-good combo. The codegen + build are quick to re-run on a downgrade.

- **Risk:** Aurora cold start (~30s) on the first hit after idle creates a poor first-impression demo experience. → **Mitigation:** the README warns about it; if it becomes a problem, pin postgres to min ACU = 0.5 (~$43/mo). Aurora MySQL stays at 0 for now since WP requests don't hit it directly until the user lands on `/blog`.

- **Risk:** NAT-on-EC2 SPOF — if the instance crashes, anything calling the public internet from a private subnet (LangChain → NVIDIA NIM, WP → external plugin updaters) stalls. → **Mitigation:** SST/AutoScaling restarts the NAT instance in minutes. v2 can switch to NAT Gateway HA if uptime matters.

- **Risk:** WP container image build time on first deploy is slow (~10-15min for the WordPress base + plugin clones). → **Mitigation:** documented in `DEPLOY.md`. Subsequent deploys are fast (image layer caching).

- **Risk:** `docker compose` workflow for local dev still uses the bind mount; if a developer edits the plugin locally they get instant feedback locally but the deploy uses a baked-in copy. The two could drift. → **Mitigation:** `DEPLOY.md` mentions that iterating on PHP requires `sst deploy` to roll the image. The local bind mount stays unchanged for fast inner-loop dev.

- **Risk:** the EFS filesystem is regional; cross-AZ writes are slower than local disk. WordPress writes are infrequent (mostly reads after install) so impact should be minimal. → **No mitigation needed for v1.**

- **Risk:** `sst dev` (the local development server) is NOT in scope for v1 — we keep `scripts/serve-prod.sh` as the dev workflow. If we later want SST live-edit, the config we ship works; we just haven't run `sst dev` against it. → **No mitigation; explicit non-goal.**

- **Trade-off:** AWS-assigned hostnames (`d12345.cloudfront.net`) are ugly and change per stage. Demo links will look unprofessional. Custom domain is a v2 concern explicitly deferred.

## Migration Plan

This is a green-field deploy — no existing AWS infrastructure to migrate from. Steps for the operator (mirrored in `DEPLOY.md`):

1. `aws configure` (or set `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` env vars).
2. `pnpm install` (picks up new SST devDeps).
3. `sst secret set BetterAuthSecret <random-32-bytes>`.
4. `sst secret set AiApiKey <nvidia-nim-key>`.
5. `sst secret set WpGraphqlServiceToken <jwt-minted-from-wp-after-first-deploy>`. *(see runbook — chicken-and-egg: WP must boot once for the token to exist; first deploy uses a placeholder, then we mint and re-deploy.)*
6. `sst secret set GoogleClientId <oauth-id>` / `sst secret set GoogleClientSecret <oauth-secret>`.
7. `sst deploy --stage prod`. Wait ~15-25 min for first run (Aurora + EFS provisioning is the slow bit).
8. Read the deploy outputs: `web` → CloudFront URL; `gateway`, `mcp-server`, `wordpress` → ALB URLs.
9. Set `WpGraphqlServiceToken` from inside the running WP (CLI: `wp jwt-auth-token issue admin`), then `sst deploy --stage prod` again to apply the token to users-subgraph.
10. Run the two backfill scripts against the deployed Postgres + WP, pointing at the deployed hostnames.
11. Visit the CloudFront URL.

**Rollback:** `sst remove --stage prod` tears everything down. Aurora data is lost unless the operator takes a snapshot first (the runbook calls this out).

## Open Questions

- Do we want to expose the gateway's `/graphql` publicly, or fronted by CloudFront? CloudFront in front of the ALB adds caching + DDoS protection but costs ~$1/mo + traffic. **Default for v1: bare ALB; revisit if abuse appears.**
- Should `mcp-server`'s ALB be public at all? Currently the only consumer is the web app's route handler (server-side), so the ALB could be `internal: true`. **But** SST's Nextjs component runs in Lambda, not in our VPC by default. We either (a) put the Nextjs Lambda in the VPC (slows cold start, locks us into NAT-EC2 stability), or (b) keep mcp-server's ALB public. **Default for v1: public ALB on mcp-server, accept that anyone can hit it but auth is enforced by the agent (no LLM call without a session cookie that the gateway validates downstream).** Worth revisiting.
- Confirm `sst secret set` works for the 5 names used here (case sensitivity, no surprise reserved names). **Verify on first run.**
