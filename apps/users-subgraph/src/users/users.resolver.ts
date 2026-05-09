import { Resolver, ResolveReference, ResolveField, Parent } from '@nestjs/graphql';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryBus } from '@nestjs/cqrs';
import {
  FindUserByIdQuery,
  FindUserByDatabaseIdQuery,
} from '@desafio/users-application';
import type { User } from '@desafio/users-domain';

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
  private readonly logger = new Logger(PostAppUserResolver.name);

  constructor(
    private readonly queryBus: QueryBus,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  @ResolveField('appUser')
  async appUser(@Parent() post: PostReference): Promise<User | null> {
    if (typeof post.databaseId !== 'number') return null;

    const url =
      this.config.get<string>('WP_GRAPHQL_URL') ??
      this.config.get<string>('POSTS_SUBGRAPH_URL') ??
      'http://localhost:8080/graphql';
    const token = this.config.get<string>('WP_GRAPHQL_SERVICE_TOKEN');
    if (!token) {
      this.logger.warn('WP_GRAPHQL_SERVICE_TOKEN missing — Post.appUser cannot resolve');
      return null;
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: `query PostAuthor($id: ID!) {
            post(id: $id, idType: DATABASE_ID) {
              author { node { databaseId } }
            }
          }`,
          variables: { id: String(post.databaseId) },
        }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        data?: { post?: { author?: { node?: { databaseId?: number } } } };
      };
      const wpUserDatabaseId = body.data?.post?.author?.node?.databaseId;
      if (typeof wpUserDatabaseId !== 'number' || wpUserDatabaseId <= 0) return null;
      return this.queryBus.execute(new FindUserByDatabaseIdQuery(wpUserDatabaseId));
    } catch (err) {
      this.logger.warn(`Post.appUser fetch failed: ${(err as Error).message}`);
      return null;
    }
  }
}
