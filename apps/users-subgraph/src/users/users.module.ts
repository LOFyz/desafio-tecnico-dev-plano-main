import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import {
  FindUserByIdQueryHandler,
  FindUserByDatabaseIdQueryHandler,
  FindUsersByDatabaseIdsQueryHandler,
} from '@desafio/users-application';
import { UserEntity } from '@desafio/users-infrastructure';
import { AppUserReferenceResolver } from './users.resolver';

@Module({
  imports: [CqrsModule, MikroOrmModule.forFeature([UserEntity])],
  providers: [
    AppUserReferenceResolver,
    FindUserByIdQueryHandler,
    FindUserByDatabaseIdQueryHandler,
    FindUsersByDatabaseIdsQueryHandler,
  ],
})
export class UsersModule {}
