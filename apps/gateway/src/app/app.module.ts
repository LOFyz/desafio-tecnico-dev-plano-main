import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloGatewayDriver, ApolloGatewayDriverConfig } from '@nestjs/apollo';
import { IntrospectAndCompose } from '@apollo/gateway';
import { CookieDataSource } from './cookie-data-source';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloGatewayDriverConfig>({
      driver: ApolloGatewayDriver,
      server: {
        context: ({ req }: { req: Request }) => ({ req }),
      },
      gateway: {
        buildService({ url }) {
          return new CookieDataSource({ url });
        },
        supergraphSdl: new IntrospectAndCompose({
          subgraphs: [
            {
              name: 'users',
              url: process.env['USERS_SUBGRAPH_URL'] ?? 'http://localhost:3001/graphql',
            },
            {
              name: 'posts',
              url: process.env['POSTS_SUBGRAPH_URL'] ?? 'http://localhost:8080/graphql',
            },
            {
              name: 'ai',
              url: process.env['AI_SUBGRAPH_URL'] ?? 'http://localhost:3002/graphql',
            },
          ],
        }),
      },
    }),
  ],
})
export class AppModule {}
