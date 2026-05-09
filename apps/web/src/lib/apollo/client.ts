import {
  ApolloClient,
  registerApolloClient,
} from '@apollo/client-integration-nextjs';
import { HttpLink } from '@apollo/client/link/http';
import { headers } from 'next/headers';

import { createCache } from './cache';

const upstream = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000';

export const { getClient, query, PreloadQuery } = registerApolloClient(() => {
  return new ApolloClient({
    cache: createCache(),
    link: new HttpLink({
      uri: `${upstream}/graphql`,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const incoming = await headers();
        const cookie = incoming.get('cookie') ?? '';
        const authorization = incoming.get('authorization') ?? '';
        const merged = new Headers(init?.headers);
        if (cookie) merged.set('cookie', cookie);
        if (authorization) merged.set('authorization', authorization);
        return fetch(input, { ...init, headers: merged, credentials: 'include' });
      },
    }),
  });
});
