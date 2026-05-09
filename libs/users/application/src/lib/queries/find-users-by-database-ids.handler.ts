import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@mikro-orm/nestjs';
import type { EntityRepository } from '@mikro-orm/core';
import type { User } from '@desafio/users-domain';
import { UserEntity } from '@desafio/users-infrastructure';
import { FindUsersByDatabaseIdsQuery } from './find-users-by-database-ids.query';

@QueryHandler(FindUsersByDatabaseIdsQuery)
export class FindUsersByDatabaseIdsQueryHandler
  implements IQueryHandler<FindUsersByDatabaseIdsQuery, (User | null)[]>
{
  constructor(
    @InjectRepository(UserEntity) private readonly users: EntityRepository<UserEntity>,
  ) {}

  async execute(query: FindUsersByDatabaseIdsQuery): Promise<(User | null)[]> {
    if (query.databaseIds.length === 0) return [];

    const rows = await this.users.find({
      databaseId: { $in: query.databaseIds },
    });

    const byId = new Map<number, User>();
    for (const row of rows) {
      if (row.databaseId != null) {
        byId.set(row.databaseId, toUser(row));
      }
    }

    return query.databaseIds.map((id) => byId.get(id) ?? null);
  }
}

function toUser(row: UserEntity): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    image: row.image,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
