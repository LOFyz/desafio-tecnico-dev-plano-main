## ADDED Requirements

### Requirement: Post → AppUser join is composed via pure federation hops

The supergraph SHALL resolve the "this post's author has an app-side user account" relationship as a chain of three federation primitives, with no custom resolver in any subgraph beyond `Query.me`:

1. WP exposes `Post.author.node` of type `User` (already present in WPGraphQL).
2. The WP federation plugin exposes `User.appUser: AppUser` returning an entity reference `{ __typename: "AppUser", id: <app_user_id> }` when the WP user's `app_user_id` meta is set, else `null`. (See the `wp-app-user-meta` capability.)
3. The gateway dispatches the entity reference to the users-subgraph's `AppUserReferenceResolver` (a `@ResolveReference`, which is a federation primitive). The users-subgraph returns the `AppUser` row.

#### Scenario: Cross-subgraph traversal returns the AppUser
- **WHEN** an unauthenticated client sends `query { post(id: 1, idType: DATABASE_ID) { id title author { node { user { appUser { id name } } } } } }` to the gateway, and the WP user authoring post 1 has `app_user_id = "uuid-1"` user meta
- **THEN** the response contains `{ post: { id, title, author: { node: { user: { appUser: { id: "uuid-1", name: <string> } } } } } }`

#### Scenario: No appUser link returns null without errors
- **WHEN** the WP user has no `app_user_id` meta and the same query is sent
- **THEN** `post.author.node.user.appUser` is `null` and other fields still resolve

#### Scenario: No author at all
- **WHEN** a post has no WP author (`post_author = 0`)
- **THEN** `post.author` is `null` and the rest of the query short-circuits with no errors

### Requirement: WordPress User type stays distinct from AppUser in the supergraph

The supergraph SHALL keep WordPress's `User` type and the users-subgraph's `AppUser` type as two distinct types. No subgraph SHALL re-declare `User` to merge fields with WordPress's `User`. The cross-subgraph join SHALL be expressed exclusively via WordPress's `User.appUser` field returning an `AppUser` entity reference.

#### Scenario: Supergraph has both User and AppUser
- **WHEN** the gateway composes the supergraph from the WP and users subgraphs
- **THEN** the schema introspection reports both `type User` (WordPress-owned, with WP fields plus `appUser: AppUser`) and `type AppUser` (users-subgraph-owned, with `id`, `email`, `name`)

#### Scenario: AppUser is owned by users-subgraph
- **WHEN** the gateway composes the supergraph
- **THEN** the `AppUser` type's owning subgraph is `users` (i.e., the users subgraph declares `type AppUser @key(fields: "id")` and supplies `__resolveReference`); WP only emits entity references, never the populated type
