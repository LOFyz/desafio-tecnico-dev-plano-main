import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MikroOrmModuleOptions } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';

export function createMikroOrmOptions(config: ConfigService): MikroOrmModuleOptions {
  // Aurora (and most managed Postgres) enforce SSL; local docker-compose
  // postgres doesn't accept SSL. Gate via DB_SSL env var: set to "true"
  // for the SST deploy, leave unset for local.
  const useSsl = config.get<string>('DB_SSL') === 'true';
  return {
    driver: PostgreSqlDriver,
    host: config.getOrThrow<string>('DB_HOST'),
    port: config.getOrThrow<number>('DB_PORT'),
    dbName: config.getOrThrow<string>('DB_NAME'),
    user: config.getOrThrow<string>('DB_USER'),
    password: config.getOrThrow<string>('DB_PASSWORD'),
    ...(useSsl
      ? { driverOptions: { connection: { ssl: { rejectUnauthorized: false } } } }
      : {}),
    entities: ['dist/**/*.entity.js'],
    entitiesTs: ['libs/**/*.entity.ts'],
    metadataProvider: TsMorphMetadataProvider,
    discovery: { warnWhenNoEntities: false },
    migrations: {
      path: 'libs/db/src/migrations',
      pathTs: 'libs/db/src/migrations',
    },
  };
}

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  exports: [ConfigModule],
})
export class DbModule {}
