/// <reference path="./.sst/platform/src/global.d.ts" />
/// <reference path="./.sst/platform/src/internal.d.ts" />

/**
 * SST v4 (Ion) deployment for the federated stack.
 *
 * Topology:
 *   - 1 VPC, NAT-on-EC2 (single instance, ~$3/mo vs ~$32/mo NAT Gateway)
 *   - 1 ECS cluster (Fargate)
 *   - 2 Aurora Serverless v2 clusters (postgres + mysql), both scale-to-zero
 *   - 1 EFS filesystem (WordPress wp-content)
 *   - 4 Services on the cluster:
 *       wordpress      (min 1, on-demand, EFS-mounted, ALB :80)
 *       users-subgraph (min 0, spot, ALB :3001)
 *       gateway        (min 0, spot, ALB :3000, links users + wordpress)
 *       mcp-server     (min 0, spot, ALB :4000, links gateway)
 *   - 1 Nextjs (web) on Lambda + CloudFront, links the Services + secrets
 *   - 5 Secrets: BetterAuthSecret, AiApiKey, WpGraphqlServiceToken,
 *                GoogleClientId, GoogleClientSecret
 *
 * See DEPLOY.md for the operator runbook.
 */
export default $config({
  app(input) {
    return {
      name: 'desafio',
      region: 'us-east-1',
      home: 'aws',
      removal: input?.stage === 'prod' ? 'retain' : 'remove',
    };
  },

  async run() {
    // ---- Infrastructure: VPC, cluster, databases, EFS ----

    const vpc = new sst.aws.Vpc('Vpc', { nat: 'ec2' });
    const cluster = new sst.aws.Cluster('Cluster', { vpc });

    const postgres = new sst.aws.Aurora('Postgres', {
      engine: 'postgres',
      vpc,
      scaling: { min: '0 ACU', max: '1 ACU' },
    });

    const mysql = new sst.aws.Aurora('Mysql', {
      engine: 'mysql',
      vpc,
      scaling: { min: '0 ACU', max: '1 ACU' },
    });

    const wpContent = new sst.aws.Efs('WpContent', { vpc });

    // ---- Secrets (5, no more) ----

    const secrets = {
      betterAuthSecret: new sst.Secret('BetterAuthSecret'),
      aiApiKey: new sst.Secret('AiApiKey'),
      wpGraphqlServiceToken: new sst.Secret('WpGraphqlServiceToken'),
      googleClientId: new sst.Secret('GoogleClientId'),
      googleClientSecret: new sst.Secret('GoogleClientSecret'),
    };

    // Shared transform applied to every Service so the Fargate task lands
    // in the VPC's PRIVATE subnets (with `assignPublicIp: false`). SST's
    // default subnet selection picks PUBLIC subnets; combined with
    // assignPublicIp:false the task has no internet egress and ECR pulls
    // time out. Private subnets route 0.0.0.0/0 through the NAT-EC2
    // instances.
    const useFargatePrivateSubnets = (extra?: { launchType?: 'FARGATE' }) => ({
      service: (args: any) => {
        args.networkConfiguration = {
          ...(args.networkConfiguration ?? {}),
          assignPublicIp: false,
          subnets: vpc.privateSubnets,
        };
        if (extra?.launchType) args.launchType = extra.launchType;
        return undefined;
      },
    });

    // ---- WordPress ----
    //
    // Always-on (min/max=1, no Spot) so the synchronous Better Auth signup
    // hook never blocks on a cold start. EFS mount keeps wp-content
    // (uploads + admin-installed plugins) durable across task restarts.
    const wordpress = new sst.aws.Service('Wordpress', {
      cluster,
      image: { context: 'docker/wordpress', dockerfile: 'Dockerfile' },
      scaling: { min: 1, max: 1 },
      capacity: 'on-demand',
      cpu: '0.5 vCPU',
      memory: '1 GB',
      loadBalancer: {
        ports: [{ listen: '80/http', forward: '80/http' }],
      },
      volumes: [
        { efs: wpContent, path: '/var/www/html/wp-content' },
      ],
      // EFS-mounted Fargate tasks must live in private subnets (the EFS
      // mount targets are private-only) and must NOT request a public IP
      // (assignPublicIp + EFS triggers
      // "Assign public IP is not supported for this launch type"). NAT-EC2
      // handles egress from private subnets so the WP container can still
      // reach external plugin updaters / wp.org.
      transform: useFargatePrivateSubnets({ launchType: 'FARGATE' }),
      link: [mysql],
      environment: {
        WORDPRESS_DB_HOST: $interpolate`${mysql.host}:${mysql.port}`,
        WORDPRESS_DB_USER: mysql.username,
        WORDPRESS_DB_PASSWORD: mysql.password,
        WORDPRESS_DB_NAME: mysql.database,
        WORDPRESS_CONFIG_EXTRA: [
          "define('GRAPHQL_DEBUG', true);",
          "define('WP_ENVIRONMENT_TYPE', 'production');",
          // Static dev key — fine for the demo. Rotate via the Dockerfile
          // ENV or move to a 6th secret if this stack survives past the demo.
          "define('GRAPHQL_JWT_AUTH_SECRET_KEY', 'desafio-jwt-secret-change-in-prod');",
        ].join('\n'),
      },
    });

    // ---- users-subgraph (Better Auth + me query, VPC-internal logic but
    // ALB-exposed because the web app's /api/auth/* rewrite proxies to it) ----

    const usersSubgraph = new sst.aws.Service('UsersSubgraph', {
      cluster,
      image: { context: '.', dockerfile: 'apps/users-subgraph/Dockerfile' },
      scaling: { min: 0, max: 1 },
      capacity: 'spot',
      cpu: '0.25 vCPU',
      memory: '0.5 GB',
      loadBalancer: {
        // ALB listens on 80 externally so `usersSubgraph.url` (which omits
        // an explicit port) resolves at default port 80 from peer services;
        // ALB forwards to the container on its internal port 3001.
        ports: [{ listen: '80/http', forward: '3001/http' }],
      },
      link: [
        postgres,
        secrets.betterAuthSecret,
        secrets.googleClientId,
        secrets.googleClientSecret,
        secrets.wpGraphqlServiceToken,
        wordpress,
      ],
      environment: {
        DB_HOST: postgres.host,
        DB_PORT: postgres.port.apply((p) => String(p)),
        DB_NAME: postgres.database,
        DB_USER: postgres.username,
        DB_PASSWORD: postgres.password,
        DB_SSL: 'true',
        BETTER_AUTH_SECRET: secrets.betterAuthSecret.value,
        BETTER_AUTH_BASE_PATH: '/auth',
        // BETTER_AUTH_URL: omitted on purpose — Better Auth derives baseURL
        // from the incoming request when unset, which is correct behind the
        // ALB. (libs/auth's default `'http://localhost:3001'` is harmless;
        // it's only used in Better Auth's logged error messages.)
        // BETTER_AUTH_TRUSTED_ORIGINS: set permissive for v1 so the
        // CloudFront-hosted web can POST sign-in / sign-up. v2: tighten to
        // the deployed web.url (requires a 6th secret OR a post-deploy
        // re-run; documented in DEPLOY.md).
        BETTER_AUTH_TRUSTED_ORIGINS:
          'https://*.cloudfront.net,https://*.elb.amazonaws.com',
        GOOGLE_CLIENT_ID: secrets.googleClientId.value,
        GOOGLE_CLIENT_SECRET: secrets.googleClientSecret.value,
        WP_GRAPHQL_URL: $interpolate`${wordpress.url}/graphql`,
        WP_GRAPHQL_SERVICE_TOKEN: secrets.wpGraphqlServiceToken.value,
      },
      transform: useFargatePrivateSubnets(),
    });

    // ---- gateway (Apollo Federation router, ALB :3000) ----

    const gateway = new sst.aws.Service('Gateway', {
      cluster,
      image: { context: '.', dockerfile: 'apps/gateway/Dockerfile' },
      scaling: { min: 0, max: 1 },
      capacity: 'spot',
      cpu: '0.25 vCPU',
      memory: '0.5 GB',
      loadBalancer: {
        // Same listen=80, forward=container-port pattern (see UsersSubgraph).
        ports: [{ listen: '80/http', forward: '3000/http' }],
      },
      link: [usersSubgraph, wordpress],
      environment: {
        USERS_SUBGRAPH_URL: $interpolate`${usersSubgraph.url}/graphql`,
        POSTS_SUBGRAPH_URL: $interpolate`${wordpress.url}/graphql`,
      },
      transform: useFargatePrivateSubnets(),
    });

    // ---- mcp-server (HTTP+SSE proxy to the gateway, ALB :4000) ----

    const mcpServer = new sst.aws.Service('McpServer', {
      cluster,
      image: { context: '.', dockerfile: 'apps/mcp-server/Dockerfile' },
      scaling: { min: 0, max: 1 },
      capacity: 'spot',
      cpu: '0.25 vCPU',
      memory: '0.5 GB',
      loadBalancer: {
        // Same listen=80, forward=container-port pattern.
        ports: [{ listen: '80/http', forward: '4000/http' }],
      },
      link: [gateway],
      environment: {
        GATEWAY_URL: $interpolate`${gateway.url}/graphql`,
        MCP_SERVER_PORT: '4000',
        MCP_TRANSPORT: 'http+sse',
      },
      transform: useFargatePrivateSubnets(),
    });

    // ---- web (Next.js on Lambda + CloudFront via OpenNext) ----
    //
    // Links the Services so process.env in the route handler sees the right
    // gateway / auth / mcp URLs. The route handler at /api/blog-copilot/run
    // boots libs/ai's LangChainMcpPostAgent which reads MCP_SERVER_URL +
    // AI_API_KEY + WP_GRAPHQL_SERVICE_TOKEN from env.
    const web = new sst.aws.Nextjs('Web', {
      path: 'apps/web',
      link: [
        gateway,
        usersSubgraph,
        mcpServer,
        secrets.aiApiKey,
        secrets.wpGraphqlServiceToken,
      ],
      environment: {
        NEXT_PUBLIC_GATEWAY_URL: gateway.url,
        NEXT_PUBLIC_AUTH_URL: usersSubgraph.url,
        MCP_SERVER_URL: $interpolate`${mcpServer.url}/mcp`,
        WP_GRAPHQL_SERVICE_TOKEN: secrets.wpGraphqlServiceToken.value,
        AI_PROVIDER: 'nvidia',
        AI_MODEL: 'meta/llama-3.3-70b-instruct',
        AI_API_KEY: secrets.aiApiKey.value,
      },
    });

    // Stage outputs — printed by `sst deploy --stage prod` and saved in
    // .sst/outputs.json for follow-up scripts (backfill, etc.).
    return {
      web: web.url,
      gateway: gateway.url,
      usersSubgraph: usersSubgraph.url,
      mcpServer: mcpServer.url,
      wordpress: wordpress.url,
    };
  },
});
