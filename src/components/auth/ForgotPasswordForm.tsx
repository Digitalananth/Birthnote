'use client';

import React, { useState } from 'react';
import Field from '@/components/auth/Field';
import SubmitButton from '@/components/auth/SubmitButton';
import FormAlert from '@/components/auth/FormAlert';

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Enter your email address');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 422 && payload.errors?.email) {
        setError(payload.errors.email);
        return;
      }
      // The endpoint answers the same way for every address, so the UI does too.
      setSent(true);
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <FormAlert tone="success">
        If that address has an account, a reset link is on its way. It works once and expires in one
        hour — check your spam folder if it does not arrive within a few minutes.
      </FormAlert>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <Field
        id="email"
        label="Email address"
        type="email"
        autoComplete="email"
        placeholder="your@email.com"
        value={email}
        onChange={setEmail}
        error={error}
      />
      <SubmitButton busy={busy} busyLabel="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}
