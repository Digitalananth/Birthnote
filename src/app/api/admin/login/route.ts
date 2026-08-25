import { NextResponse } from 'next/server';
import { createAdminSession, adminCookie, pruneExpiredAdminSessions } from '@/lib/auth';
import { getActiveAdminByEmail, getAdminPasswordHash, touchLastLogin } from '@/lib/admin-users';
import { verifyPassword, fakePasswordCheck } from '@/lib/password';
import { normaliseEmail } from '@/lib/auth-validation';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/login — email and password for an admin session cookie.
 *
 * The one generic error covers an unknown address, a wrong password and a
 * deactivated account alike: this endpoint is public, and it should tell an
 * attacker nothing about who works here.
 */
const GENERIC_ERROR = 'Those details do not match an active admin account.';

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const email = normaliseEmail(body.email ?? '');
  const password = body.password ?? '';
  if (!email || !password) {
    return NextResponse.json({ error: 'Enter your email address and password.' }, { status: 422 });
  }

  const ip = clientIp(request.headers);
  const [byIp, byEmail] = await Promise.all([
    checkRateLimit(`admin-login-ip:${ip}`, 8, 15 * 60),
    checkRateLimit(`admin-login-email:${email}`, 5, 15 * 60),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 15 minutes.' },
      { status: 429 }
    );
  }

  try {
    const admin = await getActiveAdminByEmail(email);
    if (!admin) {
      await fakePasswordCheck();
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const hash = await getAdminPasswordHash(admin.id);
    if (!hash || !(await verifyPassword(password, hash))) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    await touchLastLogin(admin.id);
    const token = await createAdminSession(admin.id, request.headers.get('user-agent'));
    await pruneExpiredAdminSessions();

    const response = NextResponse.json({ ok: true, role: admin.role });
    response.cookies.set(adminCookie.name, token, adminCookie.options);
    return response;
  } catch (error) {
    console.error('[api/admin/login] failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
