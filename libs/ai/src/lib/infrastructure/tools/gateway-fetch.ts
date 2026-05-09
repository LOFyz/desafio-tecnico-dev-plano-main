import { WpPublishFailedError } from '../../errors';

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: Array<{ message: string }>;
}

export interface GatewayFetchOptions {
  query: string;
  variables?: Record<string, unknown>;
  sessionCookie: string;
}

export async function gatewayFetch<T>(opts: GatewayFetchOptions): Promise<T> {
  const url = process.env['GATEWAY_URL'] ?? 'http://localhost:3000/graphql';
  // The gateway forwards both `cookie` and `authorization` to subgraphs
  // (see apps/gateway/src/app/cookie-data-source.ts). The user's Better
  // Auth cookie identifies them to the users subgraph; the WP service token
  // authenticates the request to the WP `posts` subgraph for writes.
  const wpToken = process.env['WP_GRAPHQL_SERVICE_TOKEN'];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (opts.sessionCookie) headers['Cookie'] = opts.sessionCookie;
  if (wpToken) headers['Authorization'] = `Bearer ${wpToken}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: opts.query, variables: opts.variables ?? {} }),
  });

  if (!res.ok) {
    throw new WpPublishFailedError(`Gateway HTTP ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as GraphQLResponse<T>;
  if (body.errors && body.errors.length > 0) {
    throw new WpPublishFailedError(body.errors.map((e) => e.message).join('; '));
  }
  if (body.data == null) {
    throw new WpPublishFailedError('Gateway returned no data');
  }
  return body.data;
}

const POST_PREFIX = 'post:';

/** WPGraphQL Relay global ID for a post = base64("post:<databaseId>"). */
export function postGlobalId(databaseId: number): string {
  return Buffer.from(`${POST_PREFIX}${databaseId}`).toString('base64');
}
