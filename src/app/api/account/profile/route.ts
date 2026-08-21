import { NextResponse } from 'next/server';
import { validateProfile, normaliseEmail, type ProfileValues } from '@/lib/auth-validation';
import { getCurrentUser } from '@/lib/session';
import {
  updateProfile,
  changeEmail,
  getPasswordHash,
  verifyPassword,
  claimGuestOrders,
  EmailTakenError,
} from '@/lib/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/account/profile
 *
 * Name, phone and WhatsApp change freely. Email is different: it is the login
 * identifier and the address every order email goes to, so changing it
 * requires the current password.
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let body: Partial<ProfileValues> & { email?: string; currentPassword?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const result = validateProfile(body);
  if (!result.valid || !result.normalised) {
    return NextResponse.json({ errors: result.errors }, { status: 422 });
  }

  const newEmail = normaliseEmail(body.email ?? '');
  const emailChanging = Boolean(newEmail) && newEmail !== user.email;

  try {
    if (emailChanging) {
      const hash = await getPasswordHash(user.id);
      if (!hash || !(await verifyPassword(body.currentPassword ?? '', hash))) {
        return NextResponse.json(
          { errors: { currentPassword: 'Enter your current password to change your email' } },
          { status: 403 }
        );
      }
      await changeEmail(user.id, newEmail);
      // The new address may already have guest orders against it.
      await claimGuestOrders(user.id, newEmail);
    }

    const updated = await updateProfile(user.id, result.normalised);
    return NextResponse.json({ user: updated });
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return NextResponse.json(
        { errors: { email: 'Another account already uses that email address.' } },
        { status: 409 }
      );
    }
    console.error('[api/account/profile] failed', error);
    return NextResponse.json({ error: 'We could not save your changes.' }, { status: 500 });
  }
}
