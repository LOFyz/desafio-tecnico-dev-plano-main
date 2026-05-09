import { Module } from '@nestjs/common';
import { DbModule } from '@desafio/db';
import { MigrationModule } from '../migration/migration.module';

@Module({
  imports: [DbModule, MigrationModule],
})
export class AppModule {}
