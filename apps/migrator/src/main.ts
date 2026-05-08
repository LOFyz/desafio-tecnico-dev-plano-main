import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });
}

bootstrap().catch((err) => {
  console.error('Migrator failed', err);
  process.exit(1);
});
