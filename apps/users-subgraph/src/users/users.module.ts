import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import {
  FindUserByIdQueryHandler,
  FindUserByDatabaseIdQueryHandler,
} from '@desafio/users-application';
import { UserEntity } from '@desafio/users-infrastructure';
import { AppUserReferenceResolver, PostAppUserResolver } from './users.resolver';

@Module({
  imports: [CqrsModule, MikroOrmModule.forFeature([UserEntity])],
  providers: [
    AppUserReferenceResolver,
    PostAppUserResolver,
    FindUserByIdQueryHandler,
    FindUserByDatabaseIdQueryHandler,
  ],
})
export class UsersModule {}
