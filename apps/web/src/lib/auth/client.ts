'use client';

import { createAuthClient } from 'better-auth/react';

// Browser: use same-origin proxy at /api/auth (cookies stay first-party).
// SSR-only context: Better Auth validates the URL eagerly at module evaluation,
// so we hand it a valid absolute URL that's never actually used for a fetch
// (this file is "use client", so all real client calls happen in the browser).
const baseURL =
  typeof window !== 'undefined'
    ? `${window.location.origin}/api/auth`
    : `${process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:3001'}/auth`;

export const authClient = createAuthClient({ baseURL });

export const { useSession, signIn, signUp, signOut } = authClient;
