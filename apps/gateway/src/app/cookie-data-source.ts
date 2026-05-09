import { RemoteGraphQLDataSource } from '@apollo/gateway';
import type { GraphQLDataSourceProcessOptions } from '@apollo/gateway';

export class CookieDataSource extends RemoteGraphQLDataSource {
  override willSendRequest(options: GraphQLDataSourceProcessOptions) {
    const headers = (options.context as any)?.req?.headers as
      | Record<string, string | undefined>
      | undefined;
    const cookie = headers?.cookie;
    const authorization = headers?.authorization;
    if (cookie) {
      options.request.http?.headers.set('cookie', cookie);
    }
    if (authorization) {
      options.request.http?.headers.set('authorization', authorization);
    }
  }
}
