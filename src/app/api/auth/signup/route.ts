import { NextResponse } from 'next/server';
import { validateSignup, type SignupValues } from '@/lib/auth-validation';
import { createUser, claimGuestOrders, EmailTakenError } from '@/lib/users';
import { createSession, sessionCookie } from '@/lib/session';
import { sendMail, welcomeEmail } from '@/lib/mail';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/auth/signup — create an account and sign in. */
export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const { allowed } = await checkRateLimit(`signup:${ip}`, 5, 60 * 60);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many accounts created from this address. Try again later.' },
      { status: 429 }
    );
  }

  let body: Partial<SignupValues>;
  try {
    body = (await request.json()) as Partial<SignupValues>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const result = validateSignup(body);
  if (!result.valid || !result.normalised) {
    return NextResponse.json({ errors: result.errors }, { status: 422 });
  }

  try {
    const user = await createUser(result.normalised);

    // Orders placed before signing up belong to this person too.
    await claimGuestOrders(user.id, user.email);

    const token = await createSession(user.id, request.headers.get('user-agent'));
    await sendMail(welcomeEmail(user));

    const response = NextResponse.json({ user }, { status: 201 });
    response.cookies.set(sessionCookie.name, token, sessionCookie.options);
    return response;
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return NextResponse.json(
        { errors: { email: 'That email already has an account. Sign in instead.' } },
        { status: 409 }
      );
    }
    console.error('[api/auth/signup] failed', error);
    return NextResponse.json(
      { error: 'We could not create your account. Please try again in a moment.' },
      { status: 500 }
    );
  }
}
