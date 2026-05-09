import { graphql } from '@/gql';

export const POST_CARD_FRAGMENT = graphql(/* GraphQL */ `
  fragment PostCardFragment on Post {
    id
    databaseId
    slug
    title
    excerpt
    date
    author {
      node {
        appUser {
          id
          name
        }
      }
    }
  }
`);
