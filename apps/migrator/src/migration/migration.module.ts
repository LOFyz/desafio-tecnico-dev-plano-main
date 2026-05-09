import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { ConfigService } from '@nestjs/config';
import { Migrator } from '@mikro-orm/migrations';
import {
  createMikroOrmOptions,
  Migration20260508_BetterAuthSchema,
  Migration20260509_AddWpUserId,
} from '@desafio/db';
import {
  UserEntitySchema,
  SessionEntitySchema,
  AccountEntitySchema,
  VerificationEntitySchema,
} from '@desafio/users-infrastructure';
import { MigrationService } from './migration.service';

export const UsersInfrastructureEntities = [
  UserEntitySchema,
  SessionEntitySchema,
  AccountEntitySchema,
  VerificationEntitySchema,
];

@Module({
  imports: [
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      useFactory: (config: ConfigService) => ({
        ...createMikroOrmOptions(config),
        entities: UsersInfrastructureEntities,
        entitiesTs: [],
        extensions: [Migrator],
        discovery: { disableDynamicFileAccess: true },
        migrations: {
          migrationsList: [
            {
              name: 'Migration20260508_BetterAuthSchema',
              class: Migration20260508_BetterAuthSchema,
            },
            {
              name: 'Migration20260509_AddWpUserId',
              class: Migration20260509_AddWpUserId,
            },
          ],
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [MigrationService],
})
export class MigrationModule {}
