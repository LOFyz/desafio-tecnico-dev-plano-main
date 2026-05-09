import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { gatewayFetch, postGlobalId, type GatewayHeaders } from './gateway-client.js';

interface PostRef {
  databaseId: number;
  slug: string;
  title: string;
  status: string;
}

const POST_FIELDS = `databaseId slug title status`;

const CREATE_POST_MUTATION = `mutation McpCreatePost($input: CreatePostInput!) {
  createPost(input: $input) { post { ${POST_FIELDS} } }
}`;

const UPDATE_POST_MUTATION = `mutation McpUpdatePost($input: UpdatePostInput!) {
  updatePost(input: $input) { post { ${POST_FIELDS} } }
}`;

const DELETE_POST_MUTATION = `mutation McpDeletePost($input: DeletePostInput!) {
  deletePost(input: $input) { deletedId post { databaseId } }
}`;

const LIST_POSTS_QUERY = `query McpListPosts($first: Int!, $after: String) {
  posts(first: $first, after: $after) {
    edges { cursor node { ${POST_FIELDS} } }
    pageInfo { hasNextPage endCursor }
  }
}`;

function headersFrom(extra: RequestHandlerExtra<never, never>): GatewayHeaders {
  const raw = extra.requestInfo?.headers ?? {};
  const cookie = pickHeader(raw['cookie']);
  const authorization = pickHeader(raw['authorization']);
  return { cookie, authorization };
}

function pickHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function asTextResult(payload: unknown) {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(payload) },
    ],
  };
}

export function registerPostTools(server: McpServer): void {
  server.registerTool(
    'createPost',
    {
      title: 'Create blog post',
      description:
        'Create and publish a new blog post on the federated WordPress backend.',
      inputSchema: {
        title: z.string().min(1).describe('Post title (visible to readers)'),
        content: z
          .string()
          .min(1)
          .describe('Post body in HTML or Markdown (200–500 words recommended)'),
      },
    },
    async (args, extra) => {
      const data = await gatewayFetch<{ createPost: { post: PostRef } }>(
        CREATE_POST_MUTATION,
        {
          input: {
            title: args.title,
            content: args.content,
            status: 'PUBLISH',
          },
        },
        headersFrom(extra),
      );
      return asTextResult(data.createPost.post);
    },
  );

  server.registerTool(
    'updatePost',
    {
      title: 'Update blog post',
      description:
        'Edit an existing blog post by its databaseId. Provide title and/or content.',
      inputSchema: {
        databaseId: z
          .number()
          .int()
          .positive()
          .describe('WordPress post databaseId (integer). Use listPosts first to find it.'),
        title: z.string().min(1).optional(),
        content: z.string().min(1).optional(),
      },
    },
    async (args, extra) => {
      const data = await gatewayFetch<{ updatePost: { post: PostRef } }>(
        UPDATE_POST_MUTATION,
        {
          input: {
            id: postGlobalId(args.databaseId),
            ...(args.title !== undefined ? { title: args.title } : {}),
            ...(args.content !== undefined ? { content: args.content } : {}),
          },
        },
        headersFrom(extra),
      );
      return asTextResult(data.updatePost.post);
    },
  );

  server.registerTool(
    'deletePost',
    {
      title: 'Delete blog post',
      description:
        'Permanently delete a blog post by databaseId. Use listPosts first to confirm the right one.',
      inputSchema: {
        databaseId: z
          .number()
          .int()
          .positive()
          .describe('WordPress post databaseId (integer). Use listPosts first to find it.'),
      },
    },
    async (args, extra) => {
      const data = await gatewayFetch<{
        deletePost: { post: { databaseId: number } | null };
      }>(
        DELETE_POST_MUTATION,
        {
          input: {
            id: postGlobalId(args.databaseId),
            forceDelete: true,
          },
        },
        headersFrom(extra),
      );
      return asTextResult({
        deletedDatabaseId: data.deletePost.post?.databaseId ?? args.databaseId,
      });
    },
  );

  server.registerTool(
    'listPosts',
    {
      title: 'List recent blog posts',
      description:
        'Return recent posts (databaseId, slug, title, status) so you can find the post the user is talking about.',
      inputSchema: {
        first: z
          .number()
          .int()
          .min(1)
          .max(50)
          .describe('How many posts to return (1–50)'),
        after: z
          .string()
          .optional()
          .describe('Opaque cursor from a previous listPosts call.'),
      },
    },
    async (args, extra) => {
      const data = await gatewayFetch<{
        posts: {
          edges: Array<{ cursor: string; node: PostRef }>;
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      }>(
        LIST_POSTS_QUERY,
        { first: args.first, after: args.after ?? null },
        headersFrom(extra),
      );
      const items = data.posts.edges.map((e) => e.node);
      return asTextResult({
        items,
        pageInfo: data.posts.pageInfo,
      });
    },
  );
}
