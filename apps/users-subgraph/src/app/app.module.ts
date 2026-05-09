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
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      typePaths: ['**/*.graphql'],
      context: ({ req }: { req: any }): GqlContext => ({
        req,
        sessionId: req.cookies?.['better-auth.session_token'],
      }),
    }),
    MeModule,
    UsersModule,
  ],
})
export class AppModule {}
