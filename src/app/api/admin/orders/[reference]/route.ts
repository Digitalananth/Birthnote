import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import {
  getOrderByReference,
  updateOrderStatus,
  ORDER_STATUSES,
  type OrderStatus,
} from '@/lib/orders';
import { isValidReference } from '@/lib/validation';
import {
  sendMail,
  availabilityConfirmedEmail,
  unavailableEmail,
  shippedEmail,
} from '@/lib/mail';

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
  if (!(await isAdminAuthenticated())) {
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

  const str = (key: string) => (body[key] == null ? null : String(body[key]).trim() || null);

  const order = await updateOrderStatus(reference, {
    status,
    note: str('note'),
    noteDenomination: str('noteDenomination'),
    noteCondition: str('noteCondition'),
    noteSerial: str('noteSerial'),
    noteCountry: str('noteCountry'),
    trackingNumber: str('trackingNumber'),
    pricePence:
      typeof body.pricePence === 'number' && body.pricePence > 0
        ? Math.round(body.pricePence)
        : null,
  });

  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  let emailed = false;
  if (body.notify !== false) {
    if (status === 'confirmed') emailed = await sendMail(availabilityConfirmedEmail(order));
    else if (status === 'unavailable') emailed = await sendMail(unavailableEmail(order));
    else if (status === 'shipped') emailed = await sendMail(shippedEmail(order));
  }

  return NextResponse.json({ order, emailed });
}

/** GET /api/admin/orders/:reference — full record including admin fields. */
export async function GET(_request: Request, { params }: Context) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const { reference } = await params;
  const order = await getOrderByReference(reference);
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  return NextResponse.json({ order });
}
