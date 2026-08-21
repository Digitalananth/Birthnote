'use client';

import React, { useState } from 'react';
import FormAlert from '@/components/auth/FormAlert';

export default function AdminForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Enter your email address');
      return;
    }
    setPending(true);
    try {
      const response = await fetch('/api/admin/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 422 && payload.errors?.email) {
        setError(payload.errors.email);
        return;
      }
      setSent(true);
    } catch {
      setError('We could not reach the server. Try again.');
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <FormAlert tone="success">
        If that address has an admin account, a reset link is on its way. It works once and expires
        in one hour.
      </FormAlert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label htmlFor="email" className="text-sm font-semibold text-foreground">
        Email address
      </label>
      <input
        id="email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  );
}
