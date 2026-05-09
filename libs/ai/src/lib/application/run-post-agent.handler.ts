import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { POST_AGENT } from '../domain/post-agent';
import type { PostAgent } from '../domain/post-agent';
import type { PostAgentResult } from '../domain/post-agent-result';
import { RunPostAgentCommand } from './run-post-agent.command';
import { AiGenerationFailedError, WpPublishFailedError } from '../errors';

@CommandHandler(RunPostAgentCommand)
export class RunPostAgentHandler
  implements ICommandHandler<RunPostAgentCommand, PostAgentResult>
{
  constructor(@Inject(POST_AGENT) private readonly agent: PostAgent) {}

  async execute(command: RunPostAgentCommand): Promise<PostAgentResult> {
    try {
      return await this.agent.run({
        prompt: command.prompt,
        userId: command.userId,
        sessionCookie: command.sessionCookie,
      });
    } catch (err) {
      if (err instanceof AiGenerationFailedError) throw err;
      if (err instanceof WpPublishFailedError) {
        // Surface WP failures as NOOP with the WP message so the user sees what went wrong.
        return { action: 'NOOP', message: err.message };
      }
      throw new AiGenerationFailedError((err as Error).message ?? 'Unknown error', err);
    }
  }
}
