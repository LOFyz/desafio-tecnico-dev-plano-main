import type { FactoryProvider } from '@nestjs/common';
import { ConfigurableModuleBuilder } from '@nestjs/common';
import type { BetterAuthOptions, DBAdapter } from 'better-auth';
import type { BetterAuthConfig } from '../init-auth';
import { initAuth } from '../init-auth';
import { BETTER_AUTH_DATABASE_ADAPTER_TOKEN } from './auth-database-kysely.factory';

export const BETTER_AUTH_TOKEN = 'BETTER_AUTH';
export const BETTER_AUTH_CONFIG_TOKEN = 'BETTER_AUTH_CONFIG';

export const {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN,
  ASYNC_OPTIONS_TYPE,
  OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<Record<string, never>>()
  .setClassMethodName('forRoot')
  .build();

export const BetterAuthFactory = {
  provide: BETTER_AUTH_TOKEN,
  useFactory(
    config: BetterAuthConfig,
    adapter: DBAdapter | ((options: BetterAuthOptions) => DBAdapter),
  ) {
    return initAuth(config, adapter);
  },
  inject: [BETTER_AUTH_CONFIG_TOKEN, BETTER_AUTH_DATABASE_ADAPTER_TOKEN],
} satisfies FactoryProvider;
