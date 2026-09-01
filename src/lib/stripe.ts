import 'server-only';
import Stripe from 'stripe';
import { env } from '@/lib/env';
import { availableItems, type Order } from '@/lib/orders';

const globalForStripe = globalThis as unknown as { myLuckyDatesStripe?: Stripe };

export function getStripe(): Stripe {
  if (!globalForStripe.myLuckyDatesStripe) {
    globalForStripe.myLuckyDatesStripe = new Stripe(env.stripe.secretKey(), {
      // No apiVersion override: pin to whatever this SDK release was built
      // and tested against, so upgrading the package upgrades both together.
      typescript: true,
      maxNetworkRetries: 2,
    });
  }
  return globalForStripe.myLuckyDatesStripe;
}

/** Thrown when an order is not in a state that can be paid for. */
export class NotPayableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotPayableError';
  }
}

/**
 * Creates a Stripe Checkout session for a confirmed order.
 *
 * Card details are entered on Stripe's own hosted page, so no card data ever
 * touches this server — that is what keeps the site out of PCI-DSS scope.
 *
 * Each available note is its own line item, so a customer paying for three
 * dates sees the three of them priced separately on Stripe's page rather than
 * one unexplained total. The line items are built from the same rows the order
 * total is summed from, so the two cannot disagree.
 */
export async function createCheckoutSession(order: Order) {
  const payable = availableItems(order).filter((item) => (item.pricePaise ?? 0) > 0);
  if (!payable.length) {
    throw new NotPayableError('This order has no priced notes to pay for.');
  }

  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: order.customerEmail,
    client_reference_id: order.reference,
    line_items: payable.map((item) => ({
      quantity: 1,
      price_data: {
        currency: order.currency.toLowerCase(),
        // Stripe takes the amount in the currency's minor unit: paise.
        unit_amount: item.pricePaise as number,
        product_data: {
          name: `Banknote from ${item.displayDate}`,
          description:
            [
              item.noteDenomination,
              item.noteCountry,
              item.noteCondition && `Condition: ${item.noteCondition}`,
            ]
              .filter(Boolean)
              .join(' · ') || 'Genuine banknote, archival sleeve and gift box.',
        },
      },
    })),
    // Domestic delivery only — we ship within India.
    shipping_address_collection: { allowed_countries: ['IN'] },
    metadata: { reference: order.reference, notes: String(payable.length) },
    // The same reference on the PaymentIntent. A failed payment arrives as a
    // payment_intent.* event, which carries no session and so no other way
    // back to the order.
    payment_intent_data: {
      metadata: { reference: order.reference },
    },
    // Stripe replaces the placeholder; keep it literal.
    success_url: `${env.siteUrl}/payment/${order.reference}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.siteUrl}/payment/${order.reference}?cancelled=1`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24h
  });
}
