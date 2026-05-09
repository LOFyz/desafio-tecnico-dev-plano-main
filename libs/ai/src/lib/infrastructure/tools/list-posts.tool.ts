import { tool } from 'ai';
import { z } from 'zod';
import { gatewayFetch } from './gateway-fetch';

const LIST_POSTS_QUERY = /* GraphQL */ `
  query ListPostsFromAgent($first: Int!, $after: String) {
    posts(first: $first, after: $after) {
      edges {
        cursor
        node {
          databaseId
          slug
          title
          excerpt
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

interface ListPostsResponse {
  posts: {
    edges: Array<{
      cursor: string | null;
      node: {
        databaseId: number;
        slug: string | null;
        title: string | null;
        excerpt: string | null;
      };
    }>;
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
  } | null;
}

export function listPostsTool(deps: { sessionCookie: string }) {
  return tool({
    description:
      "List existing blog posts (most recent first). Use this to find a post's databaseId before update or delete, or to give yourself context about what already exists.",
    inputSchema: z.object({
      first: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe('How many posts to return (max 50).'),
      after: z
        .string()
        .nullable()
        .optional()
        .describe('Cursor for pagination; null for the first page.'),
    }),
    execute: async ({ first, after }) => {
      const data = await gatewayFetch<ListPostsResponse>({
        query: LIST_POSTS_QUERY,
        variables: { first, after: after ?? null },
        sessionCookie: deps.sessionCookie,
      });
      const conn = data.posts;
      if (!conn) return { posts: [], hasNextPage: false, endCursor: null };
      return {
        posts: conn.edges.map((e) => ({
          databaseId: e.node.databaseId,
          slug: e.node.slug,
          title: e.node.title,
          excerpt: e.node.excerpt,
        })),
        hasNextPage: conn.pageInfo.hasNextPage,
        endCursor: conn.pageInfo.endCursor,
      };
    },
  });
}
