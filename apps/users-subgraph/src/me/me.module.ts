import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { GetMeQueryHandler } from '@desafio/users-application';
import { MeResolver } from './me.resolver';

@Module({
  imports: [CqrsModule],
  providers: [MeResolver, GetMeQueryHandler],
})
export class MeModule {}
