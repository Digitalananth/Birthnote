import { NextResponse } from 'next/server';
import { validateProfile, type ProfileValues } from '@/lib/auth-validation';
import { getCurrentUser } from '@/lib/session';
import { updateProfile, changeEmail, EmailTakenError } from '@/lib/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/account/profile
 *
 * Name, email and WhatsApp all change freely. That is a change from when this
 * route asked for a password before touching the email: the address used to be
 * the login identifier, and is now an optional place to send receipts, so
 * guarding it bought nothing.
 *
 * The mobile number is what changed places with it — it is the identifier now,
 * so it is not in `ProfileValues` at all and cannot be edited here.
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let body: Partial<ProfileValues>;
  try {
    body = (await request.json()) as Partial<ProfileValues>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const result = validateProfile(body);
  if (!result.valid || !result.normalised) {
    return NextResponse.json({ errors: result.errors }, { status: 422 });
  }
  const { name, email, whatsapp } = result.normalised;

  try {
    if (email !== user.email) {
      // `changeEmail` leaves the address unverified, and it stays that way
      // until a code sent to it says otherwise. Nothing here claims the guest
      // orders sitting against it: an address typed into this form is not
      // proof of holding it, and a claim cannot be undone — see
      // `claimGuestOrders`.
      await changeEmail(user.id, email);
    }

    const updated = await updateProfile(user.id, { name, whatsapp });
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
