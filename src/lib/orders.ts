import 'server-only';
import { randomBytes } from 'node:crypto';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { getPool, query, transaction } from '@/lib/db';
import { env } from '@/lib/env';

export type OrderStatus =
  | 'pending'
  | 'checking'
  | 'confirmed'
  | 'unavailable'
  | 'paid'
  | 'shipped';

export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'checking',
  'confirmed',
  'unavailable',
  'paid',
  'shipped',
];

export interface Order {
  id: number;
  reference: string;
  noteDate: string;
  displayDate: string;
  customerName: string;
  customerEmail: string;
  giftFor: string | null;
  message: string | null;
  status: OrderStatus;
  pricePaise: number;
  currency: string;
  noteDenomination: string | null;
  noteCondition: string | null;
  noteSerial: string | null;
  noteCountry: string | null;
  adminNotes: string | null;
  stripeSessionId: string | null;
  paidAt: string | null;
  trackingNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderEvent {
  status: string;
  note: string | null;
  actor: string;
  createdAt: string;
}

export interface NewOrderInput {
  noteDate: string;
  displayDate: string;
  customerName: string;
  customerEmail: string;
  giftFor?: string | null;
  message?: string | null;
}

interface OrderRow extends RowDataPacket {
  id: number;
  reference: string;
  note_date: string;
  display_date: string;
  customer_name: string;
  customer_email: string;
  gift_for: string | null;
  message: string | null;
  status: OrderStatus;
  price_paise: number;
  currency: string;
  note_denomination: string | null;
  note_condition: string | null;
  note_serial: string | null;
  note_country: string | null;
  admin_notes: string | null;
  stripe_session_id: string | null;
  paid_at: Date | null;
  tracking_number: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    reference: row.reference,
    noteDate: row.note_date,
    displayDate: row.display_date,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    giftFor: row.gift_for,
    message: row.message,
    status: row.status,
    pricePaise: row.price_paise,
    currency: row.currency,
    noteDenomination: row.note_denomination,
    noteCondition: row.note_condition,
    noteSerial: row.note_serial,
    noteCountry: row.note_country,
    adminNotes: row.admin_notes,
    stripeSessionId: row.stripe_session_id,
    paidAt: row.paid_at ? row.paid_at.toISOString() : null,
    trackingNumber: row.tracking_number,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const SELECT_ORDER = 'SELECT * FROM orders';

/**
 * Reference format: BN-DDMMYY-XXXX.
 *
 * The suffix comes from crypto.randomBytes rather than Math.random so a
 * reference cannot be guessed from another one — it is the only credential
 * protecting the tracking and payment pages.
 */
export function generateReference(displayDate: string): string {
  const datePart = displayDate.replace(/\D/g, '');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
  const bytes = randomBytes(6);
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += alphabet[bytes[i] % alphabet.length];
  }
  return `BN-${datePart}-${suffix}`;
}

export async function createOrder(input: NewOrderInput): Promise<Order> {
  // Retry on the (vanishingly unlikely) unique-key collision.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reference = generateReference(input.displayDate);
    try {
      return await transaction(async (conn) => {
        const [result] = await conn.execute<ResultSetHeader>(
          `INSERT INTO orders
             (reference, note_date, display_date, customer_name, customer_email,
              gift_for, message, status, price_paise, currency)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'INR')`,
          [
            reference,
            input.noteDate,
            input.displayDate,
            input.customerName,
            input.customerEmail,
            input.giftFor || null,
            input.message || null,
            env.pricePaise,
          ]
        );
        await conn.execute(
          `INSERT INTO order_events (order_id, status, note, actor)
           VALUES (?, 'pending', 'Request received.', 'system')`,
          [result.insertId]
        );
        const [rows] = await conn.execute<OrderRow[]>(
          `${SELECT_ORDER} WHERE id = ?`,
          [result.insertId]
        );
        return mapOrder(rows[0]);
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'ER_DUP_ENTRY') throw error;
    }
  }
  throw new Error('Could not allocate a unique order reference.');
}

export async function getOrderByReference(reference: string): Promise<Order | null> {
  const rows = await query<OrderRow[]>(`${SELECT_ORDER} WHERE reference = ? LIMIT 1`, [
    reference.trim().toUpperCase(),
  ]);
  return rows.length ? mapOrder(rows[0]) : null;
}

export async function getOrderByStripeSession(sessionId: string): Promise<Order | null> {
  const rows = await query<OrderRow[]>(
    `${SELECT_ORDER} WHERE stripe_session_id = ? LIMIT 1`,
    [sessionId]
  );
  return rows.length ? mapOrder(rows[0]) : null;
}

export async function getOrderEvents(orderId: number): Promise<OrderEvent[]> {
  const rows = await query<(RowDataPacket & {
    status: string;
    note: string | null;
    actor: string;
    created_at: Date;
  })[]>(
    `SELECT status, note, actor, created_at FROM order_events
     WHERE order_id = ? ORDER BY created_at ASC, id ASC`,
    [orderId]
  );
  return rows.map((row) => ({
    status: row.status,
    note: row.note,
    actor: row.actor,
    createdAt: row.created_at.toISOString(),
  }));
}

export interface OrderListFilters {
  status?: OrderStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listOrders(filters: OrderListFilters = {}) {
  const { status, search, limit = 50, offset = 0 } = filters;
  const where: string[] = [];
  const params: unknown[] = [];

  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (search) {
    where.push('(reference LIKE ? OR customer_email LIKE ? OR customer_name LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // MySQL's prepared-statement protocol rejects placeholders in LIMIT/OFFSET
  // ("Incorrect arguments to mysqld_stmt_execute"), so these two are the only
  // values interpolated into SQL anywhere in this file — and both are clamped
  // to a plain integer first, so they cannot carry anything but a number.
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 1, 1), 200);
  const safeOffset = Math.min(Math.max(Math.trunc(offset) || 0, 0), 1_000_000);

  const rows = await query<OrderRow[]>(
    `${SELECT_ORDER} ${clause} ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    params
  );

  const [countRow] = await query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total FROM orders ${clause}`,
    params
  );

  return { orders: rows.map(mapOrder), total: Number(countRow?.total ?? 0) };
}

export async function getStatusCounts(): Promise<Record<string, number>> {
  const rows = await query<(RowDataPacket & { status: string; total: number })[]>(
    'SELECT status, COUNT(*) AS total FROM orders GROUP BY status'
  );
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.total)]));
}

export interface StatusUpdate {
  status: OrderStatus;
  note?: string | null;
  actor?: string;
  noteDenomination?: string | null;
  noteCondition?: string | null;
  noteSerial?: string | null;
  noteCountry?: string | null;
  trackingNumber?: string | null;
  pricePaise?: number | null;
}

export async function updateOrderStatus(
  reference: string,
  update: StatusUpdate
): Promise<Order | null> {
  return transaction(async (conn) => {
    const [existing] = await conn.execute<OrderRow[]>(
      `${SELECT_ORDER} WHERE reference = ? LIMIT 1 FOR UPDATE`,
      [reference.trim().toUpperCase()]
    );
    if (!existing.length) return null;

    const fields: string[] = ['status = ?'];
    const params: unknown[] = [update.status];

    const optionalColumns: Array<[string, unknown]> = [
      ['note_denomination', update.noteDenomination],
      ['note_condition', update.noteCondition],
      ['note_serial', update.noteSerial],
      ['note_country', update.noteCountry],
      ['tracking_number', update.trackingNumber],
      ['admin_notes', update.note],
      ['price_paise', update.pricePaise],
    ];
    for (const [column, value] of optionalColumns) {
      if (value !== undefined && value !== null && value !== '') {
        fields.push(`${column} = ?`);
        params.push(value);
      }
    }

    params.push(existing[0].id);
    await conn.execute(`UPDATE orders SET ${fields.join(', ')} WHERE id = ?`, params as never[]);

    await conn.execute(
      `INSERT INTO order_events (order_id, status, note, actor) VALUES (?, ?, ?, ?)`,
      [existing[0].id, update.status, update.note || null, update.actor || 'admin']
    );

    const [rows] = await conn.execute<OrderRow[]>(`${SELECT_ORDER} WHERE id = ?`, [
      existing[0].id,
    ]);
    return mapOrder(rows[0]);
  });
}

export async function attachStripeSession(orderId: number, sessionId: string) {
  await query('UPDATE orders SET stripe_session_id = ? WHERE id = ?', [sessionId, orderId]);
}

/**
 * Marks an order paid. Idempotent: Stripe retries webhooks, and the UPDATE is
 * guarded on the order not already being paid so duplicate deliveries do not
 * append duplicate events or re-send the receipt.
 *
 * Returns the order only when this call is the one that flipped it to paid.
 */
export async function markOrderPaid(
  sessionId: string,
  paymentIntentId: string | null
): Promise<Order | null> {
  return transaction(async (conn) => {
    const [rows] = await conn.execute<OrderRow[]>(
      `${SELECT_ORDER} WHERE stripe_session_id = ? LIMIT 1 FOR UPDATE`,
      [sessionId]
    );
    if (!rows.length) return null;
    const order = rows[0];
    if (order.status === 'paid' || order.status === 'shipped') return null;

    await conn.execute(
      `UPDATE orders
         SET status = 'paid', stripe_payment_id = ?, paid_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [paymentIntentId, order.id]
    );
    await conn.execute(
      `INSERT INTO order_events (order_id, status, note, actor)
       VALUES (?, 'paid', 'Payment received via Stripe.', 'stripe')`,
      [order.id]
    );

    const [updated] = await conn.execute<OrderRow[]>(`${SELECT_ORDER} WHERE id = ?`, [
      order.id,
    ]);
    return mapOrder(updated[0]);
  });
}

/** True when the database is reachable — used by the health endpoint. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await getPool().query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
