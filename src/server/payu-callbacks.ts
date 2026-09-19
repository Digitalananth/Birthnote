import 'server-only';
import type { RowDataPacket } from 'mysql2/promise';
import { query } from '@/lib/db';
import { recordError, redact } from '@/server/errors';
import type { Order } from '@/lib/orders';
import type { SettleOutcome } from '@/server/settle';

/**
 * A log of every call PayU makes to us — the return leg and the webhook —
 * whatever became of it.
 *
 * A callback that settled an order left a paid order behind it; one that was
 * refused, or matched nothing, left nothing at all, so "did PayU call us about
 * this payment?" could only be answered from PayU's side. The row holds what
 * was decided and why, never the form: a refused call's body is untrusted text
 * nobody needs to keep.
 */
export type CallbackSource = 'return' | 'webhook';

export type CallbackOutcome =
  | SettleOutcome
  /** A signed failure or pending status: received, and nothing to settle. */
  | 'failure'
  /** A refund notification, confirmed with PayU or not — see `detail`. */
  | 'refund'
  | 'ignored'
  | 'bad_hash'
  | 'invalid'
  | 'failed';

export interface PayuCallback {
  receivedAt: string;
  source: CallbackSource;
  outcome: CallbackOutcome;
  txnId: string | null;
  payuStatus: string | null;
  detail: string | null;
}

/** Records one callback, whatever became of it. Never throws. */
export async function recordPayuCallback(fields: {
  source: CallbackSource;
  outcome: CallbackOutcome;
  txnId?: string | null;
  orderId?: number | null;
  payuStatus?: string | null;
  detail?: string | null;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO payu_callbacks (source, outcome, txn_id, order_id, payu_status, detail)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        fields.source,
        fields.outcome,
        fields.txnId ? fields.txnId.slice(0, 255) : null,
        fields.orderId ?? null,
        fields.payuStatus ? fields.payuStatus.slice(0, 40) : null,
        fields.detail ? redact(fields.detail).slice(0, 500) : null,
      ]
    );
  } catch (error) {
    recordError('payu-callback.log', error);
  }
}

interface CallbackRow extends RowDataPacket {
  received_at: Date;
  source: CallbackSource;
  outcome: CallbackOutcome;
  txn_id: string | null;
  payu_status: string | null;
  detail: string | null;
}

/**
 * The callbacks that concern this order, newest first — matched to it, or
 * carrying one of its txnids and matched to nothing.
 */
export async function listPayuCallbacks(order: Order, limit = 15): Promise<PayuCallback[]> {
  const rows = await query<CallbackRow[]>(
    `SELECT received_at, source, outcome, txn_id, payu_status, detail
       FROM payu_callbacks
      WHERE order_id = ?
         OR txn_id IN (SELECT txn_id FROM order_payment_attempts WHERE order_id = ?)
      ORDER BY received_at DESC, id DESC
      LIMIT ${Math.max(1, Math.min(100, limit))}`,
    [order.id, order.id]
  );
  return rows.map((row) => ({
    receivedAt: row.received_at.toISOString(),
    source: row.source,
    outcome: row.outcome,
    txnId: row.txn_id,
    payuStatus: row.payu_status,
    detail: row.detail,
  }));
}

/** The most recent callback for any order: is PayU calling us at all? */
export async function lastPayuCallback(): Promise<{
  receivedAt: string;
  source: CallbackSource;
  outcome: CallbackOutcome;
} | null> {
  const rows = await query<CallbackRow[]>(
    'SELECT received_at, source, outcome FROM payu_callbacks ORDER BY id DESC LIMIT 1'
  );
  return rows.length
    ? {
        receivedAt: rows[0].received_at.toISOString(),
        source: rows[0].source,
        outcome: rows[0].outcome,
      }
    : null;
}
