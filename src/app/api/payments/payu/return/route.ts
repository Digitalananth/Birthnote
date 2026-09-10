import { NextResponse } from 'next/server';
import { verifyResponseHash } from '@/lib/payu';
import { getOrderByGatewayOrder } from '@/lib/orders';
import { isValidReference } from '@/lib/validation';
import { settleIfPaid } from '@/server/settle';
import { recordError } from '@/server/errors';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/payments/payu/return — PayU's surl and furl.
 *
 * PayU sends the customer back by making their browser POST a signed form
 * here, which a page cannot receive, so this route takes it and answers with a
 * 303 to a page that can. It is a cross-site POST by design: no CSRF check and
 * no cookie is relied on.
 *
 * The form is a hint, not evidence. A valid hash with `status=success` is only
 * the cue to ask PayU directly through `settleIfPaid`; an invalid one is not an
 * error worth showing the customer, who is sent on to the success page, which
 * asks PayU itself and says "confirming" until the answer is yes.
 */
export async function POST(request: Request) {
  let fields: Record<string, string> = {};
  try {
    const form = await request.formData();
    fields = Object.fromEntries(
      [...form.entries()].map(([name, value]) => [name, typeof value === 'string' ? value : ''])
    );
  } catch {
    return NextResponse.redirect(`${env.siteUrl}/`, 303);
  }

  const txnId = fields.txnid ?? '';
  const order = txnId ? await getOrderByGatewayOrder(txnId).catch(() => null) : null;
  const reference = order?.reference ?? (isValidReference(fields.udf1 ?? '') ? fields.udf1 : null);
  if (!reference) return NextResponse.redirect(`${env.siteUrl}/`, 303);

  const signed = verifyResponseHash(fields);
  if (!signed) console.error(`[payu-return] hash mismatch for ${txnId}`);

  if (signed && fields.status === 'success') {
    try {
      await settleIfPaid(txnId, 'payu-return');
    } catch (error) {
      // The success page asks again, and the webhook and sweep are behind it.
      recordError('payu-return', error, reference);
    }
  }

  // A signed failure goes back to the payment page to try again. Anything
  // else — success, pending, or a form we could not verify — goes to the
  // success page, which says only what PayU confirms.
  const destination =
    signed && fields.status === 'failure'
      ? `/payment/${reference}?payment=failed`
      : `/payment/${reference}/success`;
  return NextResponse.redirect(`${env.siteUrl}${destination}`, 303);
}
