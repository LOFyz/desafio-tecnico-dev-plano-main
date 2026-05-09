import type { TypePolicies } from '@apollo/client';
import { relayStylePagination } from '@apollo/client/utilities';

// Each feature appends its connections here. Example:
//
//   import { relayStylePagination } from '@apollo/client/utilities';
//
//   export const typePolicies: TypePolicies = {
//     Query: {
//       fields: {
//         posts: relayStylePagination(['where']),
//       },
//     },
//   };
//
// `keyArgs` (the array passed to `relayStylePagination`) lists the variables that
// produce DIFFERENT result sets — e.g. filters. Pagination args themselves
// (`first`, `after`, `last`, `before`) are excluded automatically.
export const typePolicies: TypePolicies = {
  Query: {
    fields: {
      // wp-graphql posts connection. Foundation registers it because the
      // posts feature change will use it; the smoke page in §10.7
      // exercised this entry end-to-end before being deleted.
      posts: relayStylePagination(['where']),
    },
  },
};
