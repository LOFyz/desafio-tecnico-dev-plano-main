import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BetterAuthConfig } from '../init-auth';
import { BETTER_AUTH_CONFIG_TOKEN } from './better-auth.factory';

export const BetterAuthConfigFactory = {
  provide: BETTER_AUTH_CONFIG_TOKEN,
  useFactory(config: ConfigService): BetterAuthConfig {
    const secret = config.get<string>('BETTER_AUTH_SECRET');
    if (!secret) throw new Error('BETTER_AUTH_SECRET is required');
    return {
      secret,
      baseUrl: config.get<string>('BETTER_AUTH_URL') ?? 'http://localhost:3001',
      basePath: config.get<string>('BETTER_AUTH_BASE_PATH') ?? '/auth',
      googleClientId: config.get<string>('GOOGLE_CLIENT_ID'),
      googleClientSecret: config.get<string>('GOOGLE_CLIENT_SECRET'),
    };
  },
  inject: [ConfigService],
} satisfies FactoryProvider;
