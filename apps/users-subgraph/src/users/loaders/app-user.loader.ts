import DataLoader from 'dataloader';
import type { QueryBus } from '@nestjs/cqrs';
import { FindUsersByDatabaseIdsQuery } from '@desafio/users-application';
import type { User } from '@desafio/users-domain';

export interface AppUserLoaderDeps {
  queryBus: QueryBus;
}

export function createAppUserByWpIdLoader(
  deps: AppUserLoaderDeps,
): DataLoader<number, User | null> {
  return new DataLoader<number, User | null>(async (wpUserDatabaseIds) => {
    const ids = [...wpUserDatabaseIds];
    return deps.queryBus.execute<
      FindUsersByDatabaseIdsQuery,
      (User | null)[]
    >(new FindUsersByDatabaseIdsQuery(ids));
  });
}
