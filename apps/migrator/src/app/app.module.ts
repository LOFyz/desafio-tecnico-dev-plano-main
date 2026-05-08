import { Module } from '@nestjs/common';
import { DbModule } from '@desafio/db';

@Module({
  imports: [DbModule],
})
export class AppModule {}
