import { cache } from 'react';
import { headers } from 'next/headers';

import type { Session } from './types';

const upstream = process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:3001';

export const getSession = cache(async (): Promise<Session | null> => {
  const incoming = await headers();
  const cookie = incoming.get('cookie') ?? '';
  if (!cookie) return null;

  const res = await fetch(`${upstream}/auth/get-session`, {
    method: 'GET',
    headers: { cookie },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as Session | null;
  if (!body || !body.user) return null;
  return body;
});
