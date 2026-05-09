import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'better-auth.session_token';

export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has(SESSION_COOKIE);
  if (hasSession) return NextResponse.next();

  const url = req.nextUrl.clone();
  const next = url.pathname + (url.search || '');
  url.pathname = '/sign-in';
  url.search = `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
