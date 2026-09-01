import { INDIAN_STATES, isValidGstin } from '@/lib/india-gst';

/**
 * The shape of the settings, and what counts as a valid value for each.
 *
 * Client-safe: the admin form validates against exactly the rules the API
 * enforces, so a bad value is refused with the same words in both places
 * rather than being accepted by one and rejected by the other.
 */
export const SETTING_KEYS = [
  'gst_goods_rate',
  'gst_shipping_rate',
  'shipping_flat_paise',
  'shipping_free_above_paise',
  'seller_legal_name',
  'seller_trade_name',
  'seller_gstin',
  'seller_state_code',
  'seller_address',
  'seller_email',
  'seller_phone',
  'hsn_goods',
  'sac_shipping',
  'invoice_prefix',
  'invoice_terms',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export type AppSettings = Record<SettingKey, string>;

/** How a setting is entered, and how it is checked. */
export type SettingKind = 'rate' | 'money' | 'text' | 'state' | 'gstin' | 'multiline';

export interface SettingMeta {
  key: SettingKey;
  label: string;
  kind: SettingKind;
  /** Shown under the field — why this exists, not what it is called. */
  hint?: string;
  /** An invoice cannot be issued while a required setting is blank. */
  requiredForInvoice?: boolean;
}

export interface SettingGroup {
  title: string;
  description: string;
  settings: SettingMeta[];
}

export const SETTING_GROUPS: SettingGroup[] = [
  {
    title: 'Tax',
    description:
      'GST is charged on top of the price you enter for a note. Changing a rate affects orders priced from now on — orders already placed keep the rate they were charged at.',
    settings: [
      {
        key: 'gst_goods_rate',
        label: 'GST on notes (%)',
        kind: 'rate',
        hint: 'Split as CGST + SGST within your own state, or charged as IGST outside it.',
      },
      {
        key: 'gst_shipping_rate',
        label: 'GST on delivery (%)',
        kind: 'rate',
        hint: 'Delivery is a service and is taxed at its own rate, not the rate of the notes.',
      },
      {
        key: 'hsn_goods',
        label: 'HSN code for notes',
        kind: 'text',
        hint: 'Printed against every note line on the invoice.',
      },
      {
        key: 'sac_shipping',
        label: 'SAC code for delivery',
        kind: 'text',
        hint: 'Printed against the delivery line.',
      },
    ],
  },
  {
    title: 'Delivery charges',
    description: 'Charged once per order, however many notes are in it.',
    settings: [
      { key: 'shipping_flat_paise', label: 'Delivery charge (₹)', kind: 'money' },
      {
        key: 'shipping_free_above_paise',
        label: 'Free delivery above (₹)',
        kind: 'money',
        hint: 'Orders whose notes total at least this much ship free. Set 0 to always charge.',
      },
    ],
  },
  {
    title: 'Your business, as it appears on the invoice',
    description:
      'These are printed on every tax invoice. An invoice will not be issued while the GSTIN, legal name or state is blank — an invoice without them is not a valid one.',
    settings: [
      { key: 'seller_legal_name', label: 'Legal name', kind: 'text', requiredForInvoice: true },
      {
        key: 'seller_trade_name',
        label: 'Trade name',
        kind: 'text',
        hint: 'The name customers know you by, if it differs from the legal name.',
      },
      { key: 'seller_gstin', label: 'GSTIN', kind: 'gstin', requiredForInvoice: true },
      {
        key: 'seller_state_code',
        label: 'State of registration',
        kind: 'state',
        requiredForInvoice: true,
        hint: 'Decides whether an order is taxed as CGST + SGST or as IGST.',
      },
      { key: 'seller_address', label: 'Address', kind: 'multiline', requiredForInvoice: true },
      { key: 'seller_email', label: 'Email on invoice', kind: 'text' },
      { key: 'seller_phone', label: 'Phone on invoice', kind: 'text' },
      {
        key: 'invoice_prefix',
        label: 'Invoice number prefix',
        kind: 'text',
        hint: 'Numbers run as PREFIX/2026-27/0001 and restart each financial year.',
      },
      {
        key: 'invoice_terms',
        label: 'Terms printed at the foot',
        kind: 'multiline',
      },
    ],
  },
];

export const SETTING_META: Record<SettingKey, SettingMeta> = Object.fromEntries(
  SETTING_GROUPS.flatMap((group) => group.settings).map((meta) => [meta.key, meta])
) as Record<SettingKey, SettingMeta>;

/**
 * Checks one setting and returns the value to store.
 *
 * Money arrives from the form in rupees and is stored in paise — the admin
 * never types a minor unit, and the database never holds a major one, so the
 * conversion happens here, once, rather than at each call site.
 */
export function validateSetting(key: SettingKey, raw: string): { value?: string; error?: string } {
  const meta = SETTING_META[key];
  const trimmed = raw.trim();

  switch (meta.kind) {
    case 'rate': {
      const rate = Number(trimmed);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return { error: 'Enter a percentage between 0 and 100.' };
      }
      // Two decimals: GST rates go to 0.25% at the finest (2.5% halves).
      return { value: (Math.round(rate * 100) / 100).toString() };
    }
    case 'money': {
      const rupees = Number(trimmed);
      if (!Number.isFinite(rupees) || rupees < 0) return { error: 'Enter an amount in rupees.' };
      if (rupees > 1_000_000) return { error: 'That is larger than any delivery charge.' };
      return { value: String(Math.round(rupees * 100)) };
    }
    case 'gstin': {
      if (!trimmed) return { value: '' };
      if (!isValidGstin(trimmed)) {
        return { error: 'That is not a valid GSTIN — 15 characters, e.g. 33ABCDE1234F1Z5.' };
      }
      return { value: trimmed.toUpperCase() };
    }
    case 'state': {
      if (!trimmed) return { value: '' };
      if (!INDIAN_STATES.some((state) => state.code === trimmed)) {
        return { error: 'Choose a state from the list.' };
      }
      return { value: trimmed };
    }
    case 'multiline':
      if (trimmed.length > 600) return { error: 'Keep this under 600 characters.' };
      return { value: trimmed };
    case 'text':
    default:
      if (trimmed.length > 200) return { error: 'Keep this under 200 characters.' };
      return { value: trimmed };
  }
}

/** What the form shows for a stored value — paise back into rupees. */
export function settingForDisplay(key: SettingKey, stored: string): string {
  return SETTING_META[key].kind === 'money' ? String((Number(stored) || 0) / 100) : stored;
}

/**
 * The settings an invoice cannot be issued without.
 *
 * Returned as a list rather than a boolean so the admin is told which field is
 * missing, on the settings page and in the error when issuing fails.
 */
export function missingInvoiceSettings(settings: AppSettings): SettingMeta[] {
  return SETTING_GROUPS.flatMap((group) => group.settings).filter(
    (meta) => meta.requiredForInvoice && !settings[meta.key]?.trim()
  );
}
