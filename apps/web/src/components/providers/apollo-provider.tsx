'use client';

import {
  ApolloClient,
  ApolloNextAppProvider,
} from '@apollo/client-integration-nextjs';
import { HttpLink } from '@apollo/client/link/http';
import type { ReactNode } from 'react';

import { createCache } from '@/lib/apollo/cache';

function makeClient() {
  return new ApolloClient({
    cache: createCache(),
    link: new HttpLink({
      uri: '/api/graphql',
      credentials: 'include',
    }),
  });
}

export function ApolloProvider({ children }: { children: ReactNode }) {
  return (
    <ApolloNextAppProvider makeClient={makeClient}>
      {children}
    </ApolloNextAppProvider>
  );
}
