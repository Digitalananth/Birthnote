/**
 * A tax invoice, as it was issued.
 *
 * This is a snapshot, not a view. An invoice is a legal record of a moment:
 * the seller's registered address, the rate in force, the buyer's address and
 * the price all belong to the day it was raised. Rendering one from live
 * settings would mean that correcting a typo in the shop's address silently
 * amends every invoice ever issued — so the whole document is frozen into JSON
 * when it is created, and the page merely prints what is stored.
 *
 * Client-safe: the invoice page and the admin list both render this shape.
 */

/** One taxable line: the notes, or the delivery. */
export interface InvoiceLine {
  description: string;
  /** HSN for goods, SAC for the delivery service. */
  code: string;
  quantity: number;
  /** Before tax. */
  taxablePaise: number;
  ratePercent: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

export interface InvoiceParty {
  name: string;
  /** The legal name, when it differs from the trade name shown at the top. */
  legalName?: string;
  address: string[];
  gstin: string | null;
  stateCode: string;
  stateName: string;
  email?: string | null;
  phone?: string | null;
}

export interface InvoiceSnapshot {
  /** The version of this shape, so an old row can still be rendered later. */
  version: 1;
  number: string;
  issuedAt: string;
  orderReference: string;
  currency: string;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  /** Where the supply is deemed to be made — the delivery state. */
  placeOfSupply: { code: string; name: string };
  /**
   * True when the buyer's state differs from the seller's, and the tax is
   * therefore IGST rather than CGST + SGST.
   */
  interState: boolean;
  lines: InvoiceLine[];
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  totalPaise: number;
  /** The total in words, as an Indian tax invoice is expected to carry. */
  totalInWords: string;
  paidAt: string | null;
  terms: string | null;
}

export interface InvoiceRecord {
  id: number;
  orderId: number;
  number: string;
  financialYear: string;
  sequence: number;
  issuedAt: string;
  placeOfSupply: string;
  interState: boolean;
  totalPaise: number;
  taxPaise: number;
  snapshot: InvoiceSnapshot;
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(value: number): string {
  if (value < 20) return ONES[value];
  const tens = TENS[Math.floor(value / 10)];
  const ones = ONES[value % 10];
  return ones ? `${tens} ${ones}` : tens;
}

/**
 * A number in the Indian system — lakh and crore, not million.
 *
 * An invoice carries its amount in words so that a figure altered by hand is
 * contradicted by the line beneath it. It has to group the way the reader
 * expects: ₹1,25,000 is "One Lakh Twenty Five Thousand", never "One Hundred
 * Twenty Five Thousand".
 */
export function numberToWords(value: number): string {
  if (value === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(value / 10_000_000);
  const lakh = Math.floor((value % 10_000_000) / 100_000);
  const thousand = Math.floor((value % 100_000) / 1000);
  const hundred = Math.floor((value % 1000) / 100);
  const rest = value % 100;

  if (crore) parts.push(`${numberToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(' ');
}

/** "Rupees One Thousand Two Hundred and Fifty Paise only", from paise. */
export function amountInWords(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;
  const head = `Rupees ${numberToWords(rupees)}`;
  return remainder ? `${head} and ${numberToWords(remainder)} Paise only` : `${head} only`;
}
