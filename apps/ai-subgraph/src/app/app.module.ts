import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { DbModule, createMikroOrmOptions } from '@desafio/db';
import {
  UserEntitySchema,
  SessionEntitySchema,
  AccountEntitySchema,
  VerificationEntitySchema,
} from '@desafio/users-infrastructure';
import { AiSubgraphModule } from '../ai/ai.subgraph.module';
import type { GqlContext } from '../gql-context';

const UsersInfrastructureEntities = [
  UserEntitySchema,
  SessionEntitySchema,
  AccountEntitySchema,
  VerificationEntitySchema,
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
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
      typePaths: ['apps/ai-subgraph/src/**/*.graphql'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context: ({ req }: { req: any }): GqlContext => ({ req }),
    }),
    AiSubgraphModule,
  ],
})
export class AppModule {}
