const FRIENDLY: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Invalid email or password',
  USER_ALREADY_EXISTS: 'An account with that email already exists.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    'An account with that email already exists.',
  EMAIL_ALREADY_EXISTS: 'An account with that email already exists.',
  WEAK_PASSWORD: 'Password is too weak. Use at least 8 characters.',
  PASSWORD_TOO_SHORT: 'Password is too weak. Use at least 8 characters.',
};

const GENERIC = 'Something went wrong. Please try again.';

function pickCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as Record<string, unknown> & { error?: Record<string, unknown> };
  const fromNested = e.error?.['code'];
  if (typeof fromNested === 'string') return fromNested;
  const fromTop = e['code'];
  if (typeof fromTop === 'string') return fromTop;
  return undefined;
}

export function mapAuthError(err: unknown): string {
  const code = pickCode(err);
  if (code && FRIENDLY[code]) return FRIENDLY[code];
  return GENERIC;
}
