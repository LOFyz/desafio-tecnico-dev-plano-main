import type { PostAgentResult } from './post-agent-result';

export interface PostAgentInput {
  prompt: string;
  userId: string;
  sessionCookie: string;
}

export interface PostAgent {
  run(input: PostAgentInput): Promise<PostAgentResult>;
}

export const POST_AGENT = Symbol('POST_AGENT');
