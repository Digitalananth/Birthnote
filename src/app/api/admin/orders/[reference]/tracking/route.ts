import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { getOrderByReference } from '@/lib/orders';
import { ShiprocketError } from '@/lib/shiprocket';
import { syncTracking } from '@/lib/tracking';
import { isValidReference } from '@/lib/validation';
import { recordError } from '@/server/errors';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ reference: string }>;
}

/**
 * POST /api/admin/orders/:reference/tracking — read the parcel's full scan
 * history from Shiprocket's tracking API and bring the order up to date.
 *
 * The webhook only sends what happens after it is working; this fetches
 * everything that has happened, so an order whose early scans were never
 * delivered — or were sent before its AWB was saved — catches up in one press.
 */
export async function POST(_request: Request, { params }: Context) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  if (!env.shiprocket.configured()) {
    return NextResponse.json({ error: 'Shiprocket is not configured.' }, { status: 503 });
  }

  const { reference } = await params;
  if (!isValidReference(reference)) {
    return NextResponse.json({ error: 'Invalid reference.' }, { status: 400 });
  }
  const order = await getOrderByReference(reference);
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (!order.trackingNumber) {
    return NextResponse.json({ error: 'This order has no AWB yet.' }, { status: 409 });
  }

  try {
    const added = await syncTracking(order);
    return NextResponse.json({ order: await getOrderByReference(reference), added });
  } catch (error) {
    recordError('shiprocket.track', error, reference);
    const message =
      error instanceof ShiprocketError ? error.message : 'Shiprocket could not be reached.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
