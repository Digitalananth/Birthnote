'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import {
  masterListMeta,
  validateOptionValue,
  type MasterListKey,
  type MasterOption,
} from '@/lib/master-option-types';

/**
 * One editable list.
 *
 * Every change is a request followed by `router.refresh()`, so the rows on
 * screen are always the rows in the database rather than an optimistic guess
 * that can drift from it. The lists are short and the edits rare; correctness
 * is worth more here than saving a round trip.
 */
export default function MasterListEditor({
  listKey,
  options,
}: {
  listKey: MasterListKey;
  options: MasterOption[];
}) {
  const meta = masterListMeta(listKey);
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (input: RequestInfo, init: RequestInit) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(input, init);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error || 'That did not work. Please try again.');
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError('We could not reach the server.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    // Checked here as well as on the server, so a typo is caught before it
    // makes a round trip and the message is the same either way.
    const checked = validateOptionValue(listKey, value);
    if (!checked.value) {
      setError(checked.error ?? 'Enter a value');
      return;
    }
    const ok = await send('/api/admin/master-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listKey, value: checked.value }),
    });
    if (ok) setValue('');
  };

  const patch = (id: number, payload: Record<string, unknown>) =>
    send(`/api/admin/master-options/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

  const remove = (option: MasterOption) => {
    if (
      !window.confirm(
        `Delete “${option.value}” from ${meta.label}?\n\nOrders that already chose it keep it — they store the text, not a link to this list. It simply stops being offered.`
      )
    ) {
      return;
    }
    void send(`/api/admin/master-options/${option.id}`, { method: 'DELETE' });
  };

  const activeCount = options.filter((option) => option.isActive).length;

  return (
    <section className="card-warm p-6">
      <div className="mb-4">
        <h2 className="font-sans font-bold text-lg text-foreground">{meta.label}</h2>
        <p className="text-xs text-muted-foreground mt-1">{meta.description}</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Fills “{meta.field}” on the request form · {activeCount} shown
          {options.length !== activeCount ? `, ${options.length - activeCount} hidden` : ''}
        </p>
      </div>

      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3">
          Nothing in this list yet, so the form shows no choices at all. Add one below.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {options.map((option, index) => (
            <li key={option.id} className="flex items-center gap-3 py-2.5">
              <span
                className={`flex-1 text-sm font-medium ${
                  option.isActive ? 'text-foreground' : 'text-muted-foreground/60 line-through'
                }`}
              >
                {meta.numeric ? `₹${option.value}` : option.value}
              </span>

              {!option.isActive && (
                <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60">
                  hidden
                </span>
              )}

              {/* Denominations order themselves by amount, so moving one by
                  hand would be a button that appears to do nothing. */}
              {!meta.numeric && (
                <>
                  <button
                    type="button"
                    disabled={busy || index === 0}
                    onClick={() => void patch(option.id, { move: 'up' })}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    aria-label={`Move ${option.value} up`}
                  >
                    <Icon name="ArrowUpIcon" size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={busy || index === options.length - 1}
                    onClick={() => void patch(option.id, { move: 'down' })}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    aria-label={`Move ${option.value} down`}
                  >
                    <Icon name="ArrowDownIcon" size={14} />
                  </button>
                </>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() => void patch(option.id, { isActive: !option.isActive })}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 transition-colors"
              >
                {option.isActive ? 'Hide' : 'Show'}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => remove(option)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                aria-label={`Delete ${option.value}`}
              >
                <Icon name="TrashIcon" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
        {meta.numeric && <span className="text-sm font-semibold text-muted-foreground">₹</span>}
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={meta.placeholder}
          aria-label={`New ${meta.label} option`}
          className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/40"
        />
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          Add
        </button>
      </form>

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </section>
  );
}
