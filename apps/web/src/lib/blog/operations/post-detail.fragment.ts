import { graphql } from '@/gql';

export const POST_DETAIL_FRAGMENT = graphql(/* GraphQL */ `
  fragment PostDetailFragment on Post {
    id
    databaseId
    slug
    title
    content
    date
    appUser {
      id
      name
      email
    }
  }
`);
