/**
 * The order vocabulary: statuses, the record shapes, and the two derivations
 * every surface needs.
 *
 * Split out of `orders.ts` because that module is `server-only` — the admin
 * fulfilment controls and the request form are client components and need
 * these types, but must never pull the database code into the browser bundle.
 */
export type OrderStatus =
  | 'pending'
  | 'checking'
  | 'confirmed'
  | 'unavailable'
  | 'paid'
  | 'shipped'
  | 'refunded';

export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'checking',
  'confirmed',
  'unavailable',
  'paid',
  'shipped',
  'refunded',
];

/**
 * How long a confirmed note is held for the customer.
 *
 * This is the single source of the promise. The confirmation email, the
 * reminders, the account banner and the sweep that enforces it all read this
 * constant, so the number a customer is told and the number the system acts on
 * cannot drift apart — which is exactly what had happened when "held for 7
 * days" was hardcoded into the copy and implemented nowhere.
 */
export const HOLD_DAYS = 7;

/** How close to the deadline counts as "running out", for the admin queue. */
export const HOLD_SOON_DAYS = 2;

/** Where one requested note stands. Availability is per note, not per order. */
export type ItemAvailability = 'pending' | 'available' | 'unavailable';

export interface OrderItem {
  id: number;
  position: number;
  noteDate: string;
  displayDate: string;
  requestedDenomination: number | null;
  giftRelationship: string | null;
  giftFor: string | null;
  availability: ItemAvailability;
  /** What this note costs. Null until the admin confirms it. */
  pricePaise: number | null;
  noteDenomination: string | null;
  noteCondition: string | null;
  noteSerial: string | null;
  noteCountry: string | null;
}

export interface Order {
  id: number;
  reference: string;
  /** Null for guest orders — the funnel does not require an account. */
  userId: number | null;
  customerName: string;
  customerEmail: string;
  /** Where to send WhatsApp updates. Null when none was given. */
  whatsapp: string | null;
  /** Consent, captured per order — guests opt in too. */
  whatsappOptIn: boolean;
  message: string | null;
  status: OrderStatus;
  /** The sum of the available items' prices. Recomputed whenever one changes. */
  pricePaise: number;
  currency: string;
  adminNotes: string | null;
  stripeSessionId: string | null;
  paidAt: string | null;
  /** When the 7-day hold on a confirmed order runs out. Null unless confirmed. */
  heldUntil: string | null;
  /** How many hold reminders have been sent, so the sweep never repeats one. */
  holdReminderCount: number;
  /** Set when a hold ran out unpaid. The order is flagged, never auto-cancelled. */
  holdLapsedAt: string | null;
  trackingNumber: string | null;
  createdAt: string;
  updatedAt: string;
  /** Always at least one, including for orders that predate bulk. */
  items: OrderItem[];
}

export interface OrderEvent {
  status: string;
  note: string | null;
  actor: string;
  createdAt: string;
}

export interface NewOrderItemInput {
  noteDate: string;
  displayDate: string;
  requestedDenomination?: number | null;
  giftRelationship?: string | null;
  giftFor?: string | null;
}

export interface NewOrderInput {
  customerName: string;
  customerEmail: string;
  whatsapp?: string | null;
  whatsappOptIn?: boolean;
  userId?: number | null;
  message?: string | null;
  items: NewOrderItemInput[];
}

/** Convenience for the parts of the UI that only care about what was found. */
export function availableItems(order: Order): OrderItem[] {
  return order.items.filter((item) => item.availability === 'available');
}

/**
 * One date block as the customer filled it in.
 *
 * The form asks for a date, a recipient, and every denomination wanted for
 * that date — and then expands that into one item per note. This puts the
 * items back into the blocks they came from, so an order of seven notes reads
 * as the two requests it actually was rather than seven unrelated lines.
 */
export interface OrderItemGroup {
  key: string;
  noteDate: string;
  displayDate: string;
  giftRelationship: string | null;
  giftFor: string | null;
  items: OrderItem[];
}

/**
 * Groups an order's items back into the blocks they were requested in.
 *
 * The recipient is part of the key, not just the date: two notes for the same
 * day bought for two different people were two blocks on the form, and merging
 * them would put one person's name over the other's note. Order is preserved —
 * groups appear in the order their first note does, and `position` already
 * carries the sequence the customer typed.
 */
export function groupOrderItems(items: OrderItem[]): OrderItemGroup[] {
  const groups = new Map<string, OrderItemGroup>();

  for (const item of items) {
    const key = `${item.noteDate}|${item.giftRelationship ?? ''}|${item.giftFor ?? ''}`;
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
    } else {
      groups.set(key, {
        key,
        noteDate: item.noteDate,
        displayDate: item.displayDate,
        giftRelationship: item.giftRelationship,
        giftFor: item.giftFor,
        items: [item],
      });
    }
  }

  return [...groups.values()];
}

/** A one-line description of what an order is for. */
export function summariseOrder(order: Order): string {
  if (order.items.length === 1) return order.items[0].displayDate;
  return `${order.items.length} notes`;
}
