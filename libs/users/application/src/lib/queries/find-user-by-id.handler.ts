import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@mikro-orm/nestjs';
import type { EntityRepository } from '@mikro-orm/core';
import type { User } from '@desafio/users-domain';
import { UserEntity } from '@desafio/users-infrastructure';
import { FindUserByIdQuery } from './find-user-by-id.query';

@QueryHandler(FindUserByIdQuery)
export class FindUserByIdQueryHandler implements IQueryHandler<FindUserByIdQuery, User | null> {
  constructor(
    @InjectRepository(UserEntity) private readonly users: EntityRepository<UserEntity>,
  ) {}

  async execute(query: FindUserByIdQuery): Promise<User | null> {
    const row = await this.users.findOne({ id: query.id });
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
