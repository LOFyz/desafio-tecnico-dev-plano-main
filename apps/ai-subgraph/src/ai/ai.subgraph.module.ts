import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { BetterAuthModule } from '@desafio/auth';
import { AiModule } from '@desafio/ai';
import { AiResolver } from './ai.resolver';
import { BetterAuthGuard } from '../auth/better-auth.guard';

@Module({
  imports: [
    CqrsModule,
    BetterAuthModule.forRootAsync({ useFactory: () => ({}) }),
    AiModule,
  ],
  providers: [AiResolver, BetterAuthGuard],
})
export class AiSubgraphModule {}
