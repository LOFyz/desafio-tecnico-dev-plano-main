# Deploying to AWS via SST

End-to-end runbook to take this repo from a clean machine to a public demo
URL on AWS using [SST v4 (Ion)](https://sst.dev). Targets the "Shape A" cost
profile from [openspec/changes/archive/2026-05-09-deploy-sst-aws/design.md](openspec/changes/archive/2026-05-09-deploy-sst-aws/design.md):
~$75–100/mo idle, no custom domain, single `prod` stage, scale-to-zero
where possible.

## Prerequisites

- AWS account + IAM user with admin (or a more constrained role with
  permissions for VPC, ECS, EFS, RDS Aurora, ALB, CloudFront, S3, Lambda,
  IAM role creation, ECR push). [SST IAM docs](https://sst.dev/docs/iam-credentials/).
- `aws configure` complete (or `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
  exported). Region: `us-east-1` (the default in `sst.config.ts`).
- Docker daemon running locally — SST builds the four container images
  (`apps/{gateway,users-subgraph,mcp-server}/Dockerfile` + `docker/wordpress/Dockerfile`)
  and pushes them to ECR during the deploy.
- Node 24 + `pnpm` installed.
- An NVIDIA NIM API key from <https://build.nvidia.com/settings/api-keys>
  (free tier is enough for the demo).
- Google OAuth client (id + secret) from <https://console.cloud.google.com/apis/credentials>.
  Pin redirect URIs to `https://*.elb.amazonaws.com/auth/callback/google`
  AFTER the first deploy when you know the actual users-subgraph ALB host;
  for v1 you can also leave Google sign-in disabled and only use
  email/password.

## First deploy (one-time setup)

### 1. Install workspace deps

```bash
pnpm install
```

This pulls in `sst@^4` and `@opennextjs/aws@^4` along with the rest.

### 2. Set the 5 secrets

```bash
pnpm exec sst secret set BetterAuthSecret      "$(openssl rand -hex 32)"   --stage prod
pnpm exec sst secret set AiApiKey              "<your-nvidia-nim-key>"     --stage prod
pnpm exec sst secret set GoogleClientId        "<google-oauth-client-id>"  --stage prod
pnpm exec sst secret set GoogleClientSecret    "<google-oauth-secret>"     --stage prod
# Placeholder for the WP service-account JWT — the real value is minted
# AFTER WP boots in step 4. Any non-empty string is fine here.
pnpm exec sst secret set WpGraphqlServiceToken "placeholder-rotate-after-first-deploy" --stage prod
```

> Secret names are case-sensitive and must match the constructor names in
> `sst.config.ts` (`BetterAuthSecret`, `AiApiKey`, etc.).

### 3. Deploy

```bash
pnpm exec sst deploy --stage prod
```

Expect ~15–25 minutes for the first deploy (most of it is Aurora and EFS
provisioning + Docker image push to ECR). On success SST prints the
five stage outputs:

```
↳ web            → https://<id>.cloudfront.net
↳ gateway        → http://<gateway-alb>.<region>.elb.amazonaws.com
↳ usersSubgraph  → http://<users-alb>.<region>.elb.amazonaws.com
↳ mcpServer      → http://<mcp-alb>.<region>.elb.amazonaws.com
↳ wordpress      → http://<wp-alb>.<region>.elb.amazonaws.com
```

### 4. Mint the WP service-account JWT and re-deploy

The synchronous Better Auth signup hook + the LangChain agent's tools
both call WP with this token. Mint it once after the WP container has
finished its first-boot install (the entrypoint provisions the
`desafio-svc` admin user automatically):

```bash
# Find the running WP task ARN
TASK=$(aws ecs list-tasks --cluster desafio-prod-Cluster --service-name desafio-prod-Wordpress --query 'taskArns[0]' --output text)

# Exec into it and mint a long-lived JWT
aws ecs execute-command \
  --cluster desafio-prod-Cluster \
  --task "$TASK" \
  --container Wordpress \
  --interactive \
  --command "wp jwt-auth-token issue desafio-svc --allow-root"
# → copy the printed JWT
```

Then plug it in and redeploy:

```bash
pnpm exec sst secret set WpGraphqlServiceToken "<the-jwt>" --stage prod
pnpm exec sst deploy --stage prod
```

This re-rolls the users-subgraph and mcp-server tasks with the real token.

### 5. Backfill the Better Auth ↔ WP bridge

If you signed up any users between steps 3 and 4 they may not be linked
yet. Run both backfill scripts pointing at the deployed Postgres + WP:

```bash
WP_GRAPHQL_URL="<wordpress-url>/graphql" \
WP_GRAPHQL_SERVICE_TOKEN="<the-jwt>" \
PG_CONTAINER="" \
DATABASE_URL="postgresql://<user>:<password>@<aurora-host>:5432/<db>" \
  ./scripts/backfill-wp-user-ids.sh

# Same env, different direction
WP_GRAPHQL_URL="<wordpress-url>/graphql" \
WP_GRAPHQL_SERVICE_TOKEN="<the-jwt>" \
DATABASE_URL="postgresql://<user>:<password>@<aurora-host>:5432/<db>" \
  ./scripts/backfill-app-user-ids.sh
```

> The current backfill scripts shell into a local Postgres docker container.
> For the deployed Aurora you'll need to either (a) tunnel via SSM/EC2 to
> the VPC and run the script with `psql` against Aurora, or (b) port-forward
> Aurora locally with `aws ssm start-session` then point `DATABASE_URL` at
> `localhost`. Adjust `PG_CONTAINER` to empty (skip docker exec) and run
> `psql` directly against `DATABASE_URL`. Update path documented in v2.

### 6. Open the demo

Visit the `web` URL printed in step 3. Sign up, then visit `/blog` and
`/blog-copilot`. The first request after idle pays a ~30s Aurora cold
start (see "Known v1 limitations" below).

## Subsequent deploys

After the first-deploy choreography:

```bash
pnpm exec sst deploy --stage prod
```

SST diffs against the deployed state and only rolls what changed. Code
changes to a single Service rebuild only that image. Schema or config
changes to `sst.config.ts` show up as resource diffs in the deploy plan.

## Teardown

```bash
pnpm exec sst remove --stage prod
```

> ⚠️ This deletes the Auroras. **Take a snapshot first** if you want to
> keep any data:
>
> ```bash
> aws rds create-db-cluster-snapshot --db-cluster-identifier <cluster-id> --db-cluster-snapshot-identifier <snap-name>
> ```
>
> The `removal: input?.stage === 'prod' ? 'retain' : 'remove'` in
> `sst.config.ts` keeps Aurora storage on `sst remove` for `prod`, but
> the cluster handle is dropped — re-attaching takes manual steps.

## Cost estimate

Idle (~$75–100/mo, varies by region):

| Resource | Idle | Notes |
|---|---|---|
| NAT-on-EC2 (t3.nano) | ~$3 | SPOF — Auto Scaling restarts on crash |
| ALB ×4 | ~$64 | $16/mo each: gateway, users, mcp, wordpress |
| Fargate Spot tasks (3 × 0.25 vCPU + 0.5 GB) | ~$3 | Only when in use |
| Fargate on-demand (WP, 0.5 vCPU + 1 GB, min 1) | ~$13 | Always on |
| Aurora SLS v2 storage (postgres + mysql) | ~$1 | Storage only when scaled to 0 |
| EFS (wp-content) | ~$0.30 | <10 GB typical |
| CloudFront + S3 | <$1 | Demo traffic |
| Lambda (Next.js server + image opt + ISR) | <$1 | Demo traffic |
| Data transfer | varies | NAT egress + CloudFront |
| **Total idle** | **~$85** | |

Hot (active demo traffic): add ~$5–15/mo for Aurora ACUs + Fargate spike
+ data transfer.

## Known v1 limitations

- **AWS-assigned hostnames**. CloudFront and ALB give ugly URLs that change
  per stage and per re-create. Custom domain via Route 53 + ACM is a v2
  follow-up; the wiring lives in the SST `domain` prop on `sst.aws.Nextjs`
  and `loadBalancer.ports[*].customDomain` on each Service.

- **Aurora cold start**. First request after >5 min of idle pays ~30s while
  the Aurora cluster scales from 0 to 0.5 ACU. Mitigation: pin the postgres
  Aurora to `min: "0.5 ACU"` (~$43/mo) once cold-start UX matters.

- **NAT-on-EC2 SPOF**. The NAT instance is a single t3.nano. If it crashes,
  outbound internet from private subnets stops until SST/Auto Scaling
  replaces it (typically minutes). The federated graph itself keeps working
  (intra-VPC); the LangChain → NVIDIA call breaks. v2: switch to NAT
  Gateway HA (~$32/mo per AZ) for production uptime.

- **`BETTER_AUTH_TRUSTED_ORIGINS` is permissive in v1**. The config sets it
  to `https://*.cloudfront.net,https://*.elb.amazonaws.com` to handle the
  chicken-and-egg of the deployed URL not being known until after the
  Service is up. For production, add a 6th secret `BetterAuthTrustedOrigins`
  set to the exact deployed `web` URL after first deploy.

- **`BETTER_AUTH_URL` is unset**. Better Auth derives `baseURL` from the
  request when unset, which is correct behind the ALB but means error logs
  and OAuth callback URLs will use the request's host. For Google OAuth
  you'll need to register the actual ALB hostname as a redirect URI after
  first deploy.

- **WP `GRAPHQL_JWT_AUTH_SECRET_KEY` is hardcoded** in `sst.config.ts` for
  the demo. Rotate via a 6th secret if this stack survives past v1.

- **The two backfill scripts assume local Postgres docker** today (they
  `docker exec` into a container). To run against deployed Aurora, see step
  5 above for the workaround. Cleaning the scripts up to take a
  `DATABASE_URL` directly is a v2 polish.

- **`sst dev` is not in scope**. The local dev workflow stays
  `scripts/serve-prod.sh` (or `pnpm nx dev`). The SST config we ship is
  deploy-only.

- **Multi-stage deploys**. Only `prod` is supported in v1. Adding `dev`
  later is just `sst secret set ... --stage dev` + `sst deploy --stage dev`
  with separate AWS resources per stage.
