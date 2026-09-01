import { NextResponse } from 'next/server';
import { requireOwnerApi } from '@/lib/admin-api';
import { getOrderByReference } from '@/lib/orders';
import { issueInvoiceForOrder, InvoiceNotIssuableError } from '@/lib/invoices';
import { isValidReference } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/orders/[reference]/invoice — raise the invoice by hand.
 *
 * An invoice is normally raised the moment Stripe confirms payment. This is
 * for the case where that failed — most likely because the seller's GSTIN had
 * not been filled in yet — so the owner can issue it once the settings are
 * right, without the customer having to pay again.
 *
 * Issuing is idempotent, so pressing it twice returns the first invoice rather
 * than raising a second.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  const auth = await requireOwnerApi();
  if (auth.error) return auth.error;

  const { reference } = await params;
  if (!isValidReference(reference)) {
    return NextResponse.json({ error: 'Invalid reference number.' }, { status: 400 });
  }

  const order = await getOrderByReference(reference);
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (order.status !== 'paid' && order.status !== 'shipped') {
    return NextResponse.json(
      { error: 'An invoice is only raised once the order has been paid for.' },
      { status: 409 }
    );
  }

  try {
    const invoice = await issueInvoiceForOrder(order);
    return NextResponse.json({ ok: true, number: invoice.number });
  } catch (error) {
    if (error instanceof InvoiceNotIssuableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('[admin/invoice] issue failed', error);
    return NextResponse.json({ error: 'Could not issue the invoice.' }, { status: 500 });
  }
}
