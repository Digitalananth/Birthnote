'use client';

import React from 'react';

/**
 * One labelled input in the account forms, styled to match the request form's
 * underline treatment.
 */
export default function Field({
  id,
  label,
  type = 'text',
  value,
  onChange,
  error,
  hint,
  optional,
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  optional?: boolean;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3"
      >
        {label}{' '}
        {optional ? (
          <span className="text-muted-foreground/50 normal-case font-normal tracking-normal">
            (optional)
          </span>
        ) : (
          <span className="text-accent">*</span>
        )}
      </label>
      <div
        className={`border-b-2 transition-colors ${
          error ? 'border-red-400' : 'border-border focus-within:border-accent'
        }`}
      >
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="void-input-warm w-full py-3 text-base font-medium text-foreground placeholder:text-muted-foreground/40"
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-500 mt-1">
          {error}
        </p>
      )}
      {!error && hint && <p className="text-xs text-muted-foreground mt-2">{hint}</p>}
    </div>
  );
}
