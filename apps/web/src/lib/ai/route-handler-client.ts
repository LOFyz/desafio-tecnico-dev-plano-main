/**
 * Wire types for POST /api/blog-copilot/run. Mirror the PostAgentResult
 * discriminated union exported by @desafio/ai but reduced to the JSON
 * shape the browser actually sees.
 */

export interface CopilotRequest {
  prompt: string;
}

export interface CopilotPostRef {
  databaseId: number;
  slug: string;
  title: string;
  status: string;
}

export type CopilotSuccess =
  | {
      action: 'CREATED' | 'UPDATED';
      post: CopilotPostRef;
      deletedDatabaseId: null;
      message: string;
    }
  | {
      action: 'DELETED';
      post: null;
      deletedDatabaseId: number;
      message: string;
    }
  | {
      action: 'NOOP';
      post: null;
      deletedDatabaseId: null;
      message: string;
    };

export interface CopilotErrorResponse {
  error: {
    code:
      | 'UNAUTHENTICATED'
      | 'INVALID_PROMPT'
      | 'AI_GENERATION_FAILED'
      | 'WP_PUBLISH_FAILED'
      | 'INTERNAL_ERROR';
    message?: string;
  };
}

export type CopilotResponse = CopilotSuccess | CopilotErrorResponse;

export function isCopilotError(
  res: CopilotResponse,
): res is CopilotErrorResponse {
  return 'error' in res;
}
