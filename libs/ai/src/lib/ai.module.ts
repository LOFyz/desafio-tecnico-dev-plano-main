import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { POST_AGENT } from './domain/post-agent';
import { LangChainMcpPostAgent } from './infrastructure/langchain-mcp-post-agent';
import { RunPostAgentHandler } from './application/run-post-agent.handler';

@Module({
  imports: [CqrsModule],
  providers: [
    { provide: POST_AGENT, useClass: LangChainMcpPostAgent },
    RunPostAgentHandler,
  ],
  exports: [POST_AGENT, RunPostAgentHandler],
})
export class AiModule {}
