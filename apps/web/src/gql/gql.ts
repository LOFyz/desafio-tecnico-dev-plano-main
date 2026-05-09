/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query Foundation_HomePageQuery {\n    me {\n      id\n      ...UserBadge_UserFragment\n    }\n  }\n": typeof types.Foundation_HomePageQueryDocument,
    "\n  fragment UserBadge_UserFragment on AppUser {\n    id\n    name\n  }\n": typeof types.UserBadge_UserFragmentFragmentDoc,
    "\n  mutation RunPostAgent($input: RunPostAgentInput!) {\n    runPostAgent(input: $input) {\n      action\n      post {\n        databaseId\n        slug\n        title\n        status\n      }\n      deletedDatabaseId\n      message\n    }\n  }\n": typeof types.RunPostAgentDocument,
    "\n  fragment PostCardFragment on Post {\n    id\n    databaseId\n    slug\n    title\n    excerpt\n    date\n    appUser {\n      id\n      name\n    }\n  }\n": typeof types.PostCardFragmentFragmentDoc,
    "\n  fragment PostDetailFragment on Post {\n    id\n    databaseId\n    slug\n    title\n    content\n    date\n    appUser {\n      id\n      name\n      email\n    }\n  }\n": typeof types.PostDetailFragmentFragmentDoc,
    "\n  query PostDetail($slug: ID!) {\n    post(id: $slug, idType: SLUG) {\n      ...PostDetailFragment\n    }\n  }\n": typeof types.PostDetailDocument,
    "\n  query PostsList($first: Int!, $after: String) {\n    posts(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFragment\n        }\n      }\n      pageInfo {\n        endCursor\n        hasNextPage\n      }\n    }\n  }\n": typeof types.PostsListDocument,
};
const documents: Documents = {
    "\n  query Foundation_HomePageQuery {\n    me {\n      id\n      ...UserBadge_UserFragment\n    }\n  }\n": types.Foundation_HomePageQueryDocument,
    "\n  fragment UserBadge_UserFragment on AppUser {\n    id\n    name\n  }\n": types.UserBadge_UserFragmentFragmentDoc,
    "\n  mutation RunPostAgent($input: RunPostAgentInput!) {\n    runPostAgent(input: $input) {\n      action\n      post {\n        databaseId\n        slug\n        title\n        status\n      }\n      deletedDatabaseId\n      message\n    }\n  }\n": types.RunPostAgentDocument,
    "\n  fragment PostCardFragment on Post {\n    id\n    databaseId\n    slug\n    title\n    excerpt\n    date\n    appUser {\n      id\n      name\n    }\n  }\n": types.PostCardFragmentFragmentDoc,
    "\n  fragment PostDetailFragment on Post {\n    id\n    databaseId\n    slug\n    title\n    content\n    date\n    appUser {\n      id\n      name\n      email\n    }\n  }\n": types.PostDetailFragmentFragmentDoc,
    "\n  query PostDetail($slug: ID!) {\n    post(id: $slug, idType: SLUG) {\n      ...PostDetailFragment\n    }\n  }\n": types.PostDetailDocument,
    "\n  query PostsList($first: Int!, $after: String) {\n    posts(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFragment\n        }\n      }\n      pageInfo {\n        endCursor\n        hasNextPage\n      }\n    }\n  }\n": types.PostsListDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Foundation_HomePageQuery {\n    me {\n      id\n      ...UserBadge_UserFragment\n    }\n  }\n"): (typeof documents)["\n  query Foundation_HomePageQuery {\n    me {\n      id\n      ...UserBadge_UserFragment\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment UserBadge_UserFragment on AppUser {\n    id\n    name\n  }\n"): (typeof documents)["\n  fragment UserBadge_UserFragment on AppUser {\n    id\n    name\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RunPostAgent($input: RunPostAgentInput!) {\n    runPostAgent(input: $input) {\n      action\n      post {\n        databaseId\n        slug\n        title\n        status\n      }\n      deletedDatabaseId\n      message\n    }\n  }\n"): (typeof documents)["\n  mutation RunPostAgent($input: RunPostAgentInput!) {\n    runPostAgent(input: $input) {\n      action\n      post {\n        databaseId\n        slug\n        title\n        status\n      }\n      deletedDatabaseId\n      message\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment PostCardFragment on Post {\n    id\n    databaseId\n    slug\n    title\n    excerpt\n    date\n    appUser {\n      id\n      name\n    }\n  }\n"): (typeof documents)["\n  fragment PostCardFragment on Post {\n    id\n    databaseId\n    slug\n    title\n    excerpt\n    date\n    appUser {\n      id\n      name\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment PostDetailFragment on Post {\n    id\n    databaseId\n    slug\n    title\n    content\n    date\n    appUser {\n      id\n      name\n      email\n    }\n  }\n"): (typeof documents)["\n  fragment PostDetailFragment on Post {\n    id\n    databaseId\n    slug\n    title\n    content\n    date\n    appUser {\n      id\n      name\n      email\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PostDetail($slug: ID!) {\n    post(id: $slug, idType: SLUG) {\n      ...PostDetailFragment\n    }\n  }\n"): (typeof documents)["\n  query PostDetail($slug: ID!) {\n    post(id: $slug, idType: SLUG) {\n      ...PostDetailFragment\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PostsList($first: Int!, $after: String) {\n    posts(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFragment\n        }\n      }\n      pageInfo {\n        endCursor\n        hasNextPage\n      }\n    }\n  }\n"): (typeof documents)["\n  query PostsList($first: Int!, $after: String) {\n    posts(first: $first, after: $after) {\n      edges {\n        cursor\n        node {\n          ...PostCardFragment\n        }\n      }\n      pageInfo {\n        endCursor\n        hasNextPage\n      }\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;