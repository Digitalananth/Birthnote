import { INDIAN_STATES, isValidGstin } from '@/lib/india-gst';
import type { ShippingAddress } from '@/lib/order-types';

/**
 * The delivery address, checked the same way on the form and at the API.
 *
 * Client-safe, and deliberately shared: an address rejected by the server
 * after a redirect to Stripe would be rejected too late, and a message that
 * differs between the two is a customer told two different things.
 *
 * The rules are the postal ones, not a validation exercise. A PIN code is six
 * digits and never starts with zero; a state must be one of the notified
 * thirty-six, because it decides the tax and "TN" typed freehand is not a tax
 * treatment.
 */
export interface AddressInput {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  stateCode?: string;
  pincode?: string;
  phone?: string;
  buyerGstin?: string;
}

export type AddressErrors = Partial<Record<keyof AddressInput, string>>;

const PINCODE = /^[1-9][0-9]{5}$/;
/** Ten digits, optionally +91 and separators, as Indian couriers want it. */
const PHONE = /^(\+?91[- ]?)?[6-9][0-9]{9}$/;

export function validateAddress(input: AddressInput): {
  address?: ShippingAddress & { buyerGstin: string | null };
  errors: AddressErrors;
} {
  const errors: AddressErrors = {};
  const name = (input.name ?? '').trim();
  const line1 = (input.line1 ?? '').trim();
  const line2 = (input.line2 ?? '').trim();
  const city = (input.city ?? '').trim();
  const stateCode = (input.stateCode ?? '').trim();
  const pincode = (input.pincode ?? '').trim();
  const phone = (input.phone ?? '').replace(/[\s-]/g, '');
  const buyerGstin = (input.buyerGstin ?? '').trim().toUpperCase();

  if (name.length < 2) errors.name = 'Who should we address the parcel to?';
  if (name.length > 160) errors.name = 'That name is too long.';
  if (line1.length < 4) errors.line1 = 'Enter the house or flat and the street.';
  if (line1.length > 200) errors.line1 = 'Keep this under 200 characters.';
  if (line2.length > 200) errors.line2 = 'Keep this under 200 characters.';
  if (city.length < 2) errors.city = 'Enter the town or city.';
  if (city.length > 120) errors.city = 'That is too long.';
  if (!INDIAN_STATES.some((state) => state.code === stateCode)) {
    errors.stateCode = 'Choose your state.';
  }
  if (!PINCODE.test(pincode)) errors.pincode = 'Enter a six-digit PIN code.';
  // Optional, but a courier with a wrong number is worse than one with none.
  if (phone && !PHONE.test(phone)) errors.phone = 'Enter a ten-digit mobile number.';
  if (buyerGstin && !isValidGstin(buyerGstin)) {
    errors.buyerGstin = 'That is not a valid GSTIN. Leave it blank if you are not claiming credit.';
  }

  if (Object.keys(errors).length) return { errors };

  return {
    errors,
    address: {
      name,
      line1,
      line2: line2 || null,
      city,
      stateCode,
      pincode,
      phone: phone || null,
      buyerGstin: buyerGstin || null,
    },
  };
}

/** The address as a courier would write it, for emails and the invoice. */
export function formatAddressLines(
  address: ShippingAddress,
  stateNameOf: (code: string) => string
): string[] {
  return [
    address.name,
    address.line1,
    address.line2,
    `${address.city} ${address.pincode}`,
    stateNameOf(address.stateCode),
    address.phone,
  ].filter((line): line is string => Boolean(line && line.trim()));
}
