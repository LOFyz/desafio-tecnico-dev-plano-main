import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  const port = process.env['PORT'] || 3002;
  await app.listen(port);
  Logger.log(`Application is running on: http://localhost:${port}`);
}

bootstrap();
