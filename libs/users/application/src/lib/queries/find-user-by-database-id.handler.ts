import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@mikro-orm/nestjs';
import type { EntityRepository } from '@mikro-orm/core';
import type { User } from '@desafio/users-domain';
import { UserEntity } from '@desafio/users-infrastructure';
import { FindUserByDatabaseIdQuery } from './find-user-by-database-id.query';

@QueryHandler(FindUserByDatabaseIdQuery)
export class FindUserByDatabaseIdQueryHandler
  implements IQueryHandler<FindUserByDatabaseIdQuery, User | null>
{
  constructor(
    @InjectRepository(UserEntity) private readonly users: EntityRepository<UserEntity>,
  ) {}

  async execute(query: FindUserByDatabaseIdQuery): Promise<User | null> {
    const row = await this.users.findOne({ databaseId: query.databaseId });
    return row ? toUser(row) : null;
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
