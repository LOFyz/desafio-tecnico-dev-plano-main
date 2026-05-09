type ErrorWithCode = { extensions?: { code?: string } } | { code?: string } | unknown;

export function mapAiError(err: ErrorWithCode): string {
  const code = extractCode(err);
  switch (code) {
    case 'UNAUTHENTICATED':
      return 'You need to be signed in to use the copilot.';
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
  const e = err as { extensions?: { code?: string }; code?: string; graphQLErrors?: Array<{ extensions?: { code?: string } }> };
  return (
    e.extensions?.code ??
    e.graphQLErrors?.[0]?.extensions?.code ??
    e.code
  );
}
