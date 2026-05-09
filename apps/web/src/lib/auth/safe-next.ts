export function safeNextPath(
  raw: string | null | undefined,
  fallback = '/'
): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  return raw;
}
