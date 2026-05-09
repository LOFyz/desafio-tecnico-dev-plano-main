export interface GatewayHeaders {
  cookie?: string;
  authorization?: string;
}

export interface GatewayResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

const GATEWAY_URL_DEFAULT = 'http://localhost:3000/graphql';

export async function gatewayFetch<T>(
  query: string,
  variables: Record<string, unknown>,
  headers: GatewayHeaders,
): Promise<T> {
  const url = process.env['GATEWAY_URL'] ?? GATEWAY_URL_DEFAULT;
  const headersInit: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (headers.cookie) headersInit['cookie'] = headers.cookie;
  if (headers.authorization) headersInit['authorization'] = headers.authorization;

  const res = await fetch(url, {
    method: 'POST',
    headers: headersInit,
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gateway returned HTTP ${res.status}: ${body}`);
  }

  const json = (await res.json()) as GatewayResponse<T>;

  if (json.errors?.length) {
    const message = json.errors.map((e) => e.message).join('; ');
    throw new Error(`Gateway errors: ${message}`);
  }

  if (!json.data) {
    throw new Error('Gateway returned no data');
  }

  return json.data;
}

export function postGlobalId(databaseId: number): string {
  return Buffer.from(`post:${databaseId}`, 'utf8').toString('base64');
}
