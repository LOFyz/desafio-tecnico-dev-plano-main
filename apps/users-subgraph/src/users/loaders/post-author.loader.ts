import DataLoader from 'dataloader';
import { Logger } from '@nestjs/common';

export interface PostAuthorLoaderDeps {
  url: string;
  token: string | undefined;
  logger?: Logger;
}

interface WpPostNode {
  databaseId: number;
  author?: { node?: { databaseId?: number } | null } | null;
}

export function createPostAuthorWpIdLoader(
  deps: PostAuthorLoaderDeps,
): DataLoader<number, number | null> {
  const logger = deps.logger ?? new Logger('PostAuthorWpIdLoader');

  return new DataLoader<number, number | null>(async (postDatabaseIds) => {
    const ids = [...postDatabaseIds];

    if (!deps.token) {
      logger.warn('WP_GRAPHQL_SERVICE_TOKEN missing — Post.appUser cannot resolve');
      return ids.map(() => null);
    }

    try {
      const res = await fetch(deps.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deps.token}`,
        },
        body: JSON.stringify({
          query: `query PostAuthorsBatch($in: [ID]) {
            posts(where: { in: $in }) {
              nodes {
                databaseId
                author { node { databaseId } }
              }
            }
          }`,
          variables: { in: ids.map(String) },
        }),
      });

      if (!res.ok) {
        logger.warn(`Batched WP fetch failed: ${res.status} ${res.statusText}`);
        return ids.map(() => null);
      }

      const body = (await res.json()) as {
        data?: { posts?: { nodes?: WpPostNode[] | null } | null } | null;
      };

      const nodes = body.data?.posts?.nodes ?? [];
      const byPostId = new Map<number, number | null>();
      for (const node of nodes) {
        if (typeof node.databaseId !== 'number') continue;
        const wpUserDatabaseId = node.author?.node?.databaseId;
        byPostId.set(
          node.databaseId,
          typeof wpUserDatabaseId === 'number' && wpUserDatabaseId > 0
            ? wpUserDatabaseId
            : null,
        );
      }

      return ids.map((id) => byPostId.get(id) ?? null);
    } catch (err) {
      logger.warn(`Batched WP fetch errored: ${(err as Error).message}`);
      return ids.map(() => null);
    }
  });
}
