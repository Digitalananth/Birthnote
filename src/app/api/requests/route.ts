import { NextResponse } from 'next/server';
import { validateRequest, type RequestFormValues } from '@/lib/validation';
import { createOrder, summariseOrder } from '@/lib/orders';
import { sendMail, requestReceivedEmail, newRequestAdminEmail } from '@/lib/mail';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';
import { getCurrentUser } from '@/lib/session';
import { updateProfile, changeEmail, type User } from '@/lib/users';
import { sendWhatsApp, orderReceivedWhatsApp, whatsAppRecipient } from '@/lib/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/requests — public: create a banknote request. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const payload = (body ?? {}) as Partial<RequestFormValues> & { website?: string };

  // Honeypot: a hidden field only a bot fills in. Answer 200 so the bot
  // believes it succeeded and does not retry with a different strategy.
  if (payload.website) {
    return NextResponse.json({ reference: 'BN-000000-XXXX', status: 'pending' }, { status: 201 });
  }

  const ip = clientIp(request.headers);
  const { allowed } = await checkRateLimit(`requests:${ip}`, 5, 60 * 60);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests from this address. Please try again later.' },
      { status: 429 }
    );
  }

  // A signed-in customer owns the order; guests still get one with no owner.
  const user = await getCurrentUser();

  const result = validateRequest(payload);
  if (!result.valid || !result.normalised) {
    return NextResponse.json({ errors: result.errors }, { status: 422 });
  }

  const values = result.normalised;

  try {
    // An account created with a mobile number alone has no name or address
    // yet, so the form asked for them and what came back is used — and, below,
    // kept on the account so it is only ever asked once.
    const order = await createOrder({
      customerName: user?.name || values.name,
      customerEmail: user?.email || values.email,
      userId: user?.id ?? null,
      message: values.message,
      whatsapp: values.whatsapp,
      whatsappOptIn: values.whatsappOptIn,
      items: values.items.map((item) => ({
        noteDate: item.noteDate,
        displayDate: item.displayDate,
        requestedDenomination: item.denomination,
        giftRelationship: item.giftRelationship,
        giftFor: item.giftFor,
      })),
    });

    // Backfill the account with whatever it was still missing, so a
    // mobile-only account is asked for its name and address exactly once.
    // Best-effort on purpose: if the address turns out to belong to someone
    // else's account the order still stands, it simply is not saved here.
    if (user && (!user.name || !user.email)) {
      await backfillAccountDetails(user, order.customerName, order.customerEmail);
    }

    // Email is a side effect: awaited so SMTP errors are logged, but its
    // failure never fails the request — the order is already safely stored.
    await sendMail(requestReceivedEmail(order));
    const adminMail = newRequestAdminEmail(order);
    if (adminMail) await sendMail(adminMail);

    // Same rule as email: a side effect of the order, never part of it.
    if (whatsAppRecipient(order)) await sendWhatsApp(orderReceivedWhatsApp(order));

    return NextResponse.json(
      {
        reference: order.reference,
        summary: summariseOrder(order),
        itemCount: order.items.length,
        status: order.status,
        trackUrl: `/track-order/${order.reference}`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[api/requests] failed to create order', error);
    return NextResponse.json(
      { error: 'We could not save your request. Please try again in a moment.' },
      { status: 500 }
    );
  }
}

/**
 * Saves the name and email an order collected onto the account behind it.
 *
 * Only ever fills blanks — an account that already has a name or an address
 * keeps it, because the profile page is where those are changed and an order
 * form must not quietly overwrite them.
 */
async function backfillAccountDetails(user: User, name: string, email: string): Promise<void> {
  try {
    if (!user.name && name) {
      await updateProfile(user.id, { name, whatsapp: user.whatsapp });
    }
    if (!user.email && email) {
      await changeEmail(user.id, email);
    }
  } catch (error) {
    // Includes the address already being on another account. Logged, not
    // raised: the order is stored and the customer is owed a confirmation.
    console.error('[api/requests] could not backfill account details', error);
  }
}
