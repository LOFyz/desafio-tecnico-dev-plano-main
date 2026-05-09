import { graphql } from '@/gql';

export const POST_DETAIL_FRAGMENT = graphql(/* GraphQL */ `
  fragment PostDetailFragment on Post {
    id
    databaseId
    slug
    title
    content
    date
    author {
      node {
        appUser {
          id
          name
          email
        }
      }
    }
  }
`);
