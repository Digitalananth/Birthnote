'use client';

import React, { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import NotePhotos from '@/components/NotePhotos';
import {
  PHOTO_ACCEPT,
  PHOTO_MAX_PER_ITEM,
  type OrderItemPhoto,
} from '@/lib/order-photo-types';
import type { Order, OrderItem } from '@/lib/order-types';

/**
 * Photographing a note without leaving the order queue.
 *
 * The admin works through the list with the notes in front of them, and
 * opening an order, adding a picture and coming back was three navigations for
 * one photo. This puts the same upload on the row: the thumbnails already on
 * the order, and a camera button beside them.
 *
 * Which note a photo belongs to is the one thing the row cannot assume. A
 * single-note order has no ambiguity and goes straight to the file picker; an
 * order of several asks first, because attaching the ₹500 to the ₹10 is a
 * mistake nobody would notice until the parcel was packed.
 */
export default function OrderPhotoQuickAdd({ order }: { order: Order }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [photos, setPhotos] = useState<Map<number, OrderItemPhoto[]>>(
    () => new Map(order.items.map((item) => [item.id, item.photos]))
  );
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  // Paid and shipped orders are closed records: the pictures stay, the camera
  // goes. Same rule as the fulfilment controls on the order itself.
  const locked = order.status === 'paid' || order.status === 'shipped';

  const roomFor = (item: OrderItem) =>
    (photos.get(item.id)?.length ?? 0) < PHOTO_MAX_PER_ITEM;
  const openItems = order.items.filter(roomFor);
  const all = order.items.flatMap((item) => photos.get(item.id) ?? []);

  const choose = (itemId: number) => {
    setError('');
    setTarget(itemId);
    setPicking(false);
    // The picker opens on the next tick so the input is definitely mounted
    // with the item it is uploading for.
    setTimeout(() => input.current?.click(), 0);
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length || target === null) return;
    setError('');
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append('photo', file);
        const response = await fetch(
          `/api/admin/orders/${order.reference}/items/${target}/photos`,
          { method: 'POST', body }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Upload failed.');
        setPhotos((prev) => new Map(prev).set(target, payload.photos ?? []));
      }
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  /** The note as the admin knows it: the date, and what it is. */
  const describe = (item: OrderItem) =>
    `${item.displayDate}${
      item.noteDenomination
        ? ` · ${item.noteDenomination}`
        : item.requestedDenomination
          ? ` · ₹${item.requestedDenomination}`
          : ''
    }`;

  return (
    <div className="relative flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {all.length > 0 && (
          <NotePhotos
            reference={order.reference}
            photos={all}
            label={order.reference}
            size={32}
          />
        )}

        {!locked && openItems.length > 0 && (
          <button
            type="button"
            disabled={busy}
            title="Add a photo of a note on this order"
            aria-label="Add a photo to this order"
            onClick={(event) => {
              // The whole row is a link to the order; this button is not.
              event.preventDefault();
              event.stopPropagation();
              if (order.items.length === 1) choose(order.items[0].id);
              else setPicking((open) => !open);
            }}
            className="w-9 h-9 rounded-lg border border-dashed border-border text-muted-foreground flex items-center justify-center hover:text-foreground hover:border-primary transition-colors disabled:opacity-40"
          >
            <Icon name={busy ? 'ArrowPathIcon' : 'PhotoIcon'} size={16} />
          </button>
        )}
      </div>

      {/* Which note is this a photo of? Only asked when there is a choice. */}
      {picking && (
        <div
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          className="absolute top-11 right-0 z-20 w-64 max-h-64 overflow-y-auto rounded-xl border border-border bg-background shadow-lg p-2 flex flex-col gap-1"
        >
          <p className="px-2 py-1 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
            Photo of which note?
          </p>
          {openItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => choose(item.id)}
              className="text-left px-2 py-2 rounded-lg text-xs text-foreground hover:bg-muted/60 transition-colors"
            >
              <span className="font-mono font-semibold">{describe(item)}</span>
              <span className="block text-[11px] text-muted-foreground">
                {(photos.get(item.id)?.length ?? 0) || 'No'} photo
                {(photos.get(item.id)?.length ?? 0) === 1 ? '' : 's'}
                {item.availability === 'available' ? ' · found' : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      <input
        ref={input}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => upload(event.target.files)}
      />

      {error && (
        <p role="alert" className="text-[11px] text-red-600 max-w-[12rem] text-right">
          {error}
        </p>
      )}
    </div>
  );
}
