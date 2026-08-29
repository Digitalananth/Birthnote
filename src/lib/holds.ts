import 'server-only';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { query, transaction } from '@/lib/db';
import { getOrderByReference, type Order } from '@/lib/orders';
import { HOLD_DAYS, HOLD_REMINDER_DAYS_LEFT } from '@/lib/order-types';

/**
 * The lifecycle of the promise "held for you for HOLD_DAYS days".
 *
 * Confirming an order starts the clock; the sweep chases it and then stops
 * pretending. Nothing here cancels an order — a lapsed hold is flagged for a
 * human, because releasing a real customer's note is a decision the system
 * should not make on its own.
 *
 * Every write is conditional on the state it expects to find, so two sweeps
 * running at once (or one running twice) cannot send the same reminder twice.
 * That is the same guarantee `markOrderPaid` gives against Stripe's retries.
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

export interface DueReminder {
  reference: string;
  /** Whole days left on the hold, floored — what the customer is told. */
  daysLeft: number;
}

/**
 * Confirmed orders whose next reminder is due.
 *
 * `hold_reminder_count` doubles as the index into HOLD_REMINDER_DAYS_LEFT, so
 * an order that has had none is due the first threshold, one that has had one
 * is due the second, and one that has had them all is due nothing. Ordering by
 * held_until means the most urgent is handled first if a run is cut short.
 */
export async function findDueReminders(): Promise<DueReminder[]> {
  const thresholds = HOLD_REMINDER_DAYS_LEFT;
  const cases = thresholds
    .map((days, index) => `WHEN hold_reminder_count = ${index} THEN ${days}`)
    .join(' ');

  const rows = await query<(RowDataPacket & { reference: string; days_left: string })[]>(
    `SELECT reference,
            TIMESTAMPDIFF(HOUR, UTC_TIMESTAMP(), held_until) / 24 AS days_left
       FROM orders
      WHERE status = 'confirmed'
        AND held_until IS NOT NULL
        AND hold_lapsed_at IS NULL
        AND hold_reminder_count < ${thresholds.length}
        AND held_until > UTC_TIMESTAMP()
        AND TIMESTAMPDIFF(HOUR, UTC_TIMESTAMP(), held_until) / 24
            <= CASE ${cases} END
      ORDER BY held_until ASC
      LIMIT 100`
  );

  return rows.map((row) => ({
    reference: row.reference,
    daysLeft: Math.max(Math.floor(Number(row.days_left)), 0),
  }));
}

/**
 * Claims the next reminder for an order, returning it only if this caller won.
 *
 * The UPDATE names the count it expects, so of two workers looking at the same
 * order exactly one changes a row and exactly one sends an email.
 */
export async function claimReminder(
  reference: string
): Promise<{ order: Order; sequence: number } | null> {
  return transaction(async (conn) => {
    const [rows] = await conn.execute<
      (RowDataPacket & { id: number; hold_reminder_count: number })[]
    >(
      `SELECT id, hold_reminder_count FROM orders
        WHERE reference = ? AND status = 'confirmed' LIMIT 1 FOR UPDATE`,
      [reference]
    );
    if (!rows.length) return null;
    const { id, hold_reminder_count: count } = rows[0];
    if (count >= HOLD_REMINDER_DAYS_LEFT.length) return null;

    const [result] = await conn.execute<ResultSetHeader>(
      `UPDATE orders SET hold_reminder_count = hold_reminder_count + 1
        WHERE id = ? AND hold_reminder_count = ?`,
      [id, count]
    );
    if (!result.affectedRows) return null;

    const order = await getOrderByReference(reference);
    return order ? { order, sequence: count + 1 } : null;
  });
}

/**
 * Confirmed orders whose hold has run out and not yet been marked lapsed.
 */
export async function findLapsedHolds(): Promise<string[]> {
  const rows = await query<(RowDataPacket & { reference: string })[]>(
    `SELECT reference FROM orders
      WHERE status = 'confirmed'
        AND held_until IS NOT NULL
        AND hold_lapsed_at IS NULL
        AND held_until <= UTC_TIMESTAMP()
      ORDER BY held_until ASC
      LIMIT 100`
  );
  return rows.map((row) => row.reference);
}

/**
 * Marks a hold lapsed, returning the order only if this caller was the one
 * that marked it — so the "your hold has run out" email goes exactly once.
 *
 * The status is deliberately left at `confirmed`: the note is still findable,
 * still payable, and whether to sell it to somebody else is a human's call.
 */
export async function lapseHold(reference: string): Promise<Order | null> {
  const result = await query<ResultSetHeader>(
    `UPDATE orders SET hold_lapsed_at = UTC_TIMESTAMP()
      WHERE reference = ? AND status = 'confirmed' AND hold_lapsed_at IS NULL
        AND held_until IS NOT NULL AND held_until <= UTC_TIMESTAMP()`,
    [reference]
  );
  if (!result.affectedRows) return null;
  return getOrderByReference(reference);
}

/** Confirmed orders whose hold has lapsed, for the admin dashboard. */
export async function countLapsedHolds(): Promise<number> {
  const rows = await query<(RowDataPacket & { n: number })[]>(
    `SELECT COUNT(*) AS n FROM orders WHERE status = 'confirmed' AND hold_lapsed_at IS NOT NULL`
  );
  return Number(rows[0]?.n ?? 0);
}
