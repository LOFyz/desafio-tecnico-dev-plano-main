import { tool } from 'ai';
import { z } from 'zod';
import { gatewayFetch } from './gateway-fetch';

const CREATE_POST_MUTATION = /* GraphQL */ `
  mutation CreatePostFromAgent($input: CreatePostInput!) {
    createPost(input: $input) {
      post {
        databaseId
        slug
        title
        status
      }
    }
  }
`;

interface CreatePostResponse {
  createPost: {
    post: {
      databaseId: number;
      slug: string;
      title: string;
      status: string;
    } | null;
  } | null;
}

export function createPostTool(deps: { sessionCookie: string }) {
  return tool({
    description:
      'Create a new published blog post. Returns the new post id and slug. Use this to publish a brand-new post.',
    inputSchema: z.object({
      title: z.string().min(1).max(200).describe('The post title.'),
      content: z
        .string()
        .min(50)
        .max(5000)
        .describe('The full post body in HTML or Markdown.'),
    }),
    execute: async ({ title, content }) => {
      const data = await gatewayFetch<CreatePostResponse>({
        query: CREATE_POST_MUTATION,
        variables: {
          input: { title, content, status: 'PUBLISH' },
        },
        sessionCookie: deps.sessionCookie,
      });
      const post = data.createPost?.post;
      if (!post) throw new Error('createPost returned no post');
      return {
        databaseId: post.databaseId,
        slug: post.slug,
        title: post.title,
        status: post.status,
      };
    },
  });
}
