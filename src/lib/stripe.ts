import 'server-only';
import Stripe from 'stripe';
import { env } from '@/lib/env';
import type { Order } from '@/lib/orders';

const globalForStripe = globalThis as unknown as { birthnoteStripe?: Stripe };

export function getStripe(): Stripe {
  if (!globalForStripe.birthnoteStripe) {
    globalForStripe.birthnoteStripe = new Stripe(env.stripe.secretKey(), {
      // No apiVersion override: pin to whatever this SDK release was built
      // and tested against, so upgrading the package upgrades both together.
      typescript: true,
      maxNetworkRetries: 2,
    });
  }
  return globalForStripe.birthnoteStripe;
}

/**
 * Creates a Stripe Checkout session for a confirmed order.
 *
 * Card details are entered on Stripe's own hosted page, so no card data ever
 * touches this server — that is what keeps the site out of PCI-DSS scope.
 */
export async function createCheckoutSession(order: Order) {
  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: order.customerEmail,
    client_reference_id: order.reference,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: order.currency.toLowerCase(),
          // Stripe takes the amount in the currency's minor unit: paise.
          unit_amount: order.pricePaise,
          product_data: {
            name: `Banknote from ${order.displayDate}`,
            description: [
              order.noteDenomination,
              order.noteCountry,
              order.noteCondition && `Condition: ${order.noteCondition}`,
            ]
              .filter(Boolean)
              .join(' · ') || 'Genuine banknote, archival sleeve and gift box.',
          },
        },
      },
    ],
    // Domestic delivery only — we ship within India.
    shipping_address_collection: { allowed_countries: ['IN'] },
    metadata: { reference: order.reference, noteDate: order.noteDate },
    // Stripe replaces the placeholder; keep it literal.
    success_url: `${env.siteUrl}/payment/${order.reference}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.siteUrl}/payment/${order.reference}?cancelled=1`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24h
  });
}
