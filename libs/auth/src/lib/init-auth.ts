import { Logger } from '@nestjs/common';
import type { BetterAuthOptions, DBAdapter } from 'better-auth';
import { betterAuth } from 'better-auth';

export interface BetterAuthConfig {
  secret: string;
  baseUrl: string;
  basePath: string;
  googleClientId: string | undefined;
  googleClientSecret: string | undefined;
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
  });
}

export type BetterAuth = ReturnType<typeof initAuth>;
