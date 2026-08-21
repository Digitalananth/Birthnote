import { NextResponse } from 'next/server';
import { validateNewPassword, isValidResetToken } from '@/lib/auth-validation';
import { consumeAdminResetToken } from '@/lib/password-reset';
import { getAdminById, setAdminPassword } from '@/lib/admin-users';
import { destroyAllAdminSessions, createAdminSession, adminCookie } from '@/lib/auth';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const { allowed } = await checkRateLimit(`admin-reset-submit:${ip}`, 10, 15 * 60);
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
    const adminId = await consumeAdminResetToken(token);
    if (!adminId) {
      return NextResponse.json(
        { error: 'That reset link has expired or has already been used.' },
        { status: 410 }
      );
    }

    // A deactivated admin must not be able to let themselves back in with an
    // invite link they were sent before their access was removed.
    const admin = await getAdminById(adminId);
    if (!admin?.isActive) {
      return NextResponse.json({ error: 'That account is no longer active.' }, { status: 403 });
    }

    await setAdminPassword(adminId, body.password as string);
    await destroyAllAdminSessions(adminId);

    const newToken = await createAdminSession(adminId, request.headers.get('user-agent'));
    const response = NextResponse.json({ ok: true });
    response.cookies.set(adminCookie.name, newToken, adminCookie.options);
    return response;
  } catch (error) {
    console.error('[api/admin/reset-password] failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
