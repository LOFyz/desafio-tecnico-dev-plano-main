import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { POST_AGENT } from './domain/post-agent';
import { VercelAiPostAgent } from './infrastructure/vercel-ai-post-agent';
import { RunPostAgentHandler } from './application/run-post-agent.handler';

@Module({
  imports: [CqrsModule],
  providers: [
    { provide: POST_AGENT, useClass: VercelAiPostAgent },
    RunPostAgentHandler,
  ],
  exports: [POST_AGENT, RunPostAgentHandler],
})
export class AiModule {}
