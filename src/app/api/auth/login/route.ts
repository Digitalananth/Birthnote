import { NextResponse } from 'next/server';
import { validateLogin, type LoginValues } from '@/lib/auth-validation';
import {
  getUserByEmail,
  getPasswordHash,
  verifyPassword,
  fakePasswordCheck,
  claimGuestOrders,
} from '@/lib/users';
import { createSession, sessionCookie, pruneExpiredSessions } from '@/lib/session';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The same message whether the address is unknown or the password is wrong.
 *
 * Distinguishing them would turn this endpoint into an account-enumeration
 * oracle — an attacker could confirm which of a leaked email list has an
 * account here.
 */
const GENERIC_ERROR = 'That email and password do not match.';

export async function POST(request: Request) {
  let body: Partial<LoginValues>;
  try {
    body = (await request.json()) as Partial<LoginValues>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const result = validateLogin(body);
  if (!result.valid || !result.normalised) {
    return NextResponse.json({ errors: result.errors }, { status: 422 });
  }
  const { email, password } = result.normalised;

  // Two limits, because either alone leaves a hole: the IP limit does not stop
  // a botnet spraying one account, and the email limit does not stop one host
  // working through a list of addresses.
  const ip = clientIp(request.headers);
  const [byIp, byEmail] = await Promise.all([
    checkRateLimit(`login-ip:${ip}`, 10, 15 * 60),
    checkRateLimit(`login-email:${email}`, 5, 15 * 60),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    return NextResponse.json(
      { error: 'Too many sign-in attempts. Try again in 15 minutes.' },
      { status: 429 }
    );
  }

  try {
    const user = await getUserByEmail(email);
    if (!user) {
      // Spend the same CPU as a real check so the response time says nothing.
      await fakePasswordCheck();
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const hash = await getPasswordHash(user.id);
    if (!hash || !(await verifyPassword(password, hash))) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    // Covers orders placed as a guest after the account was created.
    await claimGuestOrders(user.id, user.email);

    const token = await createSession(user.id, request.headers.get('user-agent'));
    await pruneExpiredSessions();

    const response = NextResponse.json({ user });
    response.cookies.set(sessionCookie.name, token, sessionCookie.options);
    return response;
  } catch (error) {
    console.error('[api/auth/login] failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
