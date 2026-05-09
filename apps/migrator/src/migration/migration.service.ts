import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/core';
import type { Migrator } from '@mikro-orm/migrations';

@Injectable()
export class MigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigrationService.name);

  constructor(private readonly orm: MikroORM) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      this.logger.log('Running pending migrations…');
      const migrator = (this.orm as unknown as { migrator: Migrator }).migrator;
      const migrations = await migrator.up();
      if (migrations.length === 0) {
        this.logger.log('No pending migrations.');
      } else {
        this.logger.log(`Applied ${migrations.length} migration(s).`);
        migrations.forEach((m) => this.logger.log(`  ✓ ${m.name}`));
      }
      process.exit(0);
    } catch (err) {
      this.logger.error('Migration failed', err);
      process.exit(1);
    }
  }
}
