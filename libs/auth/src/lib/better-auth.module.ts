import { Global, Module } from '@nestjs/common';
import {
  AuthDatabaseKyselyFactory,
  BetterAuthDatabaseAdapterFactory,
} from './providers/auth-database-kysely.factory';
import { BetterAuthConfigFactory } from './providers/better-auth-config.factory';
import {
  BetterAuthFactory,
  ConfigurableModuleClass,
  BETTER_AUTH_TOKEN,
} from './providers/better-auth.factory';

@Global()
@Module({
  providers: [
    AuthDatabaseKyselyFactory,
    BetterAuthDatabaseAdapterFactory,
    BetterAuthConfigFactory,
    BetterAuthFactory,
  ],
  exports: [BETTER_AUTH_TOKEN],
})
export class BetterAuthModule extends ConfigurableModuleClass {}
