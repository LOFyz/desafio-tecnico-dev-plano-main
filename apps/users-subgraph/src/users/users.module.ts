import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import {
  FindUserByIdQueryHandler,
  FindUserByDatabaseIdQueryHandler,
  FindUsersByDatabaseIdsQueryHandler,
} from '@desafio/users-application';
import { UserEntity } from '@desafio/users-infrastructure';
import { AppUserReferenceResolver, PostAppUserResolver } from './users.resolver';
import { LoaderFactory } from './loaders/loader-factory';

@Module({
  imports: [CqrsModule, MikroOrmModule.forFeature([UserEntity])],
  providers: [
    AppUserReferenceResolver,
    PostAppUserResolver,
    FindUserByIdQueryHandler,
    FindUserByDatabaseIdQueryHandler,
    FindUsersByDatabaseIdsQueryHandler,
    LoaderFactory,
  ],
  exports: [LoaderFactory],
})
export class UsersModule {}
