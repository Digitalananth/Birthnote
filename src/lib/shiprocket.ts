import 'server-only';
import type { RowDataPacket } from 'mysql2';
import { query } from '@/lib/db';
import { env } from '@/lib/env';
import { getSettings, type AppSettings } from '@/lib/settings';
import { stateName } from '@/lib/india-gst';
import { availableItems, type Order } from '@/lib/orders';

/**
 * Shiprocket, spoken to over plain fetch.
 *
 * No SDK: the packages on npm are unofficial, unmaintained, and wrap a REST
 * API that is simpler than the wrapper. What is not simple is the auth, and
 * that is what most of this file is about.
 */

/** A Shiprocket call that failed, carrying their own words about why. */
export class ShiprocketError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** True when Shiprocket says this order already exists on their side. */
    readonly duplicate = false
  ) {
    super(message);
    this.name = 'ShiprocketError';
  }
}

/*
 * The token.
 *
 * Shiprocket issues a bearer token for about ten days in exchange for the
 * dashboard email and password, and throttles the login endpoint hard enough
 * that logging in per request is not merely wasteful but breaks. Hostinger
 * runs several worker processes, so a module-level cache alone would still
 * mean one login per worker per restart. It goes in `app_settings`, which is
 * where configuration shared between workers already lives.
 *
 * The in-process copy in front of it is not redundant: it saves a SELECT on
 * every call, and the database row remains the thing that outlives a restart.
 */
const TOKEN_KEY = 'shiprocket_token';
const EXPIRY_KEY = 'shiprocket_token_expires_at';
/** Renewed a day early, so a call is never made with a token about to lapse. */
const RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;
/** Shiprocket says ten days; nine is the same promise with a margin. */
const ASSUMED_LIFETIME_MS = 9 * 24 * 60 * 60 * 1000;

interface CachedToken {
  token: string;
  expiresAt: number;
}
const globalForShiprocket = globalThis as unknown as {
  myLuckyDatesShiprocketToken?: CachedToken;
};

async function readStoredToken(): Promise<CachedToken | null> {
  const rows = await query<(RowDataPacket & { setting_key: string; value: string | null })[]>(
    'SELECT setting_key, value FROM app_settings WHERE setting_key IN (?, ?)',
    [TOKEN_KEY, EXPIRY_KEY]
  );
  const stored = new Map(rows.map((row) => [row.setting_key, row.value ?? '']));
  const token = stored.get(TOKEN_KEY) ?? '';
  const expiresAt = Number(stored.get(EXPIRY_KEY) ?? '');
  if (!token || !Number.isFinite(expiresAt) || !expiresAt) return null;
  return { token, expiresAt };
}

async function writeStoredToken(cached: CachedToken): Promise<void> {
  await query(
    `INSERT INTO app_settings (setting_key, value) VALUES (?, ?), (?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [TOKEN_KEY, cached.token, EXPIRY_KEY, String(cached.expiresAt)]
  );
}

async function login(): Promise<CachedToken> {
  const response = await fetch(`${env.shiprocket.apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.shiprocket.email(), password: env.shiprocket.password() }),
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => ({}))) as { token?: string; message?: string };
  if (!response.ok || !payload.token) {
    throw new ShiprocketError(
      payload.message || 'Could not sign in to Shiprocket.',
      response.status
    );
  }
  const cached: CachedToken = { token: payload.token, expiresAt: Date.now() + ASSUMED_LIFETIME_MS };
  globalForShiprocket.myLuckyDatesShiprocketToken = cached;
  await writeStoredToken(cached);
  return cached;
}

async function getToken(force = false): Promise<string> {
  if (!force) {
    const memory = globalForShiprocket.myLuckyDatesShiprocketToken;
    if (memory && memory.expiresAt - Date.now() > RENEW_BEFORE_MS) return memory.token;

    const stored = await readStoredToken();
    if (stored && stored.expiresAt - Date.now() > RENEW_BEFORE_MS) {
      globalForShiprocket.myLuckyDatesShiprocketToken = stored;
      return stored.token;
    }
  }
  return (await login()).token;
}

interface CallOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** Guards the 401 retry below. Never set by a caller. */
  retried?: boolean;
}

/**
 * One authenticated call.
 *
 * A 401 forces exactly one re-login and retry. Shiprocket can invalidate a
 * token before its nominal expiry, and without this every such call fails
 * until something else happens to refresh it. The `retried` guard is what
 * keeps that from becoming a login loop against a rate-limited endpoint,
 * which would be a worse failure than the one it was trying to fix.
 */
async function call<T>(path: string, options: CallOptions = {}): Promise<T> {
  const token = await getToken(false);
  const response = await fetch(`${env.shiprocket.apiBase}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  });

  if (response.status === 401 && !options.retried) {
    await getToken(true);
    return call<T>(path, { ...options, retried: true });
  }

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      (typeof payload.message === 'string' && payload.message) ||
      (typeof payload.error === 'string' && payload.error) ||
      `Shiprocket returned ${response.status}.`;
    // Their duplicate-order response is a 4xx with this wording, and the
    // caller has a real recovery for it — see createShipment.
    const duplicate = /already exists|duplicate/i.test(message);
    throw new ShiprocketError(message, response.status, duplicate);
  }
  return payload as T;
}

/** The parcel's physical shape, as the owner set it in /admin/settings. */
function parcel(settings: AppSettings) {
  return {
    length: Number(settings.parcel_length_cm) || 20,
    breadth: Number(settings.parcel_breadth_cm) || 15,
    height: Number(settings.parcel_height_cm) || 2,
    weight: Number(settings.parcel_weight_kg) || 0.1,
  };
}

export interface CreatedShipment {
  shiprocketOrderId: string;
  shipmentId: string;
}

/**
 * Pushes one paid order to Shiprocket.
 *
 * `order_id` is our own reference, which makes a row in their dashboard
 * findable from a customer email — and, because it must be unique across the
 * whole Shiprocket account, means a retry after a partial failure is refused
 * as a duplicate rather than quietly booking a second parcel. That refusal is
 * caught and reported as what it is, so the admin can recover the ids from
 * Shiprocket rather than being stuck at a dead end.
 *
 * The line items and `sub_total` are built from the same rows the invoice is
 * built from, so the parcel's declared value and the tax invoice cannot
 * disagree about what is in the box.
 */
export async function createShipment(order: Order): Promise<CreatedShipment> {
  const settings = await getSettings();
  const pickup = settings.shiprocket_pickup_location.trim();
  if (!pickup) {
    throw new ShiprocketError(
      'No pickup location is set. Add one in Settings → Shipping, matching a pickup address registered in Shiprocket.',
      0
    );
  }
  if (!order.shipping) {
    throw new ShiprocketError('This order has no delivery address.', 0);
  }

  const items = availableItems(order).filter((item) => (item.pricePaise ?? 0) > 0);
  if (!items.length) {
    throw new ShiprocketError('This order has no notes to ship.', 0);
  }

  const address = order.shipping;
  const response = await call<{ order_id?: number | string; shipment_id?: number | string }>(
    '/orders/create/adhoc',
    {
      method: 'POST',
      body: {
        order_id: order.reference,
        // Shiprocket wants a local date, not an ISO instant.
        order_date: (order.paidAt ?? order.createdAt).slice(0, 10),
        pickup_location: pickup,
        ...(settings.shiprocket_channel_id.trim()
          ? { channel_id: settings.shiprocket_channel_id.trim() }
          : {}),
        // There is no separate billing address: we collect one address and it
        // is both. Saying so explicitly is cheaper than sending it twice.
        billing_customer_name: address.name,
        billing_last_name: '',
        billing_address: address.line1,
        billing_address_2: address.line2 ?? '',
        billing_city: address.city,
        billing_pincode: address.pincode,
        billing_state: stateName(address.stateCode),
        billing_country: 'India',
        billing_email: order.customerEmail,
        billing_phone: address.phone ?? order.whatsapp ?? '',
        shipping_is_billing: true,
        order_items: items.map((item, index) => ({
          name: `Banknote from ${item.displayDate}`,
          sku: `${order.reference}-${index + 1}`,
          units: 1,
          selling_price: (item.pricePaise ?? 0) / 100,
          hsn: settings.hsn_goods,
        })),
        payment_method: 'Prepaid',
        // Rupees, and the same total the customer was charged.
        sub_total: order.totalPaise / 100,
        ...parcel(settings),
      },
    }
  );

  if (!response.shipment_id) {
    throw new ShiprocketError('Shiprocket created no shipment for this order.', 0);
  }
  return {
    shiprocketOrderId: String(response.order_id ?? ''),
    shipmentId: String(response.shipment_id),
  };
}

export interface AssignedAwb {
  awb: string;
  courierName: string;
}

/** Assigns the cheapest serviceable courier and returns its AWB. */
export async function assignAwb(shipmentId: string): Promise<AssignedAwb> {
  const response = await call<{
    response?: { data?: { awb_code?: string; courier_name?: string } };
  }>('/courier/assign/awb', {
    method: 'POST',
    body: { shipment_id: Number(shipmentId) },
  });
  const data = response.response?.data;
  if (!data?.awb_code) {
    throw new ShiprocketError('Shiprocket assigned no AWB. No courier may serve this route.', 0);
  }
  return { awb: String(data.awb_code), courierName: String(data.courier_name ?? '') };
}

/** Books the courier's pickup. Idempotent on Shiprocket's side. */
export async function schedulePickup(shipmentId: string): Promise<void> {
  await call('/courier/generate/pickup', {
    method: 'POST',
    body: { shipment_id: [Number(shipmentId)] },
  });
}

/** Generates the shipping label and returns the URL Shiprocket hosts it at. */
export async function generateLabel(shipmentId: string): Promise<string> {
  const response = await call<{ label_url?: string; label_created?: number }>(
    '/courier/generate/label',
    { method: 'POST', body: { shipment_id: [Number(shipmentId)] } }
  );
  if (!response.label_url) {
    throw new ShiprocketError('Shiprocket generated no label.', 0);
  }
  return response.label_url;
}

export interface Serviceability {
  serviceable: boolean;
  /** Shiprocket's estimated delivery date, in their own wording. */
  etd: string | null;
  courier: string | null;
}

/**
 * Whether anyone will carry a parcel from our pickup PIN code to this one.
 *
 * Advisory everywhere it is used: a courier API being down must not stop a
 * customer paying. Callers are expected to treat a throw as "no answer", not
 * as "not serviceable" — the two look identical from here and mean opposite
 * things to someone trying to buy something.
 */
export async function checkServiceability(
  pickupPincode: string,
  deliveryPincode: string,
  weightKg: number
): Promise<Serviceability> {
  const params = new URLSearchParams({
    pickup_postcode: pickupPincode,
    delivery_postcode: deliveryPincode,
    cod: '0',
    weight: String(weightKg),
  });
  const response = await call<{
    data?: { available_courier_companies?: { etd?: string; courier_name?: string }[] };
  }>(`/courier/serviceability/?${params.toString()}`);

  const couriers = response.data?.available_courier_companies ?? [];
  if (!couriers.length) return { serviceable: false, etd: null, courier: null };
  // The API returns them cheapest-first, which is the one we would be given.
  const best = couriers[0];
  return {
    serviceable: true,
    etd: best.etd ? String(best.etd) : null,
    courier: best.courier_name ? String(best.courier_name) : null,
  };
}
