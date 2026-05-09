import { Resolver, ResolveReference, ResolveField, Parent, Context } from '@nestjs/graphql';
import { QueryBus } from '@nestjs/cqrs';
import { FindUserByIdQuery } from '@desafio/users-application';
import type { User } from '@desafio/users-domain';
import type { GqlContext } from '../gql-context';

interface AppUserReference {
  __typename: 'AppUser';
  id: string;
}

interface PostReference {
  __typename: 'Post';
  databaseId: number;
}

@Resolver('AppUser')
export class AppUserReferenceResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @ResolveReference()
  async resolveReference(reference: AppUserReference): Promise<User | null> {
    if (typeof reference.id !== 'string') return null;
    return this.queryBus.execute(new FindUserByIdQuery(reference.id));
  }
}

@Resolver('Post')
export class PostAppUserResolver {
  @ResolveField('appUser')
  async appUser(
    @Parent() post: PostReference,
    @Context() ctx: GqlContext,
  ): Promise<User | null> {
    if (typeof post.databaseId !== 'number') return null;

    const wpUserDatabaseId = await ctx.loaders.postAuthorWpId.load(post.databaseId);
    if (wpUserDatabaseId == null) return null;

    return ctx.loaders.appUserByWpId.load(wpUserDatabaseId);
  }
}
