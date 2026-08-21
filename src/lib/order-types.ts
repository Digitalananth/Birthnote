/**
 * The order vocabulary: statuses, the record shapes, and the two derivations
 * every surface needs.
 *
 * Split out of `orders.ts` because that module is `server-only` — the admin
 * fulfilment controls and the request form are client components and need
 * these types, but must never pull the database code into the browser bundle.
 */
export type OrderStatus = 'pending' | 'checking' | 'confirmed' | 'unavailable' | 'paid' | 'shipped';

export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'checking',
  'confirmed',
  'unavailable',
  'paid',
  'shipped',
];

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
  message: string | null;
  status: OrderStatus;
  /** The sum of the available items' prices. Recomputed whenever one changes. */
  pricePaise: number;
  currency: string;
  adminNotes: string | null;
  stripeSessionId: string | null;
  paidAt: string | null;
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
  userId?: number | null;
  message?: string | null;
  items: NewOrderItemInput[];
}

/** Convenience for the parts of the UI that only care about what was found. */
export function availableItems(order: Order): OrderItem[] {
  return order.items.filter((item) => item.availability === 'available');
}

/** A one-line description of what an order is for. */
export function summariseOrder(order: Order): string {
  if (order.items.length === 1) return order.items[0].displayDate;
  return `${order.items.length} notes`;
}
