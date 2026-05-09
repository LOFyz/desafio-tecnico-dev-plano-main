import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { ConfigService } from '@nestjs/config';
import { DbModule, createMikroOrmOptions } from '@desafio/db';
import { BetterAuthModule } from '@desafio/auth';
import {
  UserEntitySchema,
  SessionEntitySchema,
  AccountEntitySchema,
  VerificationEntitySchema,
} from '@desafio/users-infrastructure';
import { MeModule } from '../me/me.module';
import { UsersModule } from '../users/users.module';
import { LoaderFactory } from '../users/loaders/loader-factory';
import type { GqlContext } from '../gql-context';

const UsersInfrastructureEntities = [
  UserEntitySchema,
  SessionEntitySchema,
  AccountEntitySchema,
  VerificationEntitySchema,
];

@Module({
  imports: [
    DbModule,
    BetterAuthModule.forRootAsync({ useFactory: () => ({}) }),
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      useFactory: (config: ConfigService) => ({
        ...createMikroOrmOptions(config),
        entities: UsersInfrastructureEntities,
        entitiesTs: [],
        discovery: { disableDynamicFileAccess: true },
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    GraphQLModule.forRootAsync<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      imports: [UsersModule],
      inject: [LoaderFactory],
      useFactory: (loaderFactory: LoaderFactory) => ({
        typePaths: ['apps/users-subgraph/src/**/*.graphql'],
        context: ({ req }: { req: any }): GqlContext => ({
          req,
          sessionId: req.cookies?.['better-auth.session_token'],
          loaders: loaderFactory.create(),
        }),
      }),
    }),
    MeModule,
  ],
})
export class AppModule {}
