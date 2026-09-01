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
  // Both names are accepted while sessions issued before the rename to
  // My Lucky Dates are still alive; see LEGACY_COOKIE_NAME in src/lib/auth.ts.
  const hasSession = Boolean(
    request.cookies.get('my_lucky_dates_admin_session')?.value ??
    request.cookies.get('birthnote_admin_session')?.value
  );

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
  matcher: [
    '/admin',
    '/admin/orders/:path*',
    '/admin/reports/:path*',
    '/admin/users/:path*',
    '/admin/pages/:path*',
    '/admin/blog/:path*',
  ],
};
