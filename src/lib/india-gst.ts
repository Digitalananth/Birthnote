/**
 * Indian GST: the states, and the arithmetic.
 *
 * Client-safe on purpose — the payment page, the invoice and the admin
 * settings screen all need this, and none of them may pull the database in.
 *
 * Two rules drive everything here:
 *
 *  1. **Where the supply goes decides the split.** A sale delivered inside the
 *     seller's own state is *intra-state* and the tax is levied half as CGST
 *     (centre) and half as SGST (state). A sale crossing a state line is
 *     *inter-state* and the whole of it is IGST. The rate is the same either
 *     way, which is why the customer's total does not depend on their address
 *     — only the way it is broken up on the invoice does.
 *
 *  2. **Shipping is its own supply.** Delivery is a service, taxed at its own
 *     rate (18% by default) rather than the rate of the goods it carries, so
 *     it is computed as a separate line and never folded into the note price.
 *
 * Everything is in paise. Money is never held as a float: 5% of ₹499.90 is not
 * representable in binary, and a rupee that rounds differently in two places is
 * a tax return that does not add up.
 */

/** A state or union territory, with the two-digit code the GSTIN begins with. */
export interface IndianState {
  /** The GST state code — the first two digits of every GSTIN issued there. */
  code: string;
  name: string;
}

/**
 * The full list, in code order, as notified under the GST Acts.
 *
 * Kept as data rather than a free-text field because the state is not a label
 * here — it decides CGST/SGST versus IGST, and "Tamilnadu" typed two ways
 * would be two different tax treatments.
 */
export const INDIAN_STATES: IndianState[] = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
];

const STATES_BY_CODE = new Map(INDIAN_STATES.map((state) => [state.code, state]));

export function stateByCode(code: string | null | undefined): IndianState | null {
  return (code && STATES_BY_CODE.get(code.trim())) || null;
}

/** The state's name for display, falling back to the raw code we were given. */
export function stateName(code: string | null | undefined): string {
  return stateByCode(code)?.name ?? (code || '');
}

/**
 * A GSTIN is 15 characters: two-digit state code, ten-character PAN, an entity
 * digit, the letter Z, and a checksum character.
 *
 * Checked for shape, not against the GST portal — a typo caught here is worth
 * catching, and a network call to validate a seller's own registration number
 * would put the settings screen at the mercy of someone else's uptime.
 */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

export function isValidGstin(value: string): boolean {
  const trimmed = value.trim().toUpperCase();
  return GSTIN_PATTERN.test(trimmed) && STATES_BY_CODE.has(trimmed.slice(0, 2));
}

/** Rupees, from paise, as a plain number — for CSV and for arithmetic in tests. */
export function toRupees(paise: number): number {
  return Math.round(paise) / 100;
}

/**
 * Rounds to whole paise, half away from zero.
 *
 * `Math.round` breaks ties towards positive infinity, so it rounds -0.5 to 0
 * and 0.5 to 1 — asymmetric. Tax amounts here are never negative, but a credit
 * note is a subtraction waiting to happen and the asymmetry would be a bug the
 * day it does.
 */
function roundPaise(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Tax at `ratePercent` on a taxable value already in paise. */
export function taxOn(taxablePaise: number, ratePercent: number): number {
  return roundPaise((taxablePaise * ratePercent) / 100);
}

/** The settings that decide what an order costs, all in paise or percent. */
export interface TaxSettings {
  /** GST on the notes themselves. 5 by default. */
  goodsRatePercent: number;
  /** GST on delivery — a service, and taxed as one. 18 by default. */
  shippingRatePercent: number;
  /** The flat delivery charge, before tax. */
  shippingFlatPaise: number;
  /**
   * Orders whose notes total at least this much ship free. Zero means the
   * charge always applies — "free above ₹0" would make it free always, so the
   * disabled state has to be its own value rather than a very large number.
   */
  shippingFreeAbovePaise: number;
  /** Where the seller is registered. Decides intra- versus inter-state. */
  sellerStateCode: string;
}

/** One tax rate's worth of an order, split the way the invoice must show it. */
export interface TaxComponent {
  ratePercent: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

export interface OrderMoney {
  /** The notes, before tax. */
  itemsSubtotalPaise: number;
  /** Delivery, before tax. Zero when the order shipped free. */
  shippingPaise: number;
  /** True when the free-delivery threshold applied, so the UI can say so. */
  shippingWaived: boolean;
  /** Null until a delivery address is known — the split is not yet decidable. */
  placeOfSupplyCode: string | null;
  /**
   * Whether this is an inter-state supply. Null, like the place of supply,
   * before an address is given: `false` would be a claim we cannot make.
   */
  interState: boolean | null;
  /** The goods line and the delivery line, each at its own rate. */
  goods: TaxComponent;
  shipping: TaxComponent;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  /** What the customer pays. */
  totalPaise: number;
}

/**
 * Splits one tax amount into its components.
 *
 * On an intra-state sale the halves must add back to the whole exactly, so the
 * SGST is the remainder after the CGST rather than a second rounding of the
 * same number: at 5% on ₹100.05 both halves would otherwise round up and the
 * invoice would collect a paise that was never charged.
 */
function splitTax(taxablePaise: number, ratePercent: number, interState: boolean): TaxComponent {
  const total = taxOn(taxablePaise, ratePercent);
  if (interState) {
    return { ratePercent, taxablePaise, cgstPaise: 0, sgstPaise: 0, igstPaise: total };
  }
  const cgst = roundPaise(total / 2);
  return {
    ratePercent,
    taxablePaise,
    cgstPaise: cgst,
    sgstPaise: total - cgst,
    igstPaise: 0,
  };
}

/**
 * What an order costs, given what was found and where it is going.
 *
 * `placeOfSupplyCode` is null until the customer has given a delivery address.
 * The total is the same either way — only the split depends on the state — so
 * the payment page can show a correct amount before the address is entered and
 * the invoice can show a correct breakup after it.
 */
export function computeOrderMoney(
  itemsSubtotalPaise: number,
  settings: TaxSettings,
  placeOfSupplyCode: string | null
): OrderMoney {
  const state = stateByCode(placeOfSupplyCode);
  const interState = state ? state.code !== settings.sellerStateCode : null;
  // Before an address is known the split is undecided, but the total is not.
  // Computing the undecided case as IGST keeps one code path and cannot change
  // the amount, since both treatments levy the same rate.
  const splitAsInterState = interState ?? true;

  const shippingWaived =
    settings.shippingFreeAbovePaise > 0 && itemsSubtotalPaise >= settings.shippingFreeAbovePaise;
  // Nothing found means nothing to deliver — a delivery charge on an empty
  // order would be a charge for carrying air.
  const shippingPaise =
    itemsSubtotalPaise <= 0 || shippingWaived ? 0 : Math.max(0, settings.shippingFlatPaise);

  const goods = splitTax(itemsSubtotalPaise, settings.goodsRatePercent, splitAsInterState);
  const shipping = splitTax(shippingPaise, settings.shippingRatePercent, splitAsInterState);

  const cgstPaise = goods.cgstPaise + shipping.cgstPaise;
  const sgstPaise = goods.sgstPaise + shipping.sgstPaise;
  const igstPaise = goods.igstPaise + shipping.igstPaise;
  const taxPaise = cgstPaise + sgstPaise + igstPaise;

  return {
    itemsSubtotalPaise,
    shippingPaise,
    shippingWaived,
    placeOfSupplyCode: state?.code ?? null,
    interState,
    goods,
    shipping,
    cgstPaise,
    sgstPaise,
    igstPaise,
    taxPaise,
    totalPaise: itemsSubtotalPaise + shippingPaise + taxPaise,
  };
}

/**
 * The financial year a date falls in, as GST reckons it: 1 April to 31 March.
 *
 * Invoice numbers restart each year and must carry it, so this is what the
 * series is keyed on.
 */
export function financialYear(date: Date): string {
  const year = date.getFullYear();
  // Months are zero-based; 3 is April.
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}
