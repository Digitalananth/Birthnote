import { redirect } from 'next/navigation';

/**
 * Payment is always for a specific order, so the bare /payment URL has no
 * meaning. Anyone landing here (an old bookmark, a truncated email link) is
 * sent to tracking, where they can enter their reference.
 */
export default function PaymentIndexPage() {
  redirect('/track-order');
}
