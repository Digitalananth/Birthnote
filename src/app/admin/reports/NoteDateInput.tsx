'use client';

import React from 'react';

/**
 * The "date on note" search box.
 *
 * A client component for one reason: the request-a-banknote form strips
 * anything that is not a digit as the customer types, so a letter never
 * appears in the box at all, and this field is held to the same rule. A
 * `pattern` alone would only complain at submit, after the letter is already
 * sitting there.
 *
 * Separators are kept — unlike the request form's three DD/MM/YY boxes this
 * is one box, and a partial search is the point: "1947", "08/1947" and
 * "1947-08" are all things an admin types.
 */
export default function NoteDateInput({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = React.useState(defaultValue);

  return (
    <input
      type="search"
      name="noteDate"
      value={value}
      onChange={(event) => setValue(event.target.value.replace(/[^0-9/-]/g, '').slice(0, 10))}
      maxLength={10}
      inputMode="numeric"
      placeholder="15/03/90 or 1990"
      title="DD/MM/YY as on the request form, or any part of it: 15/03/90, 03/1990, 1990"
      className="px-3 py-2 rounded-xl border border-border bg-background text-sm font-mono w-44 focus:outline-none focus:ring-2 focus:ring-primary/30"
    />
  );
}
