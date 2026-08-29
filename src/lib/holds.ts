import 'server-only';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { query } from '@/lib/db';
import { getOrderByReference, type Order } from '@/lib/orders';
import { HOLD_DAYS, HOLD_SOON_DAYS } from '@/lib/order-types';

/**
 * The hold on a confirmed note.
 *
 * The system *tracks* the hold — when it started, when it runs out, what has
 * been sent — but never acts on it. Chasing a customer is a judgement call:
 * whether this person wants a nudge, whether the note is worth holding
 * longer, whether the relationship is better served by silence. An admin makes
 * that call and presses the button; nothing here runs on a timer.
 *
 * What the recorded state buys is a queue that cannot be forgotten: the admin
 * sees which holds are running out and which have expired, instead of trying
 * to remember which emails they sent last week.
 *
 * Every write is still conditional on the state it expects, so a double-click
 * on "Send reminder" sends one email rather than two.
 */

/** Starts the hold. Called when an order becomes `confirmed`. */
export async function startHold(orderId: number): Promise<void> {
  await query(
    `UPDATE orders
        SET held_until = UTC_TIMESTAMP() + INTERVAL ? DAY,
            hold_reminder_count = 0,
            hold_lapsed_at = NULL
      WHERE id = ?`,
    [HOLD_DAYS, orderId]
  );
}

/** Clears the hold. Called when an order leaves `confirmed` for any reason. */
export async function clearHold(orderId: number): Promise<void> {
  await query('UPDATE orders SET held_until = NULL, hold_lapsed_at = NULL WHERE id = ?', [orderId]);
}

/**
 * Records that a reminder has been sent, returning the order only if this call
 * was the one that recorded it.
 *
 * The count is passed in by the caller, which read it from the order it is
 * showing. Two admins looking at the same order therefore cannot both send:
 * the second one's expected count no longer matches and it changes no row.
 */
export async function recordReminder(
  reference: string,
  expectedCount: number
): Promise<Order | null> {
  const result = await query<ResultSetHeader>(
    `UPDATE orders SET hold_reminder_count = hold_reminder_count + 1
      WHERE reference = ? AND status = 'confirmed' AND hold_reminder_count = ?`,
    [reference, expectedCount]
  );
  if (!result.affectedRows) return null;
  return getOrderByReference(reference);
}

/**
 * Marks the hold ended.
 *
 * Allowed before the deadline as well as after — an admin who has sold the
 * note, or simply wants to stop holding it, should not have to wait for a
 * clock. The order stays `confirmed` and payable; ending a hold is a statement
 * about the promise, not a cancellation of the order.
 */
export async function markLapsed(reference: string): Promise<Order | null> {
  const result = await query<ResultSetHeader>(
    `UPDATE orders SET hold_lapsed_at = UTC_TIMESTAMP()
      WHERE reference = ? AND status = 'confirmed' AND hold_lapsed_at IS NULL`,
    [reference]
  );
  if (!result.affectedRows) return null;
  return getOrderByReference(reference);
}

/**
 * Gives the customer more time, from now.
 *
 * Clears `hold_lapsed_at`, so an expired hold can be revived — the common case
 * being a customer who gets in touch a day late and is told yes.
 */
export async function extendHold(reference: string, days = HOLD_DAYS): Promise<Order | null> {
  const result = await query<ResultSetHeader>(
    `UPDATE orders
        SET held_until = UTC_TIMESTAMP() + INTERVAL ? DAY, hold_lapsed_at = NULL
      WHERE reference = ? AND status = 'confirmed'`,
    [days, reference]
  );
  if (!result.affectedRows) return null;
  return getOrderByReference(reference);
}

export interface HoldCounts {
  /** Confirmed, hold still running, deadline within HOLD_SOON_DAYS. */
  expiringSoon: number;
  /** Confirmed, deadline passed or ended by hand, still unpaid. */
  lapsed: number;
}

export async function getHoldCounts(): Promise<HoldCounts> {
  const rows = await query<(RowDataPacket & { expiring_soon: number; lapsed: number })[]>(
    `SELECT
       SUM(hold_lapsed_at IS NULL AND held_until > UTC_TIMESTAMP()
           AND held_until <= UTC_TIMESTAMP() + INTERVAL ? DAY) AS expiring_soon,
       SUM(hold_lapsed_at IS NOT NULL OR held_until <= UTC_TIMESTAMP()) AS lapsed
     FROM orders
     WHERE status = 'confirmed' AND held_until IS NOT NULL`,
    [HOLD_SOON_DAYS]
  );
  return {
    expiringSoon: Number(rows[0]?.expiring_soon ?? 0),
    lapsed: Number(rows[0]?.lapsed ?? 0),
  };
}

/** Whole days left on a hold, or null when there is none. Negative when past. */
export function daysLeft(heldUntil: string | null): number | null {
  if (!heldUntil) return null;
  return Math.floor((Date.parse(heldUntil) - Date.now()) / 86_400_000);
}
