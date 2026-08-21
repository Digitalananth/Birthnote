import { NextResponse } from 'next/server';
import { validateNewPassword, isValidResetToken } from '@/lib/auth-validation';
import { consumeResetToken } from '@/lib/password-reset';
import { getUserById, setPassword } from '@/lib/users';
import { destroyAllSessions, createSession, sessionCookie } from '@/lib/session';
import { sendMail, passwordChangedEmail } from '@/lib/mail';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const { allowed } = await checkRateLimit(`reset-submit:${ip}`, 10, 15 * 60);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  let body: { token?: string; password?: string; confirmPassword?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const token = (body.token || '').trim();
  if (!isValidResetToken(token)) {
    return NextResponse.json({ error: 'That reset link is not valid.' }, { status: 400 });
  }

  const result = validateNewPassword(body);
  if (!result.valid) {
    return NextResponse.json({ errors: result.errors }, { status: 422 });
  }

  try {
    const userId = await consumeResetToken(token);
    if (!userId) {
      return NextResponse.json(
        { error: 'That reset link has expired or has already been used.' },
        { status: 410 }
      );
    }

    await setPassword(userId, body.password as string);

    // Whoever forced the reset may already be signed in somewhere. Clearing
    // every session, then issuing a fresh one, locks them out.
    await destroyAllSessions(userId);

    const user = await getUserById(userId);
    if (user) await sendMail(passwordChangedEmail(user));

    const newToken = await createSession(userId, request.headers.get('user-agent'));
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookie.name, newToken, sessionCookie.options);
    return response;
  } catch (error) {
    console.error('[api/auth/reset-password] failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
