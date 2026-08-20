import { NextResponse } from 'next/server';
import { validateRequest, type RequestFormValues } from '@/lib/validation';
import { createOrder } from '@/lib/orders';
import { sendMail, requestReceivedEmail, newRequestAdminEmail } from '@/lib/mail';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

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

  const result = validateRequest(payload);
  if (!result.valid || !result.normalised) {
    return NextResponse.json({ errors: result.errors }, { status: 422 });
  }

  const values = result.normalised;

  try {
    const order = await createOrder({
      noteDate: values.noteDate,
      displayDate: values.displayDate,
      customerName: values.name,
      customerEmail: values.email,
      giftFor: values.giftFor,
      message: values.message,
    });

    // Email is a side effect: awaited so SMTP errors are logged, but its
    // failure never fails the request — the order is already safely stored.
    await sendMail(requestReceivedEmail(order));
    const adminMail = newRequestAdminEmail(order);
    if (adminMail) await sendMail(adminMail);

    return NextResponse.json(
      {
        reference: order.reference,
        displayDate: order.displayDate,
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
