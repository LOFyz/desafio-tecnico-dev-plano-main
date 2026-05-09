export interface CopilotErrorBody {
  error: {
    code: string;
    message?: string;
  };
}

/**
 * Maps a /api/blog-copilot/run failure (HTTP error body or thrown Error)
 * into a user-readable message. Codes mirror the route handler's contract:
 * UNAUTHENTICATED, INVALID_PROMPT, AI_GENERATION_FAILED, WP_PUBLISH_FAILED,
 * INTERNAL_ERROR.
 */
export function mapAiError(err: unknown): string {
  const code = extractCode(err);
  switch (code) {
    case 'UNAUTHENTICATED':
      return 'You need to be signed in to use the copilot.';
    case 'INVALID_PROMPT':
      return 'Prompt must be between 5 and 500 characters.';
    case 'AI_GENERATION_FAILED':
      return "We couldn't run the copilot. Please try again.";
    case 'WP_PUBLISH_FAILED':
      return 'The blog rejected the change. Please try again or rephrase.';
    case 'INTERNAL_ERROR':
    default:
      return 'Something went wrong. Please try again.';
  }
}

function extractCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as {
    error?: { code?: string };
    code?: string;
  };
  return e.error?.code ?? e.code;
}
