import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import type { BetterAuthConfig } from '../init-auth';
import { BETTER_AUTH_CONFIG_TOKEN } from './better-auth.factory';

let sharedPool: Pool | undefined;

function getPgPool(config: ConfigService): Pool {
  if (!sharedPool) {
    sharedPool = new Pool({
      host: config.getOrThrow<string>('DB_HOST'),
      port: Number(config.getOrThrow<string>('DB_PORT')),
      database: config.getOrThrow<string>('DB_NAME'),
      user: config.getOrThrow<string>('DB_USER'),
      password: config.getOrThrow<string>('DB_PASSWORD'),
    });
  }
  return sharedPool;
}

export const BetterAuthConfigFactory = {
  provide: BETTER_AUTH_CONFIG_TOKEN,
  useFactory(config: ConfigService): BetterAuthConfig {
    const secret = config.get<string>('BETTER_AUTH_SECRET');
    if (!secret) throw new Error('BETTER_AUTH_SECRET is required');
    const trustedOriginsRaw =
      config.get<string>('BETTER_AUTH_TRUSTED_ORIGINS') ?? '';
    const trustedOrigins = trustedOriginsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      secret,
      baseUrl: config.get<string>('BETTER_AUTH_URL') ?? 'http://localhost:3001',
      basePath: config.get<string>('BETTER_AUTH_BASE_PATH') ?? '/auth',
      trustedOrigins,
      googleClientId: config.get<string>('GOOGLE_CLIENT_ID'),
      googleClientSecret: config.get<string>('GOOGLE_CLIENT_SECRET'),
      wpGraphqlUrl:
        config.get<string>('WP_GRAPHQL_URL') ??
        config.get<string>('POSTS_SUBGRAPH_URL') ??
        'http://localhost:8080/graphql',
      wpServiceToken: config.get<string>('WP_GRAPHQL_SERVICE_TOKEN'),
      pgPool: getPgPool(config),
    };
  },
  inject: [ConfigService],
} satisfies FactoryProvider;
