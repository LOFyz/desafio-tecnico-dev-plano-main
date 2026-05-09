import { HttpLink } from '@apollo/client';

export const httpLink = new HttpLink({
  uri: '/api/graphql',
  credentials: 'include',
});
