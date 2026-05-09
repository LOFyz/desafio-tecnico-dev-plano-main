import { Query, Resolver } from '@nestjs/graphql';
import { QueryBus } from '@nestjs/cqrs';
import { Context } from '@nestjs/graphql';
import { GetMeQuery } from '@desafio/users-application';
import type { GqlContext } from '../gql-context';

@Resolver('AppUser')
export class MeResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @Query('me')
  async me(@Context() ctx: GqlContext) {
    return this.queryBus.execute(new GetMeQuery(ctx.sessionId));
  }
}
