'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import type { Order } from '@/lib/order-types';

/**
 * Booking the parcel with Shiprocket.
 *
 * Separate from StatusActions because it answers a different question. That
 * control moves the order along the pipeline; this one talks to a courier, and
 * the thing that can go wrong is not "the order is not ready" but "somebody
 * else's server said no". So the failure it has to render is a message from
 * Shiprocket, per step, rather than a disabled button with a reason.
 *
 * It never sets the order to dispatched. Booking a courier and handing over a
 * box are different events; "Mark dispatched" below stays the one that says
 * the parcel has actually gone.
 */

const STEP_LABELS: Record<string, string> = {
  create: 'Shipment created',
  awb: 'AWB assigned',
  pickup: 'Pickup booked',
  label: 'Label generated',
};

interface StepResult {
  step: string;
  state: 'done' | 'skipped' | 'failed';
  detail?: string;
}

export default function ShipmentPanel({
  order,
  configured,
  pickupLocationSet,
}: {
  order: Order;
  /** SHIPROCKET_EMAIL and password are present in the environment. */
  configured: boolean;
  /** A pickup nickname has been set in Settings → Shipping. */
  pickupLocationSet: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [working, setWorking] = useState(false);
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [error, setError] = useState('');

  const book = async () => {
    setWorking(true);
    setError('');
    setSteps([]);
    try {
      const response = await fetch(`/api/admin/orders/${order.reference}/shipment`, {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        steps?: StepResult[];
        error?: string;
      };
      setSteps(payload.steps ?? []);
      // A 207 carries both: some steps worked, one did not, and the body says
      // which. Showing the error without the steps would hide the progress
      // that was actually made and persisted.
      if (payload.error) setError(payload.error);
      else if (!response.ok) setError('Could not book the shipment.');
      startTransition(() => router.refresh());
    } catch {
      setError('Could not reach the server.');
    } finally {
      setWorking(false);
    }
  };

  // Why the button cannot be pressed, in the admin's words — the same
  // convention StatusActions uses, and for the same reason: a dead button with
  // no visible cause is indistinguishable from a broken one.
  const blocked = !configured
    ? 'Shiprocket is not configured on the server.'
    : !pickupLocationSet
      ? 'Set a pickup location in Settings → Shipping first — it must match an address registered in Shiprocket.'
      : !order.shipping
        ? 'This order has no delivery address.'
        : order.status !== 'paid' && !order.shiprocketShipmentId
          ? 'Only a paid order can be booked with a courier.'
          : null;

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  // Reads the full scan history from Shiprocket's tracking API — what the
  // webhook never sent, or sent before the AWB was saved.
  const refreshTracking = async () => {
    setSyncing(true);
    setSyncMessage('');
    try {
      const response = await fetch(`/api/admin/orders/${order.reference}/tracking`, {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        added?: number;
        error?: string;
      };
      setSyncMessage(
        response.ok
          ? `${payload.added ?? 0} new scan${payload.added === 1 ? '' : 's'} added.`
          : payload.error || 'Could not refresh tracking.'
      );
      startTransition(() => router.refresh());
    } catch {
      setSyncMessage('Could not reach the server.');
    } finally {
      setSyncing(false);
    }
  };

  const booked = Boolean(order.shiprocketShipmentId);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-secondary/20 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-sans font-bold text-sm uppercase tracking-wide text-foreground">
          Courier
        </h3>
        {order.courierName && (
          <span className="text-xs text-muted-foreground">{order.courierName}</span>
        )}
      </div>

      {booked ? (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {[
            ['AWB', order.trackingNumber],
            ['Courier', order.courierName],
            ['Shipment', order.shiprocketShipmentId],
            ['Latest scan', order.shipmentStatus],
            ['Expected by', order.courierEtd],
            [
              'Tracking read',
              order.trackingSyncedAt
                ? new Date(order.trackingSyncedAt).toLocaleString('en-IN')
                : null,
            ],
          ]
            .filter(([, value]) => Boolean(value))
            .map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                  {label}
                </dt>
                <dd className="text-foreground font-medium break-words">{value}</dd>
              </div>
            ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground leading-relaxed">
          Pushes the order to Shiprocket, assigns the cheapest serviceable courier, books the pickup
          and generates a label. The AWB lands in the tracking field below.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={book}
          disabled={working || isPending || blocked !== null}
          title={blocked ?? undefined}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {working ? 'Booking…' : booked ? 'Retry unfinished steps' : 'Create shipment'}
        </button>

        {order.labelUrl && (
          <a
            href={order.labelUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-border text-foreground hover:bg-secondary transition-colors"
          >
            <Icon name="ArrowTopRightOnSquareIcon" size={16} />
            Print label
          </a>
        )}

        {order.trackingNumber && configured && (
          <button
            type="button"
            onClick={refreshTracking}
            disabled={syncing || isPending}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-border text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
          >
            <Icon name="ArrowPathIcon" size={16} />
            {syncing ? 'Refreshing…' : 'Refresh tracking'}
          </button>
        )}

        {order.trackUrl && (
          <a
            href={order.trackUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-border text-foreground hover:bg-secondary transition-colors"
          >
            <Icon name="ArrowTopRightOnSquareIcon" size={16} />
            Courier tracking
          </a>
        )}
      </div>

      {syncMessage && <p className="text-xs text-muted-foreground">{syncMessage}</p>}

      {blocked && <p className="text-xs text-muted-foreground">{blocked}</p>}

      {steps.length > 0 && (
        <ul className="flex flex-col gap-1">
          {steps.map((result) => (
            <li key={result.step} className="flex items-start gap-2 text-xs">
              <Icon
                name={
                  result.state === 'failed'
                    ? 'ExclamationTriangleIcon'
                    : result.state === 'skipped'
                      ? 'MinusCircleIcon'
                      : 'CheckCircleIcon'
                }
                size={14}
                className={`mt-0.5 shrink-0 ${
                  result.state === 'failed'
                    ? 'text-red-600'
                    : result.state === 'skipped'
                      ? 'text-muted-foreground'
                      : 'text-green-700'
                }`}
              />
              <span
                className={result.state === 'failed' ? 'text-red-600' : 'text-muted-foreground'}
              >
                <span className="font-semibold text-foreground/70">
                  {STEP_LABELS[result.step] ?? result.step}
                </span>
                {result.state === 'skipped' && ' — already done'}
                {result.detail && ` — ${result.detail}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && !steps.some((result) => result.state === 'failed') && (
        <p role="alert" className="flex items-start gap-2 text-sm text-red-600">
          <Icon name="ExclamationTriangleIcon" size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
