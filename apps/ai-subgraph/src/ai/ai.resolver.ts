import {
  Resolver,
  Mutation,
  Args,
  Context,
} from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { GraphQLError } from 'graphql';
import {
  RunPostAgentCommand,
  AiGenerationFailedError,
  WpPublishFailedError,
} from '@desafio/ai';
import type { PostAgentResult } from '@desafio/ai';
import { BetterAuthGuard } from '../auth/better-auth.guard';
import type { GqlContext } from '../gql-context';

interface RunPostAgentInput {
  prompt: string;
}

@Resolver('Mutation')
export class AiResolver {
  constructor(private readonly commandBus: CommandBus) {}

  @Mutation('runPostAgent')
  @UseGuards(BetterAuthGuard)
  async runPostAgent(
    @Args('input') input: RunPostAgentInput,
    @Context() ctx: GqlContext,
  ): Promise<RunPostAgentResultGraphQL> {
    if (!ctx.userId || !ctx.sessionCookie) {
      throw new GraphQLError('UNAUTHENTICATED', {
        extensions: { code: 'UNAUTHENTICATED' },
      });
    }

    let result: PostAgentResult;
    try {
      result = await this.commandBus.execute<RunPostAgentCommand, PostAgentResult>(
        new RunPostAgentCommand(input.prompt, ctx.userId, ctx.sessionCookie),
      );
    } catch (err) {
      if (err instanceof AiGenerationFailedError) {
        throw new GraphQLError(err.message, {
          extensions: { code: 'AI_GENERATION_FAILED' },
        });
      }
      if (err instanceof WpPublishFailedError) {
        throw new GraphQLError(err.message, {
          extensions: { code: 'WP_PUBLISH_FAILED' },
        });
      }
      throw new GraphQLError((err as Error).message ?? 'Internal error', {
        extensions: { code: 'INTERNAL_ERROR' },
      });
    }

    return mapResult(result);
  }
}

interface RunPostAgentResultGraphQL {
  action: 'CREATED' | 'UPDATED' | 'DELETED' | 'NOOP';
  post: { databaseId: number; slug: string; title: string; status: string } | null;
  deletedDatabaseId: number | null;
  message: string;
}

function mapResult(result: PostAgentResult): RunPostAgentResultGraphQL {
  switch (result.action) {
    case 'CREATED':
    case 'UPDATED':
      return {
        action: result.action,
        post: result.post,
        deletedDatabaseId: null,
        message: result.message,
      };
    case 'DELETED':
      return {
        action: 'DELETED',
        post: null,
        deletedDatabaseId: result.deletedDatabaseId,
        message: result.message,
      };
    case 'NOOP':
      return {
        action: 'NOOP',
        post: null,
        deletedDatabaseId: null,
        message: result.message,
      };
  }
}
