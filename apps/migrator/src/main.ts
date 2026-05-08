import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MikroORM } from '@mikro-orm/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  const orm = app.get(MikroORM);
  const migrator = orm.getMigrator();

  Logger.log('Running pending migrations…', 'Migrator');
  const migrations = await migrator.up();

  if (migrations.length === 0) {
    Logger.log('No pending migrations.', 'Migrator');
  } else {
    Logger.log(`Applied ${migrations.length} migration(s).`, 'Migrator');
    migrations.forEach((m) => Logger.log(`  ✓ ${m.name}`, 'Migrator'));
  }

  await app.close();
  process.exit(0);
}

bootstrap().catch((err) => {
  Logger.error('Migration failed', err, 'Migrator');
  process.exit(1);
});
