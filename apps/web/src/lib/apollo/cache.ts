import { InMemoryCache } from '@apollo/client-integration-nextjs';
import { typePolicies } from './type-policies';

export function createCache() {
  return new InMemoryCache({ typePolicies });
}
