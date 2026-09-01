import 'server-only';
import { randomBytes } from 'node:crypto';
import type { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';
import { getPool, query, transaction } from '@/lib/db';
import { computeOrderMoney, type TaxSettings } from '@/lib/india-gst';
import {
  ORDER_STATUSES,
  availableItems,
  summariseOrder,
  type Order,
  type OrderEvent,
  type OrderItem,
  type OrderStatus,
  type ItemAvailability,
  type NewOrderInput,
  type ShippingAddress,
  HOLD_SOON_DAYS,
} from '@/lib/order-types';

export { ORDER_STATUSES, availableItems, summariseOrder };
export type {
  Order,
  OrderEvent,
  OrderItem,
  OrderStatus,
  ItemAvailability,
  NewOrderInput,
  NewOrderItemInput,
  ShippingAddress,
} from '@/lib/order-types';

interface OrderRow extends RowDataPacket {
  id: number;
  reference: string;
  user_id: number | null;
  customer_name: string;
  customer_email: string;
  whatsapp: string | null;
  whatsapp_opt_in: number;
  message: string | null;
  status: OrderStatus;
  price_paise: number;
  shipping_paise: number;
  tax_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  total_paise: number;
  gst_goods_rate: string | number;
  gst_shipping_rate: string | number;
  ship_name: string | null;
  ship_line1: string | null;
  ship_line2: string | null;
  ship_city: string | null;
  ship_state_code: string | null;
  ship_pincode: string | null;
  ship_phone: string | null;
  buyer_gstin: string | null;
  currency: string;
  admin_notes: string | null;
  stripe_session_id: string | null;
  paid_at: Date | null;
  held_until: Date | null;
  hold_reminder_count: number;
  hold_lapsed_at: Date | null;
  tracking_number: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ItemRow extends RowDataPacket {
  id: number;
  order_id: number;
  position: number;
  note_date: string;
  display_date: string;
  requested_denomination: number | null;
  gift_relationship: string | null;
  gift_for: string | null;
  availability: ItemAvailability;
  price_paise: number | null;
  note_denomination: string | null;
  note_condition: string | null;
  note_serial: string | null;
  note_country: string | null;
}

function mapItem(row: ItemRow): OrderItem {
  return {
    id: row.id,
    position: row.position,
    noteDate: row.note_date,
    displayDate: row.display_date,
    requestedDenomination: row.requested_denomination,
    giftRelationship: row.gift_relationship,
    giftFor: row.gift_for,
    availability: row.availability,
    pricePaise: row.price_paise,
    noteDenomination: row.note_denomination,
    noteCondition: row.note_condition,
    noteSerial: row.note_serial,
    noteCountry: row.note_country,
  };
}

function mapOrder(row: OrderRow, items: OrderItem[]): Order {
  return {
    id: row.id,
    reference: row.reference,
    userId: row.user_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    whatsapp: row.whatsapp,
    whatsappOptIn: Boolean(row.whatsapp_opt_in),
    message: row.message,
    status: row.status,
    pricePaise: row.price_paise,
    shippingPaise: Number(row.shipping_paise ?? 0),
    taxPaise: Number(row.tax_paise ?? 0),
    cgstPaise: Number(row.cgst_paise ?? 0),
    sgstPaise: Number(row.sgst_paise ?? 0),
    igstPaise: Number(row.igst_paise ?? 0),
    // Orders placed before tax existed carry the notes total here, backfilled
    // by 0013 — never zero, which would claim they were free.
    totalPaise: Number(row.total_paise ?? 0) || row.price_paise,
    // MariaDB hands DECIMAL back as a string.
    gstGoodsRate: Number(row.gst_goods_rate ?? 0),
    gstShippingRate: Number(row.gst_shipping_rate ?? 0),
    shipping: row.ship_line1
      ? {
          name: row.ship_name ?? '',
          line1: row.ship_line1,
          line2: row.ship_line2,
          city: row.ship_city ?? '',
          stateCode: row.ship_state_code ?? '',
          pincode: row.ship_pincode ?? '',
          phone: row.ship_phone,
        }
      : null,
    buyerGstin: row.buyer_gstin,
    currency: row.currency,
    adminNotes: row.admin_notes,
    stripeSessionId: row.stripe_session_id,
    paidAt: row.paid_at ? row.paid_at.toISOString() : null,
    heldUntil: row.held_until ? row.held_until.toISOString() : null,
    holdReminderCount: Number(row.hold_reminder_count ?? 0),
    holdLapsedAt: row.hold_lapsed_at ? row.hold_lapsed_at.toISOString() : null,
    trackingNumber: row.tracking_number,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    items,
  };
}

const SELECT_ORDER = 'SELECT * FROM orders';

/**
 * Loads the items for a set of orders in one query.
 *
 * The admin queue lists 25 orders at a time; fetching each one's items
 * separately would be 25 round trips for a page that used to take one.
 */
async function loadItems(orderIds: number[]): Promise<Map<number, OrderItem[]>> {
  const grouped = new Map<number, OrderItem[]>();
  if (!orderIds.length) return grouped;

  // The ids come from rows this process just read, so they are numbers; the
  // placeholder list is built from their count, never from their values.
  const placeholders = orderIds.map(() => '?').join(',');
  const rows = await query<ItemRow[]>(
    `SELECT * FROM order_items WHERE order_id IN (${placeholders})
      ORDER BY order_id, position, id`,
    orderIds
  );
  for (const row of rows) {
    const list = grouped.get(row.order_id) ?? [];
    list.push(mapItem(row));
    grouped.set(row.order_id, list);
  }
  return grouped;
}

async function withItems(rows: OrderRow[]): Promise<Order[]> {
  const items = await loadItems(rows.map((row) => row.id));
  return rows.map((row) => mapOrder(row, items.get(row.id) ?? []));
}

/**
 * Reference format: BN-DDMMYY-XXXX.
 *
 * The date part comes from the first requested note, so a reference still
 * reads like the order it belongs to. The suffix comes from crypto.randomBytes
 * rather than Math.random so one reference cannot be guessed from another — it
 * is the only credential protecting the tracking and payment pages.
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

/**
 * The order's money, recomputed from its items and the current settings.
 *
 * Denormalised onto `orders` because Stripe, the receipt email, the payment
 * page and the invoice all want the same numbers, and recomputing them on
 * every read would mean none of them could trust the amount the customer was
 * actually charged. The rates are stored alongside, so an invoice reprinted
 * after a rate change still shows the rate that was applied.
 *
 * Runs whenever an item's price or availability changes — that is, while the
 * admin is still checking. Once an order is paid the numbers are what was
 * charged and must not move, which `updateOrderItem` enforces by refusing to
 * edit a paid order at all.
 */
async function recomputeTotal(conn: PoolConnection, orderId: number): Promise<void> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT o.ship_state_code,
            COALESCE((SELECT SUM(i.price_paise) FROM order_items i
                       WHERE i.order_id = o.id AND i.availability = 'available'), 0) AS subtotal
       FROM orders o WHERE o.id = ?`,
    [orderId]
  );
  if (!rows.length) return;

  // SUM() of an unsigned column comes back as a string.
  const subtotal = Number(rows[0].subtotal) || 0;
  const stateCode = (rows[0].ship_state_code as string | null) ?? null;

  const settings = await readTaxSettings(conn);
  const money = computeOrderMoney(subtotal, settings, stateCode);

  await conn.execute(
    `UPDATE orders
        SET price_paise = ?, shipping_paise = ?, tax_paise = ?,
            cgst_paise = ?, sgst_paise = ?, igst_paise = ?, total_paise = ?,
            gst_goods_rate = ?, gst_shipping_rate = ?
      WHERE id = ?`,
    [
      money.itemsSubtotalPaise,
      money.shippingPaise,
      money.taxPaise,
      money.cgstPaise,
      money.sgstPaise,
      money.igstPaise,
      money.totalPaise,
      settings.goodsRatePercent,
      settings.shippingRatePercent,
      orderId,
    ]
  );
}

/**
 * The tax settings, read on the transaction's own connection.
 *
 * `getSettings` uses the pool, and a pool checkout from inside a transaction
 * is a different connection — harmless here, but reading the settings a
 * recompute depends on outside its transaction is the kind of thing that is
 * only harmless until it is not.
 */
async function readTaxSettings(conn: PoolConnection): Promise<TaxSettings> {
  const [rows] = await conn.query<RowDataPacket[]>('SELECT setting_key, value FROM app_settings');
  const stored = new Map(
    rows.map((row) => [row.setting_key as string, (row.value as string) ?? ''])
  );
  return {
    goodsRatePercent: Number(stored.get('gst_goods_rate')) || 0,
    shippingRatePercent: Number(stored.get('gst_shipping_rate')) || 0,
    shippingFlatPaise: Number(stored.get('shipping_flat_paise')) || 0,
    shippingFreeAbovePaise: Number(stored.get('shipping_free_above_paise')) || 0,
    sellerStateCode: stored.get('seller_state_code') ?? '',
  };
}

export async function createOrder(input: NewOrderInput): Promise<Order> {
  if (!input.items.length) {
    throw new Error('An order needs at least one note.');
  }

  // Retry on the (vanishingly unlikely) unique-key collision.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reference = generateReference(input.items[0].displayDate);
    try {
      return await transaction(async (conn) => {
        const [result] = await conn.execute<ResultSetHeader>(
          `INSERT INTO orders
             (reference, user_id, customer_name, customer_email, whatsapp,
              whatsapp_opt_in, message, status, price_paise, currency)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, 'INR')`,
          [
            reference,
            input.userId || null,
            input.customerName,
            input.customerEmail,
            input.whatsapp || null,
            input.whatsappOptIn ? 1 : 0,
            input.message || null,
          ]
        );
        const orderId = result.insertId;

        for (const [index, item] of input.items.entries()) {
          await conn.execute(
            `INSERT INTO order_items
               (order_id, position, note_date, display_date, requested_denomination,
                gift_relationship, gift_for)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              orderId,
              index + 1,
              item.noteDate,
              item.displayDate,
              item.requestedDenomination || null,
              item.giftRelationship || null,
              item.giftFor || null,
            ]
          );
        }

        const note =
          input.items.length === 1
            ? 'Request received.'
            : `Request received — ${input.items.length} notes.`;
        await conn.execute(
          `INSERT INTO order_events (order_id, status, note, actor)
           VALUES (?, 'pending', ?, 'system')`,
          [orderId, note]
        );

        const [rows] = await conn.execute<OrderRow[]>(`${SELECT_ORDER} WHERE id = ?`, [orderId]);
        const [items] = await conn.execute<ItemRow[]>(
          'SELECT * FROM order_items WHERE order_id = ? ORDER BY position, id',
          [orderId]
        );
        return mapOrder(rows[0], items.map(mapItem));
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
  return rows.length ? (await withItems(rows))[0] : null;
}

/** Every order belonging to an account, newest first — the My Orders list. */
export async function listOrdersForUser(userId: number): Promise<Order[]> {
  const rows = await query<OrderRow[]>(
    `${SELECT_ORDER} WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );
  return withItems(rows);
}

/**
 * One order, scoped to its owner.
 *
 * The ownership check lives in the SQL rather than in the caller so there is
 * no path where a signed-in customer can read another customer's order by
 * pasting a reference into /account/orders.
 */
export async function getUserOrderByReference(
  userId: number,
  reference: string
): Promise<Order | null> {
  const rows = await query<OrderRow[]>(
    `${SELECT_ORDER} WHERE user_id = ? AND reference = ? LIMIT 1`,
    [userId, reference.trim().toUpperCase()]
  );
  return rows.length ? (await withItems(rows))[0] : null;
}

export async function getOrderByStripeSession(sessionId: string): Promise<Order | null> {
  const rows = await query<OrderRow[]>(`${SELECT_ORDER} WHERE stripe_session_id = ? LIMIT 1`, [
    sessionId,
  ]);
  return rows.length ? (await withItems(rows))[0] : null;
}

export async function getOrderEvents(orderId: number): Promise<OrderEvent[]> {
  const rows = await query<
    (RowDataPacket & {
      status: string;
      note: string | null;
      actor: string;
      created_at: Date;
    })[]
  >(
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

/** Which holds to show. Both are confirmed, unpaid orders. */
export type HoldFilter = 'soon' | 'lapsed';

export interface OrderListFilters {
  status?: OrderStatus;
  search?: string;
  /** Narrows to orders whose hold needs an admin's attention. */
  hold?: HoldFilter;
  limit?: number;
  offset?: number;
}

export async function listOrders(filters: OrderListFilters = {}) {
  const { status, search, hold, limit = 50, offset = 0 } = filters;
  const where: string[] = [];
  const params: unknown[] = [];

  if (status) {
    where.push('o.status = ?');
    params.push(status);
  }
  if (hold === 'soon') {
    // Running out, but not yet over — the ones still worth a nudge.
    where.push(
      `o.status = 'confirmed' AND o.held_until IS NOT NULL AND o.hold_lapsed_at IS NULL
       AND o.held_until > UTC_TIMESTAMP()
       AND o.held_until <= UTC_TIMESTAMP() + INTERVAL ? DAY`
    );
    params.push(HOLD_SOON_DAYS);
  } else if (hold === 'lapsed') {
    // Over, either because the deadline passed or an admin ended it.
    where.push(
      `o.status = 'confirmed' AND o.held_until IS NOT NULL
       AND (o.hold_lapsed_at IS NOT NULL OR o.held_until <= UTC_TIMESTAMP())`
    );
  }
  if (search) {
    // Searching a date has to reach into the items now that dates live there.
    where.push(
      `(o.reference LIKE ? OR o.customer_email LIKE ? OR o.customer_name LIKE ?
        OR EXISTS (SELECT 1 FROM order_items i
                    WHERE i.order_id = o.id AND i.display_date LIKE ?))`
    );
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // MySQL's prepared-statement protocol rejects placeholders in LIMIT/OFFSET
  // ("Incorrect arguments to mysqld_stmt_execute"), so these two are the only
  // values interpolated into SQL anywhere in this file — and both are clamped
  // to a plain integer first, so they cannot carry anything but a number.
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 1, 1), 200);
  const safeOffset = Math.min(Math.max(Math.trunc(offset) || 0, 0), 1_000_000);

  const rows = await query<OrderRow[]>(
    `SELECT o.* FROM orders o ${clause}
      ORDER BY o.created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    params
  );

  const [countRow] = await query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total FROM orders o ${clause}`,
    params
  );

  return { orders: await withItems(rows), total: Number(countRow?.total ?? 0) };
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
  trackingNumber?: string | null;
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
    const orderId = existing[0].id;

    const fields: string[] = ['status = ?'];
    const params: unknown[] = [update.status];

    const optionalColumns: Array<[string, unknown]> = [
      ['tracking_number', update.trackingNumber],
      ['admin_notes', update.note],
    ];
    for (const [column, value] of optionalColumns) {
      if (value !== undefined && value !== null && value !== '') {
        fields.push(`${column} = ?`);
        params.push(value);
      }
    }

    params.push(orderId);
    await conn.execute(`UPDATE orders SET ${fields.join(', ')} WHERE id = ?`, params as never[]);

    await conn.execute(
      `INSERT INTO order_events (order_id, status, note, actor) VALUES (?, ?, ?, ?)`,
      [orderId, update.status, update.note || null, update.actor || 'admin']
    );

    return readOrder(conn, orderId);
  });
}

export interface ItemUpdate {
  availability?: ItemAvailability;
  pricePaise?: number | null;
  noteDenomination?: string | null;
  noteCondition?: string | null;
  noteSerial?: string | null;
  noteCountry?: string | null;
}

/**
 * Updates one note within an order and recomputes the order total.
 *
 * Refuses once the order is paid: the customer has been charged a specific
 * amount for a specific set of notes, and quietly changing either afterwards
 * would leave the receipt and the record disagreeing.
 */
export async function updateOrderItem(
  reference: string,
  itemId: number,
  update: ItemUpdate
): Promise<Order | null> {
  return transaction(async (conn) => {
    const [existing] = await conn.execute<OrderRow[]>(
      `${SELECT_ORDER} WHERE reference = ? LIMIT 1 FOR UPDATE`,
      [reference.trim().toUpperCase()]
    );
    if (!existing.length) return null;
    const order = existing[0];
    if (order.status === 'paid' || order.status === 'shipped') {
      throw new PaidOrderError();
    }

    const [items] = await conn.execute<ItemRow[]>(
      'SELECT id FROM order_items WHERE id = ? AND order_id = ? LIMIT 1',
      [itemId, order.id]
    );
    if (!items.length) return null;

    const fields: string[] = [];
    const params: unknown[] = [];
    const columns: Array<[string, unknown]> = [
      ['availability', update.availability],
      ['note_denomination', update.noteDenomination],
      ['note_condition', update.noteCondition],
      ['note_serial', update.noteSerial],
      ['note_country', update.noteCountry],
    ];
    for (const [column, value] of columns) {
      if (value === undefined) continue;
      fields.push(`${column} = ?`);
      params.push(value === '' ? null : value);
    }
    // Price is handled separately: 0 and null both mean "no price", and the
    // loop above would treat an explicit null as a value worth writing.
    //
    // A note we do not have cannot have a price, whatever was typed in the
    // box beside it — the admin fills the details in *before* deciding, so a
    // price left over from a note that turned out to be missing would sit in
    // the row looking like a charge, and `recomputeTotal` only ignores it
    // because of a join it would be easy to change later.
    if (update.availability === 'unavailable') {
      fields.push('price_paise = ?');
      params.push(null);
    } else if (update.pricePaise !== undefined) {
      fields.push('price_paise = ?');
      params.push(
        update.pricePaise && update.pricePaise > 0 ? Math.round(update.pricePaise) : null
      );
    }

    if (fields.length) {
      params.push(itemId);
      await conn.execute(
        `UPDATE order_items SET ${fields.join(', ')} WHERE id = ?`,
        params as never[]
      );
    }

    await recomputeTotal(conn, order.id);
    return readOrder(conn, order.id);
  });
}

/** Thrown when an admin tries to change the notes on an order already paid for. */
export class PaidOrderError extends Error {
  constructor() {
    super('This order has been paid for — its notes can no longer be changed.');
    this.name = 'PaidOrderError';
  }
}

async function readOrder(conn: PoolConnection, orderId: number): Promise<Order> {
  const [rows] = await conn.execute<OrderRow[]>(`${SELECT_ORDER} WHERE id = ?`, [orderId]);
  const [items] = await conn.execute<ItemRow[]>(
    'SELECT * FROM order_items WHERE order_id = ? ORDER BY position, id',
    [orderId]
  );
  return mapOrder(rows[0], items.map(mapItem));
}

/**
 * Saves where the order is going, and re-prices it for that destination.
 *
 * The address is taken on our own page rather than at Stripe because the state
 * decides whether the tax is CGST + SGST or IGST, and that has to be settled
 * before the customer is charged, not after. The total does not move — the
 * rate is the same either way — but the breakup does, and the invoice is only
 * issuable once it is known.
 *
 * Only a confirmed, unpaid order accepts one: after payment the address is
 * part of what was invoiced and changing it would rewrite a tax document.
 */
export async function saveShippingAddress(
  reference: string,
  address: ShippingAddress & { buyerGstin?: string | null }
): Promise<Order | null> {
  return transaction(async (conn) => {
    const [rows] = await conn.query<OrderRow[]>(
      'SELECT * FROM orders WHERE reference = ? FOR UPDATE',
      [reference]
    );
    const row = rows[0];
    if (!row || row.status !== 'confirmed') return null;

    await conn.execute(
      `UPDATE orders
          SET ship_name = ?, ship_line1 = ?, ship_line2 = ?, ship_city = ?,
              ship_state_code = ?, ship_pincode = ?, ship_phone = ?, buyer_gstin = ?
        WHERE id = ?`,
      [
        address.name,
        address.line1,
        address.line2 || null,
        address.city,
        address.stateCode,
        address.pincode,
        address.phone || null,
        address.buyerGstin || null,
        row.id,
      ]
    );

    // The destination is part of the price now, so the money is stale until
    // this runs — the tax split was computed with no state to go on.
    await recomputeTotal(conn, row.id);
    return readOrder(conn, row.id);
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

    return readOrder(conn, order.id);
  });
}

/**
 * Records a refund against the order that payment intent belongs to.
 *
 * Returns the order only on the delivery that actually changed it, so a
 * repeated `charge.refunded` cannot email the customer twice. A partial
 * refund is still a refund as far as the customer's status is concerned;
 * the amount returned is Stripe's record, not ours to restate.
 */
export async function markOrderRefunded(paymentIntentId: string): Promise<Order | null> {
  return transaction(async (conn) => {
    const [rows] = await conn.execute<OrderRow[]>(
      `${SELECT_ORDER} WHERE stripe_payment_id = ? LIMIT 1 FOR UPDATE`,
      [paymentIntentId]
    );
    if (!rows.length) return null;
    const order = rows[0];
    if (order.status === 'refunded') return null;

    await conn.execute(`UPDATE orders SET status = 'refunded' WHERE id = ?`, [order.id]);
    await conn.execute(
      `INSERT INTO order_events (order_id, status, note, actor)
       VALUES (?, 'refunded', 'Refund issued via Stripe.', 'stripe')`,
      [order.id]
    );

    return readOrder(conn, order.id);
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
