import { Logger } from '@nestjs/common';
import type { BetterAuthOptions, DBAdapter } from 'better-auth';
import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import { lookupWpUserIdByEmail } from './wp-user-lookup';

export interface BetterAuthConfig {
  secret: string;
  baseUrl: string;
  basePath: string;
  trustedOrigins: string[];
  googleClientId: string | undefined;
  googleClientSecret: string | undefined;
  wpGraphqlUrl: string | undefined;
  wpServiceToken: string | undefined;
  pgPool: Pool | undefined;
}

export function initAuth(
  config: BetterAuthConfig,
  adapter: DBAdapter | ((options: BetterAuthOptions) => DBAdapter),
) {
  const logger = new Logger('BetterAuth');

  return betterAuth({
    basePath: config.basePath,
    baseURL: config.baseUrl,
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    database: adapter,
    logger: {
      disabled: false,
      log(level, message, ...args) {
        const fn = (logger as any)[level] as ((msg: string, ...a: unknown[]) => void) | undefined;
        fn?.call(logger, message, ...args);
      },
    },
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      google: {
        clientId: config.googleClientId || '',
        clientSecret: config.googleClientSecret || '',
        enabled: !!config.googleClientId,
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            if (!config.wpGraphqlUrl || !config.wpServiceToken || !config.pgPool) return;
            try {
              const databaseId = await lookupWpUserIdByEmail(user.email, {
                url: config.wpGraphqlUrl,
                token: config.wpServiceToken,
              });
              if (databaseId === null) return;
              await config.pgPool.query('UPDATE "user" SET wp_user_id = $1 WHERE id = $2', [
                databaseId,
                user.id,
              ]);
              logger.log(`Linked ${user.email} → WP databaseId ${databaseId}`);
            } catch (err) {
              logger.warn(`Failed to link ${user.email}: ${(err as Error).message}`);
            }
          },
        },
      },
    },
  });
}

export type BetterAuth = ReturnType<typeof initAuth>;
