import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { getOrderByReference } from '@/lib/orders';
import { isValidReference } from '@/lib/validation';
import { recordReminder, markLapsed, extendHold } from '@/lib/holds';
import { sendMail, holdReminderEmail, holdLapsedEmail } from '@/lib/mail';
import { HOLD_DAYS } from '@/lib/order-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ reference: string }>;
}

const ACTIONS = ['remind', 'lapse', 'extend'] as const;
type HoldAction = (typeof ACTIONS)[number];

/**
 * POST /api/admin/orders/:reference/hold — act on a hold, by hand.
 *
 * Nothing here happens on a schedule. An admin decides that this customer
 * should be nudged, or that this hold is over, or that this one deserves
 * longer, and presses the button. The database records what was done so the
 * next person to look at the order can see it.
 *
 *   remind  emails the customer that the hold is running out
 *   lapse   emails them that it has ended, and flags the order for a decision
 *   extend  gives them another HOLD_DAYS from now, reviving a lapsed hold
 *
 * `remind` carries the reminder count the admin was looking at. If somebody
 * else sent one in the meantime the count no longer matches, no row changes,
 * and this request is refused rather than sending a second email.
 */
export async function POST(request: Request, { params }: Context) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const { reference } = await params;
  if (!isValidReference(reference)) {
    return NextResponse.json({ error: 'Invalid reference.' }, { status: 400 });
  }

  let body: { action?: string; expectedReminderCount?: number; days?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const action = body.action as HoldAction;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `Unknown action. Expected one of: ${ACTIONS.join(', ')}.` },
      { status: 400 }
    );
  }

  const current = await getOrderByReference(reference);
  if (!current) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }
  // A hold only exists while an order is confirmed and unpaid. Acting on one
  // that has moved on would email a customer about a note they already own.
  if (current.status !== 'confirmed') {
    return NextResponse.json(
      { error: 'This order is not on hold — holds apply to confirmed, unpaid orders.' },
      { status: 409 }
    );
  }

  if (action === 'remind') {
    const expected =
      typeof body.expectedReminderCount === 'number'
        ? body.expectedReminderCount
        : current.holdReminderCount;
    const order = await recordReminder(reference, expected);
    if (!order) {
      return NextResponse.json(
        { error: 'A reminder was already sent since you loaded this page. Reload to see it.' },
        { status: 409 }
      );
    }
    const emailed = await sendMail(
      holdReminderEmail(order, Math.max(daysLeftOf(order.heldUntil), 0))
    );
    return NextResponse.json({ order, emailed });
  }

  if (action === 'lapse') {
    const order = await markLapsed(reference);
    if (!order) {
      return NextResponse.json(
        { error: 'This hold has already been marked as ended.' },
        { status: 409 }
      );
    }
    const emailed = await sendMail(holdLapsedEmail(order));
    return NextResponse.json({ order, emailed });
  }

  // extend — no email. The customer was not told the hold had ended, so
  // announcing that it has been extended would be answering a question they
  // never asked. It goes out with the next reminder, if one is sent.
  const days =
    typeof body.days === 'number' && body.days > 0 && body.days <= 90 ? body.days : HOLD_DAYS;
  const order = await extendHold(reference, days);
  if (!order) {
    return NextResponse.json({ error: 'Could not extend this hold.' }, { status: 409 });
  }
  return NextResponse.json({ order, emailed: false });
}

/** Whole days between now and a deadline. Kept local: the client shows its own. */
function daysLeftOf(heldUntil: string | null): number {
  if (!heldUntil) return 0;
  return Math.floor((Date.parse(heldUntil) - Date.now()) / 86_400_000);
}
