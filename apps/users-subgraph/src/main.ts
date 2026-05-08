import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { toNodeHandler } from 'better-auth/node';
import { AppModule } from './app/app.module';
import { BETTER_AUTH_TOKEN } from '@desafio/auth';
import type { BetterAuth } from '@desafio/auth';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  const auth = app.get<BetterAuth>(BETTER_AUTH_TOKEN);
  app.use('/auth', toNodeHandler(auth));

  const port = process.env.PORT || 3001;
  await app.listen(port);
  Logger.log(`Application is running on: http://localhost:${port}`);
}

bootstrap();
