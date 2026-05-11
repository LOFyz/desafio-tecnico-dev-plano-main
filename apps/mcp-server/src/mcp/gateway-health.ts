const GATEWAY_URL_DEFAULT = 'http://localhost:3000/graphql';

export async function checkGatewayReachable(): Promise<{
  ok: boolean;
  message: string;
  url: string;
}> {
  const url = process.env['GATEWAY_URL'] ?? GATEWAY_URL_DEFAULT;
  // Local dev: 5s is plenty. Behind the deployed Aurora SLS v2 (scale-to-
  // zero) + Apollo Gateway composition cold start, the first probe can
  // take 20-30s. Allow override via env.
  const timeoutMs = Number(process.env['GATEWAY_HEALTH_TIMEOUT_MS'] ?? 30_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        url,
        message: `Gateway responded with HTTP ${res.status} on startup probe`,
      };
    }
    return { ok: true, url, message: 'Gateway reachable' };
  } catch (err) {
    return {
      ok: false,
      url,
      message: `Cannot reach gateway: ${(err as Error).message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
