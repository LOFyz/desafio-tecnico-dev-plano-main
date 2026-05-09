import { Injectable, Logger } from '@nestjs/common';
import { generateText, stepCountIs } from 'ai';
import type { PostAgent, PostAgentInput } from '../domain/post-agent';
import type { PostAgentResult, PostRef } from '../domain/post-agent-result';
import { AiGenerationFailedError } from '../errors';
import { createChatModel } from './chat-model.factory';
import { createPostTool } from './tools/create-post.tool';
import { updatePostTool } from './tools/update-post.tool';
import { deletePostTool } from './tools/delete-post.tool';
import { listPostsTool } from './tools/list-posts.tool';

const SYSTEM_PROMPT = `You are a blog copilot for the Desafio blog. You can:

  - createPost(title, content) — create and publish a new post
  - updatePost(databaseId, title?, content?) — edit an existing post
  - deletePost(databaseId) — permanently delete an existing post
  - listPosts(first, after?) — list recent posts so you can find one by title

Rules:
  - When the user asks to update or delete a specific post, ALWAYS call listPosts first to find the correct databaseId. Never guess.
  - When the user asks for new content, write it concisely (200–500 words), publish it via createPost, and reply with a short confirmation.
  - When the user's request doesn't match anything actionable, do not call any tool; reply that you couldn't find a match.
  - Reply with a single short sentence describing what you did (or did not do). The user will see your reply.`;

@Injectable()
export class VercelAiPostAgent implements PostAgent {
  private readonly logger = new Logger(VercelAiPostAgent.name);

  async run(input: PostAgentInput): Promise<PostAgentResult> {
    const tools = {
      createPost: createPostTool({ sessionCookie: input.sessionCookie }),
      updatePost: updatePostTool({ sessionCookie: input.sessionCookie }),
      deletePost: deletePostTool({ sessionCookie: input.sessionCookie }),
      listPosts: listPostsTool({ sessionCookie: input.sessionCookie }),
    };

    let result;
    try {
      result = await generateText({
        model: createChatModel(),
        tools,
        toolChoice: 'auto',
        stopWhen: stepCountIs(6),
        system: SYSTEM_PROMPT,
        prompt: input.prompt,
      });
    } catch (err) {
      this.logger.warn(`Agent run failed: ${(err as Error).message}`);
      throw new AiGenerationFailedError('Agent run failed', err);
    }

    const message = (result.text ?? '').trim() || 'Done.';

    // Find the most recent successful tool result by walking steps in order.
    let lastAction: { name: string; output: unknown } | null = null;
    for (const step of result.steps ?? []) {
      const stepAny = step as unknown as {
        toolResults?: Array<{ toolName: string; output?: unknown; result?: unknown }>;
      };
      for (const tr of stepAny.toolResults ?? []) {
        const out = (tr.output ?? tr.result) as unknown;
        if (out !== undefined) lastAction = { name: tr.toolName, output: out };
      }
    }

    if (!lastAction) {
      return { action: 'NOOP', message };
    }

    switch (lastAction.name) {
      case 'createPost': {
        const post = lastAction.output as PostRef;
        return { action: 'CREATED', post, message };
      }
      case 'updatePost': {
        const post = lastAction.output as PostRef;
        return { action: 'UPDATED', post, message };
      }
      case 'deletePost': {
        const out = lastAction.output as { deletedDatabaseId: number };
        return {
          action: 'DELETED',
          deletedDatabaseId: out.deletedDatabaseId,
          message,
        };
      }
      case 'listPosts':
      default:
        // Tool ran but it was just a lookup; agent didn't take a final action.
        return { action: 'NOOP', message };
    }
  }
}
