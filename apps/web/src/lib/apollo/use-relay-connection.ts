'use client';

import { useState } from 'react';
import { useQuery, type QueryHookOptions } from '@apollo/client/react';
import type { DocumentNode, OperationVariables, TypedDocumentNode } from '@apollo/client';

type RelayPageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

type RelayEdge<TNode> = {
  cursor: string;
  node: TNode;
};

type RelayConnection<TNode> = {
  edges: RelayEdge<TNode>[];
  pageInfo: RelayPageInfo;
};

type ConnectionPath = string | readonly string[];

function pickConnection<TNode>(
  data: unknown,
  path: ConnectionPath
): RelayConnection<TNode> | null {
  const segments = typeof path === 'string' ? path.split('.') : path;
  let cursor: unknown = data;
  for (const segment of segments) {
    if (cursor == null || typeof cursor !== 'object') return null;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return (cursor as RelayConnection<TNode> | null | undefined) ?? null;
}

export type UseRelayConnectionOptions<
  TData,
  TVariables extends OperationVariables
> = Omit<QueryHookOptions<TData, TVariables>, 'variables'> & {
  variables: TVariables;
  connectionPath: ConnectionPath;
};

export interface UseRelayConnectionResult<TNode, TData> {
  items: TNode[];
  hasNextPage: boolean;
  loadMore: () => Promise<void>;
  isLoadingMore: boolean;
  data: TData | undefined;
  loading: boolean;
}

/**
 * Wraps `useQuery` + `fetchMore` for any Relay-spec connection.
 *
 * The cache must register a `relayStylePagination()` field policy for the
 * connection — see `lib/apollo/type-policies.ts` for the pattern.
 */
export function useRelayConnection<
  TNode,
  TData = unknown,
  TVariables extends OperationVariables = OperationVariables
>(
  query: DocumentNode | TypedDocumentNode<TData, TVariables>,
  options: UseRelayConnectionOptions<TData, TVariables>
): UseRelayConnectionResult<TNode, TData> {
  const { connectionPath, variables, ...rest } = options;
  const { data, fetchMore, loading } = useQuery(query, { ...rest, variables });
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const connection = pickConnection<TNode>(data, connectionPath);
  const items = connection?.edges.map((edge) => edge.node) ?? [];
  const hasNextPage = connection?.pageInfo.hasNextPage ?? false;
  const endCursor = connection?.pageInfo.endCursor ?? null;

  async function loadMore() {
    if (!hasNextPage || !endCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      await fetchMore({
        variables: { ...variables, after: endCursor } as TVariables,
      });
    } finally {
      setIsLoadingMore(false);
    }
  }

  return { items, hasNextPage, loadMore, isLoadingMore, data: data as TData | undefined, loading };
}
