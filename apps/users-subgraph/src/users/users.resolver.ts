import { Resolver, ResolveReference } from '@nestjs/graphql';
import { QueryBus } from '@nestjs/cqrs';
import { FindUserByIdQuery } from '@desafio/users-application';
import type { User } from '@desafio/users-domain';

interface AppUserReference {
  __typename: 'AppUser';
  id: string;
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
