import 'server-only';
import type { RowDataPacket } from 'mysql2';
import { query } from '@/lib/db';
import { SETTING_KEYS, type AppSettings, type SettingKey } from '@/lib/settings-types';
import type { TaxSettings } from '@/lib/india-gst';

export type { AppSettings, SettingKey } from '@/lib/settings-types';

/**
 * The owner's settings: tax rates, delivery charges, and who the invoice is
 * from.
 *
 * Read fresh on every call rather than cached in module state. These are read
 * once per priced order and once per invoice — a handful of times a day — and
 * a cache here would mean a rate the owner just changed quietly not applying
 * until the next deploy, on whichever server instance happened to hold the
 * stale copy.
 */

/**
 * Falls back to the same defaults the migration seeds, so a settings row that
 * was deleted by hand degrades to sensible behaviour instead of a crash. The
 * seller's own details have no sensible default and stay blank — an invoice
 * refuses to issue rather than inventing a GSTIN.
 */
const FALLBACKS: AppSettings = {
  gst_goods_rate: '5',
  gst_shipping_rate: '18',
  shipping_flat_paise: '0',
  shipping_free_above_paise: '0',
  seller_legal_name: '',
  seller_trade_name: 'My Lucky Dates',
  seller_gstin: '',
  seller_state_code: '',
  seller_address: '',
  seller_email: '',
  seller_phone: '',
  hsn_goods: '9705',
  sac_shipping: '996812',
  invoice_prefix: 'MLD',
  invoice_terms: '',
};

interface SettingRow extends RowDataPacket {
  setting_key: string;
  value: string | null;
}

export async function getSettings(): Promise<AppSettings> {
  const rows = await query<SettingRow[]>('SELECT setting_key, value FROM app_settings');
  const stored = new Map(rows.map((row) => [row.setting_key, row.value ?? '']));
  return Object.fromEntries(
    SETTING_KEYS.map((key) => [key, stored.get(key) ?? FALLBACKS[key]])
  ) as AppSettings;
}

/** Writes one setting. The value is expected to have been validated already. */
export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await query(
    `INSERT INTO app_settings (setting_key, value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [key, value]
  );
}

/**
 * The settings as the tax engine wants them: numbers, not strings.
 *
 * The engine is client-safe and knows nothing about the database; this is the
 * one place the two meet.
 */
export function toTaxSettings(settings: AppSettings): TaxSettings {
  return {
    goodsRatePercent: Number(settings.gst_goods_rate) || 0,
    shippingRatePercent: Number(settings.gst_shipping_rate) || 0,
    shippingFlatPaise: Number(settings.shipping_flat_paise) || 0,
    shippingFreeAbovePaise: Number(settings.shipping_free_above_paise) || 0,
    sellerStateCode: settings.seller_state_code,
  };
}

export async function getTaxSettings(): Promise<TaxSettings> {
  return toTaxSettings(await getSettings());
}
