/**
 * Presentation metadata for order statuses.
 *
 * Client-safe (no server-only imports) so the tracking page, the admin panel
 * and the email templates all describe a status the same way.
 */
import type { OrderStatus } from '@/lib/orders';

export interface StatusPresentation {
  label: string;
  description: string;
  icon:
    | 'ClockIcon'
    | 'MagnifyingGlassIcon'
    | 'CheckCircleIcon'
    | 'XCircleIcon'
    | 'CreditCardIcon'
    | 'TruckIcon';
  color: string;
  bg: string;
  border: string;
}

export const STATUS_CONFIG: Record<OrderStatus, StatusPresentation> = {
  pending: {
    label: 'Date Submitted',
    description: 'Your request has been received and is in our queue.',
    icon: 'ClockIcon',
    color: 'text-accent',
    bg: 'bg-accent/15',
    border: 'border-accent/30',
  },
  checking: {
    label: 'Checking Collection',
    description: 'We are actively searching our collection for your date.',
    icon: 'MagnifyingGlassIcon',
    color: 'text-primary',
    bg: 'bg-primary/10',
    border: 'border-primary/30',
  },
  confirmed: {
    label: 'Confirmed — Available',
    description: 'Your date is available. Complete payment to reserve it.',
    icon: 'CheckCircleIcon',
    color: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
  },
  unavailable: {
    label: 'Not Available',
    description: 'We could not find a note for this date. You have not been charged.',
    icon: 'XCircleIcon',
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
  paid: {
    label: 'Paid — Preparing',
    description: 'Payment received. Your note is being packaged for dispatch.',
    icon: 'CreditCardIcon',
    color: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
  },
  shipped: {
    label: 'Dispatched',
    description: 'Your note is on its way with tracked delivery.',
    icon: 'TruckIcon',
    color: 'text-primary',
    bg: 'bg-primary/10',
    border: 'border-primary/30',
  },
};

export const PROGRESS_STEPS = [
  { key: 'pending', label: 'Submitted' },
  { key: 'checking', label: 'Checking' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'paid', label: 'Paid' },
  { key: 'shipped', label: 'Dispatched' },
] as const;

/** How far along the progress bar a status sits. -1 when the order stopped. */
export function progressIndex(status: OrderStatus): number {
  if (status === 'unavailable') return 1;
  return PROGRESS_STEPS.findIndex((step) => step.key === status);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}
