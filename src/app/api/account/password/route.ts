import { NextResponse } from 'next/server';
import { validateNewPassword } from '@/lib/auth-validation';
import { getCurrentUser, destroyAllSessions, createSession, sessionCookie } from '@/lib/session';
import { getPasswordHash, verifyPassword, setPassword } from '@/lib/users';
import { sendMail, passwordChangedEmail } from '@/lib/mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PATCH /api/account/password — change password while signed in. */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let body: { currentPassword?: string; password?: string; confirmPassword?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const result = validateNewPassword(body);
  if (!result.valid) {
    return NextResponse.json({ errors: result.errors }, { status: 422 });
  }

  try {
    const hash = await getPasswordHash(user.id);
    if (!hash || !(await verifyPassword(body.currentPassword ?? '', hash))) {
      return NextResponse.json(
        { errors: { currentPassword: 'That is not your current password' } },
        { status: 403 }
      );
    }

    await setPassword(user.id, body.password as string);

    // Sign out everywhere, then re-issue a session for this device, so the
    // person who just changed the password is not logged out of it.
    await destroyAllSessions(user.id);
    await sendMail(passwordChangedEmail(user));

    const token = await createSession(user.id, request.headers.get('user-agent'));
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookie.name, token, sessionCookie.options);
    return response;
  } catch (error) {
    console.error('[api/account/password] failed', error);
    return NextResponse.json({ error: 'We could not change your password.' }, { status: 500 });
  }
}
