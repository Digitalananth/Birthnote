import 'server-only';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { query, transaction } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { missingInvoiceSettings } from '@/lib/settings-types';
import { availableItems, type Order } from '@/lib/orders';
import { financialYear, stateName } from '@/lib/india-gst';
import { formatAddressLines } from '@/lib/address';
import {
  amountInWords,
  type InvoiceLine,
  type InvoiceRecord,
  type InvoiceSnapshot,
} from '@/lib/invoice-types';

/**
 * Issuing and reading tax invoices.
 *
 * An invoice is raised once, when the money arrives, and never again: the
 * database holds a unique key on `order_id`, so a redelivered Stripe webhook
 * cannot produce a second document for the same sale. That matters more than
 * it sounds — two invoices for one supply is a GST return that does not
 * reconcile.
 */

/** Thrown when the shop is not set up to issue one yet. */
export class InvoiceNotIssuableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvoiceNotIssuableError';
  }
}

interface InvoiceRow extends RowDataPacket {
  id: number;
  order_id: number;
  number: string;
  financial_year: string;
  sequence: number;
  issued_at: Date;
  place_of_supply: string;
  inter_state: number;
  total_paise: number;
  tax_paise: number;
  snapshot: string | InvoiceSnapshot;
}

function mapInvoice(row: InvoiceRow): InvoiceRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    number: row.number,
    financialYear: row.financial_year,
    sequence: Number(row.sequence),
    issuedAt: row.issued_at.toISOString(),
    placeOfSupply: row.place_of_supply,
    interState: Boolean(row.inter_state),
    totalPaise: Number(row.total_paise),
    taxPaise: Number(row.tax_paise),
    // mysql2 parses a JSON column for us on MySQL 8 but hands back a string on
    // some MariaDB builds, where JSON is an alias for LONGTEXT.
    snapshot: typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot,
  };
}

/**
 * Builds the document. Pure — it decides nothing about numbering or storage,
 * which is what makes the numbers testable without a database.
 */
function buildSnapshot(
  order: Order,
  settings: Awaited<ReturnType<typeof getSettings>>,
  number: string,
  issuedAt: Date
): InvoiceSnapshot {
  const address = order.shipping;
  if (!address) {
    throw new InvoiceNotIssuableError('This order has no delivery address.');
  }

  const interState = address.stateCode !== settings.seller_state_code;
  const notes = availableItems(order).filter((item) => (item.pricePaise ?? 0) > 0);

  const lines: InvoiceLine[] = notes.map((item) => {
    const taxable = item.pricePaise as number;
    // Recomputed from the order's own frozen rate, not from today's settings:
    // a rate change must not alter an invoice that has already been issued.
    const tax = Math.round((taxable * order.gstGoodsRate) / 100);
    const half = Math.round(tax / 2);
    return {
      description: `Banknote dated ${item.displayDate}${
        item.noteDenomination ? ` · ${item.noteDenomination}` : ''
      }${item.noteSerial ? ` · Serial ${item.noteSerial}` : ''}`,
      code: settings.hsn_goods,
      quantity: 1,
      taxablePaise: taxable,
      ratePercent: order.gstGoodsRate,
      cgstPaise: interState ? 0 : half,
      sgstPaise: interState ? 0 : tax - half,
      igstPaise: interState ? tax : 0,
      totalPaise: taxable + tax,
    };
  });

  if (order.shippingPaise > 0) {
    const tax = Math.round((order.shippingPaise * order.gstShippingRate) / 100);
    const half = Math.round(tax / 2);
    lines.push({
      description: 'Tracked delivery within India',
      code: settings.sac_shipping,
      quantity: 1,
      taxablePaise: order.shippingPaise,
      ratePercent: order.gstShippingRate,
      cgstPaise: interState ? 0 : half,
      sgstPaise: interState ? 0 : tax - half,
      igstPaise: interState ? tax : 0,
      totalPaise: order.shippingPaise + tax,
    });
  }

  const sum = (pick: (line: InvoiceLine) => number) =>
    lines.reduce((total, line) => total + pick(line), 0);

  const subtotalPaise = sum((line) => line.taxablePaise);
  const cgstPaise = sum((line) => line.cgstPaise);
  const sgstPaise = sum((line) => line.sgstPaise);
  const igstPaise = sum((line) => line.igstPaise);
  const taxPaise = cgstPaise + sgstPaise + igstPaise;
  const totalPaise = subtotalPaise + taxPaise;

  return {
    version: 1,
    number,
    issuedAt: issuedAt.toISOString(),
    orderReference: order.reference,
    currency: order.currency,
    seller: {
      name: settings.seller_trade_name || settings.seller_legal_name,
      legalName: settings.seller_legal_name,
      address: settings.seller_address
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      gstin: settings.seller_gstin || null,
      stateCode: settings.seller_state_code,
      stateName: stateName(settings.seller_state_code),
      email: settings.seller_email || null,
      phone: settings.seller_phone || null,
    },
    buyer: {
      name: address.name || order.customerName,
      address: formatAddressLines(address, stateName),
      gstin: order.buyerGstin,
      stateCode: address.stateCode,
      stateName: stateName(address.stateCode),
      email: order.customerEmail,
      phone: address.phone,
    },
    placeOfSupply: { code: address.stateCode, name: stateName(address.stateCode) },
    interState,
    lines,
    subtotalPaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    taxPaise,
    totalPaise,
    totalInWords: amountInWords(totalPaise),
    paidAt: order.paidAt,
    terms: settings.invoice_terms || null,
  };
}

/**
 * Issues the invoice for a paid order, or returns the one already issued.
 *
 * Idempotent by construction rather than by checking first: the unique key on
 * `order_id` is what actually prevents a duplicate, because a check-then-write
 * loses to a second webhook delivery arriving between the two statements.
 *
 * The number is `PREFIX/2026-27/0001` and restarts each financial year, which
 * is the series GST expects. Allocating it takes the next sequence within the
 * year and relies on the unique key to reject a collision, retrying — the same
 * approach the order reference uses, and it needs no table-wide lock.
 */
export async function issueInvoiceForOrder(order: Order): Promise<InvoiceRecord> {
  const existing = await getInvoiceForOrder(order.id);
  if (existing) return existing;

  const settings = await getSettings();
  const missing = missingInvoiceSettings(settings);
  if (missing.length) {
    throw new InvoiceNotIssuableError(
      `Invoices are not set up yet — fill in ${missing
        .map((meta) => meta.label.toLowerCase())
        .join(', ')} under Settings.`
    );
  }

  const issuedAt = new Date();
  const year = financialYear(issuedAt);
  const prefix = settings.invoice_prefix || 'INV';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await transaction(async (conn) => {
        const [rows] = await conn.query<RowDataPacket[]>(
          'SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM invoices WHERE financial_year = ?',
          [year]
        );
        // COALESCE over an unsigned column comes back as a string.
        const sequence = Number(rows[0].next);
        const number = `${prefix}/${year}/${String(sequence).padStart(4, '0')}`;
        const snapshot = buildSnapshot(order, settings, number, issuedAt);

        const [result] = await conn.execute<ResultSetHeader>(
          `INSERT INTO invoices
             (order_id, number, financial_year, sequence, issued_at,
              place_of_supply, inter_state, total_paise, tax_paise, snapshot)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            order.id,
            number,
            year,
            sequence,
            issuedAt,
            snapshot.placeOfSupply.code,
            snapshot.interState ? 1 : 0,
            snapshot.totalPaise,
            snapshot.taxPaise,
            JSON.stringify(snapshot),
          ]
        );

        return {
          id: result.insertId,
          orderId: order.id,
          number,
          financialYear: year,
          sequence,
          issuedAt: issuedAt.toISOString(),
          placeOfSupply: snapshot.placeOfSupply.code,
          interState: snapshot.interState,
          totalPaise: snapshot.totalPaise,
          taxPaise: snapshot.taxPaise,
          snapshot,
        };
      });
    } catch (error) {
      if ((error as { code?: string }).code !== 'ER_DUP_ENTRY') throw error;
      // Either another request took this sequence — try the next one — or an
      // invoice for this order was raised while we were working, in which case
      // that one is the answer and there is nothing left to do.
      const raced = await getInvoiceForOrder(order.id);
      if (raced) return raced;
    }
  }

  throw new Error('Could not allocate an invoice number.');
}

export async function getInvoiceForOrder(orderId: number): Promise<InvoiceRecord | null> {
  const rows = await query<InvoiceRow[]>('SELECT * FROM invoices WHERE order_id = ? LIMIT 1', [
    orderId,
  ]);
  return rows.length ? mapInvoice(rows[0]) : null;
}

export async function getInvoiceByNumber(number: string): Promise<InvoiceRecord | null> {
  const rows = await query<InvoiceRow[]>('SELECT * FROM invoices WHERE number = ? LIMIT 1', [
    number,
  ]);
  return rows.length ? mapInvoice(rows[0]) : null;
}

export interface InvoiceListRow extends InvoiceRecord {
  orderReference: string;
  customerName: string;
}

/**
 * Issued invoices, newest first — the admin list and the CSV both read this.
 *
 * `from`/`to` are dates, inclusive, because a GST return is filed for a period
 * and "everything, then filter it yourself" is not a useful export.
 */
export async function listInvoices(
  filters: { from?: string; to?: string; limit?: number } = {}
): Promise<InvoiceListRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.from) {
    where.push('i.issued_at >= ?');
    params.push(`${filters.from} 00:00:00`);
  }
  if (filters.to) {
    where.push('i.issued_at <= ?');
    params.push(`${filters.to} 23:59:59`);
  }

  const rows = await query<(InvoiceRow & { reference: string; customer_name: string })[]>(
    `SELECT i.*, o.reference, o.customer_name
       FROM invoices i JOIN orders o ON o.id = i.order_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY i.issued_at DESC, i.id DESC
      LIMIT ${Math.min(Math.max(filters.limit ?? 500, 1), 2000)}`,
    params
  );

  return rows.map((row) => ({
    ...mapInvoice(row),
    orderReference: row.reference,
    customerName: row.customer_name,
  }));
}
