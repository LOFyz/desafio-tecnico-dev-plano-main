import { RemoteGraphQLDataSource } from '@apollo/gateway';
import type { GraphQLDataSourceProcessOptions } from '@apollo/gateway';

// Apollo Gateway 2.x bundles node-fetch@2 and Apollo's `sendRequest` always
// constructs `new node_fetch_1.Request(http.url, requestInit)` whose internal
// `parseURL` calls the deprecated `url.parse()` (DEP0169) on every outbound
// subgraph request. The constructed Request is only forwarded as the
// `_fetchRequest` arg to `didEncounterError` / `parseBody` — both prefixed
// with `_` and unused in the default implementations.
//
// Two fixes here:
//  - swap the fetcher to Node's WHATWG global fetch (so the actual network
//    call doesn't go through node-fetch@2)
//  - replace `sendRequest` on the prototype with a copy of the upstream
//    behavior minus the discarded `new Request(...)` construction. We
//    assign on the prototype rather than in the class body because the
//    upstream method is `private`; TypeScript erases that at runtime so the
//    override is legal, but a class-body redeclaration triggers TS2415.
//    Keep this in sync with @apollo/gateway's RemoteGraphQLDataSource.

type Fetcher = RemoteGraphQLDataSource['fetcher'];
const whatwgFetcher: Fetcher = ((url: string, init?: unknown) =>
  fetch(url, init as RequestInit)) as unknown as Fetcher;

type CookieDataSourceConfig = ConstructorParameters<
  typeof RemoteGraphQLDataSource
>[0];

export class CookieDataSource extends RemoteGraphQLDataSource {
  constructor(config?: CookieDataSourceConfig) {
    super({ ...config, fetcher: whatwgFetcher });
  }

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

(CookieDataSource.prototype as unknown as {
  sendRequest: (request: any, context: any) => Promise<any>;
}).sendRequest = async function sendRequest(this: RemoteGraphQLDataSource, request, context) {
  if (!request.http) {
    throw new Error("Internal error: Only 'http' requests are supported.");
  }
  const { http, ...requestWithoutHttp } = request;
  const requestInit = {
    method: http.method,
    headers: Object.fromEntries(http.headers),
    body: JSON.stringify(requestWithoutHttp),
  };
  let fetchResponse: any;
  try {
    fetchResponse = await this.fetcher(http.url, requestInit);
    if (!fetchResponse.ok) {
      throw await this.errorFromResponse(fetchResponse);
    }
    const body = await this.parseBody(
      fetchResponse,
      undefined as any,
      context
    );
    if (typeof body !== 'object' || body === null) {
      throw new Error(`Expected JSON response body, but received: ${body}`);
    }
    return { ...body, http: fetchResponse };
  } catch (error) {
    this.didEncounterError(
      error as Error,
      undefined as any,
      fetchResponse,
      context,
      request
    );
    throw error;
  }
};
