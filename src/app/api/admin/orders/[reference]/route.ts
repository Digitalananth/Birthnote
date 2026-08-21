import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import {
  getOrderByReference,
  updateOrderStatus,
  availableItems,
  ORDER_STATUSES,
  type OrderStatus,
} from '@/lib/orders';
import { isValidReference } from '@/lib/validation';
import { sendMail, availabilityConfirmedEmail, unavailableEmail, shippedEmail } from '@/lib/mail';
import {
  sendWhatsApp,
  whatsAppRecipient,
  orderConfirmedWhatsApp,
  orderUnavailableWhatsApp,
  orderShippedWhatsApp,
} from '@/lib/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ reference: string }>;
}

/**
 * PATCH /api/admin/orders/:reference — move an order along the pipeline.
 *
 * Each status change also sends the customer-facing email for that step, so
 * the admin never has to write one by hand.
 */
export async function PATCH(request: Request, { params }: Context) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const { reference } = await params;
  if (!isValidReference(reference)) {
    return NextResponse.json({ error: 'Invalid reference.' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const status = String(body.status || '') as OrderStatus;
  if (!ORDER_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${ORDER_STATUSES.join(', ')}` },
      { status: 422 }
    );
  }
  // Payment state is owned by the Stripe webhook, never by a human click.
  if (status === 'paid') {
    return NextResponse.json(
      { error: 'Paid status is set by the Stripe webhook, not manually.' },
      { status: 409 }
    );
  }

  /*
   * Two statuses are claims about the notes, so they are checked against the
   * notes rather than trusted. The admin UI already disables these buttons —
   * but a disabled button is presentation, and confirming an order with
   * nothing priced would email the customer a payment link for ₹0.
   */
  if (status === 'confirmed' || status === 'unavailable') {
    const current = await getOrderByReference(reference);
    if (!current) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

    if (status === 'confirmed') {
      const priced = availableItems(current).filter((item) => (item.pricePaise ?? 0) > 0);
      if (!priced.length) {
        return NextResponse.json(
          { error: 'Mark at least one note found and give it a price before confirming.' },
          { status: 409 }
        );
      }
    } else if (!current.items.every((item) => item.availability === 'unavailable')) {
      return NextResponse.json(
        {
          error:
            'Some notes are still found or unchecked. Mark every note not found before declining the whole order.',
        },
        { status: 409 }
      );
    }
  }

  // What was found for each note, and its price, are set per note through
  // /items/:id — this route only moves the order as a whole.
  const str = (key: string) => (body[key] == null ? null : String(body[key]).trim() || null);

  const order = await updateOrderStatus(reference, {
    status,
    // The timeline names whoever made the change, now that there is more than
    // one person who could have.
    actor: admin.email,
    note: str('note'),
    trackingNumber: str('trackingNumber'),
  });

  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  let emailed = false;
  let messaged = false;
  if (body.notify !== false) {
    if (status === 'confirmed') {
      emailed = await sendMail(availabilityConfirmedEmail(order));
      if (whatsAppRecipient(order)) messaged = await sendWhatsApp(orderConfirmedWhatsApp(order));
    } else if (status === 'unavailable') {
      emailed = await sendMail(unavailableEmail(order));
      if (whatsAppRecipient(order)) messaged = await sendWhatsApp(orderUnavailableWhatsApp(order));
    } else if (status === 'shipped') {
      emailed = await sendMail(shippedEmail(order));
      if (whatsAppRecipient(order)) messaged = await sendWhatsApp(orderShippedWhatsApp(order));
    }
  }

  return NextResponse.json({ order, emailed, messaged });
}

/** GET /api/admin/orders/:reference — full record including admin fields. */
export async function GET(_request: Request, { params }: Context) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const { reference } = await params;
  const order = await getOrderByReference(reference);
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  return NextResponse.json({ order });
}
