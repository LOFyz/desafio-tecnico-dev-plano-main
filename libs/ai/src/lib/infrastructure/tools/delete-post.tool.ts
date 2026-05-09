import { tool } from 'ai';
import { z } from 'zod';
import { gatewayFetch, postGlobalId } from './gateway-fetch';

const DELETE_POST_MUTATION = /* GraphQL */ `
  mutation DeletePostFromAgent($input: DeletePostInput!) {
    deletePost(input: $input) {
      deletedId
      post {
        databaseId
      }
    }
  }
`;

interface DeletePostResponse {
  deletePost: {
    deletedId: string | null;
    post: { databaseId: number | null } | null;
  } | null;
}

export function deletePostTool(deps: { sessionCookie: string }) {
  return tool({
    description:
      "Permanently delete an existing post. Pass the post's databaseId (from listPosts). Confirm via listPosts first if the user named the post by title — never guess.",
    inputSchema: z.object({
      databaseId: z
        .number()
        .int()
        .positive()
        .describe('The integer databaseId of the post to delete.'),
    }),
    execute: async ({ databaseId }) => {
      await gatewayFetch<DeletePostResponse>({
        query: DELETE_POST_MUTATION,
        variables: {
          input: { id: postGlobalId(databaseId), forceDelete: true },
        },
        sessionCookie: deps.sessionCookie,
      });
      return { deletedDatabaseId: databaseId, deleted: true };
    },
  });
}
