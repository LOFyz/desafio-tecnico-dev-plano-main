import { RemoteGraphQLDataSource } from '@apollo/gateway';
import type { GraphQLDataSourceProcessOptions } from '@apollo/gateway';

export class CookieDataSource extends RemoteGraphQLDataSource {
  override willSendRequest(options: GraphQLDataSourceProcessOptions) {
    const cookie = (options.context as any)?.req?.headers?.cookie as string | undefined;
    if (cookie) {
      options.request.http?.headers.set('cookie', cookie);
    }
  }
}
