import { Injectable, Logger } from '@nestjs/common';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import type { PostAgent, PostAgentInput } from '../domain/post-agent';
import type { PostAgentResult, PostRef } from '../domain/post-agent-result';
import { AiGenerationFailedError } from '../errors';
import { createChatModel } from './chat-model.factory';

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

const MCP_SERVER_NAME = 'desafio';

@Injectable()
export class LangChainMcpPostAgent implements PostAgent {
  private readonly logger = new Logger(LangChainMcpPostAgent.name);

  async run(input: PostAgentInput): Promise<PostAgentResult> {
    const mcpServerUrl =
      process.env['MCP_SERVER_URL'] ?? 'http://localhost:4000/mcp';
    const wpServiceToken = process.env['WP_GRAPHQL_SERVICE_TOKEN'] ?? '';

    const client = new MultiServerMCPClient({
      mcpServers: {
        [MCP_SERVER_NAME]: {
          transport: 'http',
          url: mcpServerUrl,
          headers: {
            cookie: input.sessionCookie,
            authorization: wpServiceToken
              ? `Bearer ${wpServiceToken}`
              : '',
          },
        },
      },
    });

    try {
      const tools = await client.getTools();
      const agent = createReactAgent({ llm: createChatModel(), tools });

      let messages: BaseMessage[];
      try {
        const result = await agent.invoke(
          {
            messages: [
              new SystemMessage(SYSTEM_PROMPT),
              new HumanMessage(input.prompt),
            ],
          },
          // Bump LangGraph's default 25-step ReAct cap. The happy-path chain
          // is short (listPosts → update/delete → reply ≈ 3 steps) but the
          // free-tier NVIDIA Llama can be indecisive on update/delete — call
          // listPosts twice, second-guess itself, etc. 40 gives it room to
          // settle without thrashing forever.
          { recursionLimit: 40 },
        );
        messages = result.messages as BaseMessage[];
      } catch (err) {
        // LangGraph throws GraphRecursionError when the limit fires. Salvage
        // any tool call that already landed: the post may have been created
        // even if the model never produced a final assistant reply. The
        // catcher below then maps the last tool result to CREATED/UPDATED/
        // DELETED instead of failing the whole request with AI_GENERATION_FAILED.
        const errMsg = (err as Error).message ?? '';
        const partial = extractPartialMessages(err);
        if (partial && /recursion limit/i.test(errMsg)) {
          this.logger.warn(`Agent hit recursion limit; returning partial result`);
          messages = partial;
        } else {
          this.logger.warn(`Agent run failed: ${errMsg}`);
          throw new AiGenerationFailedError('Agent run failed', err);
        }
      }

      const finalText = extractFinalAssistantText(messages);
      const message = finalText.trim() || 'Done.';
      const lastAction = extractLastToolAction(messages);

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
          return { action: 'NOOP', message };
      }
    } finally {
      await client.close().catch((err: unknown) => {
        this.logger.warn(
          `Failed to close MCP client cleanly: ${(err as Error).message}`,
        );
      });
    }
  }
}

/**
 * LangGraph's GraphRecursionError carries the partial graph state on a
 * non-typed property. We probe a couple of common shapes and pick the
 * first array of BaseMessage we find.
 */
function extractPartialMessages(err: unknown): BaseMessage[] | null {
  if (!err || typeof err !== 'object') return null;
  const candidates = [
    (err as { state?: { messages?: unknown } }).state?.messages,
    (err as { values?: { messages?: unknown } }).values?.messages,
    (err as { messages?: unknown }).messages,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) {
      return c as BaseMessage[];
    }
  }
  return null;
}

function extractFinalAssistantText(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m instanceof AIMessage && typeof m.content === 'string' && m.content) {
      return m.content;
    }
  }
  return '';
}

function extractLastToolAction(
  messages: BaseMessage[],
): { name: string; output: unknown } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m instanceof ToolMessage) {
      const name = m.name ?? '';
      const output = parseToolContent(m.content);
      if (output !== undefined) return { name, output };
    }
  }
  return null;
}

function parseToolContent(content: unknown): unknown {
  if (typeof content === 'string') {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }
  return content;
}
