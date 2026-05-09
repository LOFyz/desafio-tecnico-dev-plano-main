import { graphql } from '@/gql';

export { POST_DETAIL_FRAGMENT } from './post-detail.fragment';

export const POST_DETAIL_QUERY = graphql(/* GraphQL */ `
  query PostDetail($slug: ID!) {
    post(id: $slug, idType: SLUG) {
      ...PostDetailFragment
    }
  }
`);
