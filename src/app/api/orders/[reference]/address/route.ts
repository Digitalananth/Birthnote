import { NextResponse } from 'next/server';
import { getOrderByReference, saveShippingAddress } from '@/lib/orders';
import { validateAddress, type AddressInput } from '@/lib/address';
import { isValidReference } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/orders/[reference]/address — public: where to send the parcel.
 *
 * Public because the order is: a guest holds nothing but the reference, and
 * requiring an account to give a delivery address would strand every guest
 * order at the point of payment. The reference is the capability, exactly as
 * it already is for the tracking and payment pages.
 *
 * Saving re-prices the order, because the state decides whether the tax is
 * CGST + SGST or IGST. The total does not move; the breakup does.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;
  if (!isValidReference(reference)) {
    return NextResponse.json({ error: 'Invalid reference number.' }, { status: 400 });
  }

  let body: AddressInput;
  try {
    body = (await request.json()) as AddressInput;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { address, errors } = validateAddress(body);
  if (!address) {
    return NextResponse.json(
      { error: 'Please check the highlighted fields.', errors },
      { status: 400 }
    );
  }

  const order = await saveShippingAddress(reference, address);
  if (!order) {
    // Either there is no such order, or it is not one that can still be
    // addressed — a paid order's address is part of an issued invoice.
    const existing = await getOrderByReference(reference);
    return NextResponse.json(
      {
        error: existing
          ? 'This order can no longer be changed. Please contact us if the address is wrong.'
          : 'Order not found.',
      },
      { status: existing ? 409 : 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    money: {
      itemsSubtotalPaise: order.pricePaise,
      shippingPaise: order.shippingPaise,
      cgstPaise: order.cgstPaise,
      sgstPaise: order.sgstPaise,
      igstPaise: order.igstPaise,
      taxPaise: order.taxPaise,
      totalPaise: order.totalPaise,
    },
  });
}
