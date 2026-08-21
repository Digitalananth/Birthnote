import { NextResponse, type NextRequest } from 'next/server';

/**
 * Gate for the admin area.
 *
 * The middleware only checks that a session cookie is *present* — looking the
 * token up needs the database, which the Edge runtime cannot reach. Every
 * admin page and API route resolves the session properly server-side with
 * requireAdmin() / getCurrentAdmin(), so this is a redirect convenience, not
 * the security boundary.
 */
export function middleware(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get('birthnote_admin_session')?.value);

  if (!hasSession) {
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Everything under /admin except the pages a signed-out admin must reach:
  // login, forgot-password and the reset link.
  matcher: ['/admin', '/admin/orders/:path*', '/admin/users/:path*'],
};
