import { graphql } from '@/gql';

// POST_CARD_FRAGMENT must be imported somewhere in the bundle so codegen
// registers the fragment definition referenced by name below.
export { POST_CARD_FRAGMENT } from './post-card.fragment';

export const POSTS_LIST_QUERY = graphql(/* GraphQL */ `
  query PostsList($first: Int!, $after: String) {
    posts(first: $first, after: $after) {
      edges {
        cursor
        node {
          ...PostCardFragment
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`);
