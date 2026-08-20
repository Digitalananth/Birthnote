import { NextResponse, type NextRequest } from 'next/server';

/**
 * Gate for the admin area.
 *
 * The middleware only checks that a session cookie is *present* — verifying
 * its HMAC needs node:crypto, which the Edge runtime does not provide. Every
 * admin page and API route re-checks the signature server-side with
 * isAdminAuthenticated(), so this is a redirect convenience, not the
 * security boundary.
 */
export function middleware(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get('birthnote_admin')?.value);

  if (!hasSession) {
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Everything under /admin except the login page itself.
  matcher: ['/admin', '/admin/orders/:path*'],
};
