import { Logger } from '@nestjs/common';

const logger = new Logger('WpAppUserLink');

interface LinkOptions {
  /** WPGraphQL endpoint URL (e.g., http://localhost:8080/graphql). The REST endpoint is derived from this by stripping /graphql. */
  url: string;
  token: string;
}

/**
 * POST { email, app_user_id } to the WP federation plugin's link endpoint.
 * Writes the app_user_id user-meta on the WP user matching the email so that
 * `User.appUser` resolves to a federation entity reference of our AppUser.
 *
 * Best-effort: returns the linked WP user's databaseId on success, or null
 * (with a warning log) on any failure. NEVER throws — callers can safely
 * ignore the return value.
 */
export async function linkAppUserOnWp(
  email: string,
  appUserId: string,
  options: LinkOptions,
): Promise<number | null> {
  if (!email || !appUserId) return null;
  if (!options.url || !options.token) {
    logger.debug('WP link skipped: missing url or token');
    return null;
  }

  // Derive WP root from the GraphQL URL by stripping the /graphql suffix.
  const wpRoot = options.url.replace(/\/graphql\/?$/, '');
  const linkUrl = `${wpRoot}/wp-json/desafio/v1/link-app-user`;

  try {
    const res = await fetch(linkUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${options.token}`,
      },
      body: JSON.stringify({ email, app_user_id: appUserId }),
    });

    if (res.status === 404) {
      logger.debug(`WP link: no WP user with email ${email} (signup runs before WP provisioning?)`);
      return null;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '<no body>');
      logger.warn(`WP link HTTP ${res.status} for ${email}: ${body}`);
      return null;
    }

    const json = (await res.json()) as { wp_user_id?: number };
    return typeof json.wp_user_id === 'number' ? json.wp_user_id : null;
  } catch (err) {
    logger.warn(`WP link failed for ${email}: ${(err as Error).message}`);
    return null;
  }
}
