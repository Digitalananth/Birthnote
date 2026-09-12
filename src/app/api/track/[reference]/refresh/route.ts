import { NextResponse } from 'next/server';
import { getOrderByReference } from '@/lib/orders';
import { refreshForCustomer } from '@/lib/tracking';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';
import { isValidReference } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ reference: string }>;
}

/**
 * POST /api/track/:reference/refresh — the customer's "Refresh" button.
 *
 * Public, like the tracking page it sits on, so it is limited twice: per
 * visitor here, and per order in `refreshForCustomer`, which asks Shiprocket
 * at most once every two minutes whoever presses. Either way the answer is
 * the same shape, and the page reloads to show what is saved.
 */
export async function POST(request: Request, { params }: Context) {
  const { reference } = await params;
  if (!isValidReference(reference)) {
    return NextResponse.json({ error: 'Invalid reference.' }, { status: 400 });
  }

  const limit = await checkRateLimit(`track-refresh-ip:${clientIp(request.headers)}`, 20, 15 * 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many refreshes. Please try again in a few minutes.' },
      { status: 429 }
    );
  }

  const order = await getOrderByReference(reference);
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

  const asked = await refreshForCustomer(order);
  return NextResponse.json({ refreshed: asked });
}
