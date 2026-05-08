import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { DbModule, createMikroOrmOptions } from '@desafio/db';

@Module({
  imports: [
    DbModule,
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      useFactory: (config: ConfigService) => ({
        ...createMikroOrmOptions(config),
        entities: [],
        discovery: { warnWhenNoEntities: false },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
