import { tool } from 'ai';
import { z } from 'zod';
import { gatewayFetch, postGlobalId } from './gateway-fetch';

const UPDATE_POST_MUTATION = /* GraphQL */ `
  mutation UpdatePostFromAgent($input: UpdatePostInput!) {
    updatePost(input: $input) {
      post {
        databaseId
        slug
        title
        status
      }
    }
  }
`;

interface UpdatePostResponse {
  updatePost: {
    post: {
      databaseId: number;
      slug: string;
      title: string;
      status: string;
    } | null;
  } | null;
}

export function updatePostTool(deps: { sessionCookie: string }) {
  return tool({
    description:
      "Update an existing post's title and/or content. Pass the post's databaseId (from listPosts). Use this to edit, expand, fix, or rewrite an existing post.",
    inputSchema: z.object({
      databaseId: z
        .number()
        .int()
        .positive()
        .describe('The integer databaseId of the post to update.'),
      title: z
        .string()
        .min(1)
        .max(200)
        .optional()
        .describe('Optional new title.'),
      content: z
        .string()
        .min(50)
        .max(5000)
        .optional()
        .describe('Optional new full post body.'),
    }),
    execute: async ({ databaseId, title, content }) => {
      if (title === undefined && content === undefined) {
        throw new Error('updatePost requires at least one of title or content');
      }
      const input: Record<string, unknown> = { id: postGlobalId(databaseId) };
      if (title !== undefined) input['title'] = title;
      if (content !== undefined) input['content'] = content;

      const data = await gatewayFetch<UpdatePostResponse>({
        query: UPDATE_POST_MUTATION,
        variables: { input },
        sessionCookie: deps.sessionCookie,
      });
      const post = data.updatePost?.post;
      if (!post) throw new Error('updatePost returned no post');
      return {
        databaseId: post.databaseId,
        slug: post.slug,
        title: post.title,
        status: post.status,
      };
    },
  });
}
