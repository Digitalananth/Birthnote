import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { getOrderByReference, saveShipmentFields } from '@/lib/orders';
import {
  createShipment,
  assignAwb,
  schedulePickup,
  generateLabel,
  ShiprocketError,
} from '@/lib/shiprocket';
import { isValidReference } from '@/lib/validation';
import { recordError } from '@/server/errors';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ reference: string }>;
}

type StepName = 'create' | 'awb' | 'pickup' | 'label';
interface StepResult {
  step: StepName;
  state: 'done' | 'skipped' | 'failed';
  detail?: string;
}

/**
 * POST /api/admin/orders/:reference/shipment — book the parcel with Shiprocket.
 *
 * Four calls to somebody else's server, run in order, each persisted the
 * moment it succeeds. That is what makes the button safe to press again: every
 * step first asks whether its own output is already on the order and skips if
 * so, so a run that failed at the pickup resumes at the pickup rather than
 * trying to create a second shipment for the same reference.
 *
 * It deliberately does *not* set the order to `shipped`. Booking a courier and
 * handing over a box are different events, and treating them as one emails the
 * customer "dispatched" while the parcel is still on the desk. "Mark
 * dispatched" stays the thing that says it has gone.
 *
 * The response reports every step rather than a single ok/failed, because
 * "which of the four broke" is the only question worth answering when one of
 * them does.
 */
export async function POST(_request: Request, { params }: Context) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  if (!env.shiprocket.configured()) {
    return NextResponse.json(
      { error: 'Shiprocket is not configured. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD.' },
      { status: 503 }
    );
  }

  const { reference } = await params;
  if (!isValidReference(reference)) {
    return NextResponse.json({ error: 'Invalid reference.' }, { status: 400 });
  }

  let order = await getOrderByReference(reference);
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

  // Booking a courier for an order nobody has paid for would be a real parcel
  // sent for real money on the strength of a misclick. A `shipped` order that
  // was already pushed to Shiprocket may still be finishing its steps — "Mark
  // dispatched" can be pressed before the AWB exists — so it may resume.
  const resumable = order.status === 'shipped' && Boolean(order.shiprocketShipmentId);
  if (order.status !== 'paid' && !resumable) {
    return NextResponse.json(
      { error: 'Only a paid order can be booked with a courier.' },
      { status: 409 }
    );
  }

  const steps: StepResult[] = [];
  /** Stops at the first failure: every later step needs this one's output. */
  const run = async (step: StepName, already: boolean, work: () => Promise<void>) => {
    if (steps.some((result) => result.state === 'failed')) return;
    if (already) {
      steps.push({ step, state: 'skipped' });
      return;
    }
    try {
      await work();
      steps.push({ step, state: 'done' });
    } catch (error) {
      const detail =
        error instanceof ShiprocketError
          ? error.duplicate
            ? `${error.message} The order already exists in Shiprocket — open it there and copy the AWB into the tracking field below.`
            : error.message
          : 'Shiprocket could not be reached.';
      steps.push({ step, state: 'failed', detail });
      recordError(`shiprocket.${step}`, error, reference);
    }
  };

  await run('create', Boolean(order.shiprocketShipmentId), async () => {
    const created = await createShipment(order!);
    await saveShipmentFields(order!.id, {
      shiprocketOrderId: created.shiprocketOrderId,
      shiprocketShipmentId: created.shipmentId,
    });
    order = await getOrderByReference(reference);
  });

  // A tracking number equal to the shipment ID was copied from the wrong field
  // by hand; it is not an AWB, so this step still has to run and replace it.
  const hasAwb =
    Boolean(order?.trackingNumber) && order?.trackingNumber !== order?.shiprocketShipmentId;
  await run('awb', hasAwb, async () => {
    const assigned = await assignAwb(order!.shiprocketShipmentId as string);
    // A recovered AWB comes without a courier name; keep the one already saved.
    await saveShipmentFields(order!.id, {
      trackingNumber: assigned.awb,
      courierName: assigned.courierName || order!.courierName,
    });
    order = await getOrderByReference(reference);
  });

  // Pickup has no field of its own to check — Shiprocket accepts a repeat
  // booking for the same shipment, so re-running it is harmless.
  await run('pickup', false, async () => {
    await schedulePickup(order!.shiprocketShipmentId as string);
  });

  await run('label', Boolean(order?.labelUrl), async () => {
    const labelUrl = await generateLabel(order!.shiprocketShipmentId as string);
    await saveShipmentFields(order!.id, { labelUrl });
    order = await getOrderByReference(reference);
  });

  const failed = steps.find((result) => result.state === 'failed');
  return NextResponse.json(
    { order: await getOrderByReference(reference), steps, error: failed?.detail ?? null },
    // 207: some of this worked and some did not, and the body says which.
    { status: failed ? 207 : 200 }
  );
}
