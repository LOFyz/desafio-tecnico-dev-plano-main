import { Logger } from '@nestjs/common';

const logger = new Logger('WpUserLookup');

interface LookupOptions {
  url: string;
  token: string;
}

interface WpUserNode {
  databaseId: number;
  email: string | null;
}

interface UsersQueryResponse {
  data?: { users?: { nodes?: WpUserNode[] } };
  errors?: Array<{ message: string }>;
}

export async function lookupWpUserIdByEmail(
  email: string,
  options: LookupOptions,
): Promise<number | null> {
  if (!email) return null;
  if (!options.url || !options.token) {
    logger.debug('WP lookup skipped: missing url or token');
    return null;
  }

  try {
    const res = await fetch(options.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.token}`,
      },
      body: JSON.stringify({
        query: `query LookupWpUser($search: String!) {
          users(where: { search: $search, searchColumns: [EMAIL] }, first: 5) {
            nodes { databaseId email }
          }
        }`,
        variables: { search: email },
      }),
    });

    if (!res.ok) {
      logger.warn(`WP lookup HTTP ${res.status} for ${email}`);
      return null;
    }

    const body = (await res.json()) as UsersQueryResponse;
    if (body.errors?.length) {
      logger.warn(`WP lookup errors for ${email}: ${body.errors.map((e) => e.message).join(', ')}`);
      return null;
    }

    const matches = (body.data?.users?.nodes ?? []).filter(
      (n) => typeof n.email === 'string' && n.email.toLowerCase() === email.toLowerCase(),
    );

    if (matches.length === 1) return matches[0]!.databaseId;
    if (matches.length === 0) {
      logger.debug(`WP lookup no exact match for ${email}`);
    } else {
      logger.warn(`WP lookup ambiguous (${matches.length} matches) for ${email} — skipping`);
    }
    return null;
  } catch (err) {
    logger.warn(`WP lookup failed for ${email}: ${(err as Error).message}`);
    return null;
  }
}
