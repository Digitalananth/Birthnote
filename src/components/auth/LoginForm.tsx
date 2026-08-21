'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Field from '@/components/auth/Field';
import SubmitButton from '@/components/auth/SubmitButton';
import FormAlert from '@/components/auth/FormAlert';
import { validateLogin, type FieldErrors, type LoginValues } from '@/lib/auth-validation';

export default function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors<LoginValues>>({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailure('');

    const check = validateLogin(values);
    setErrors(check.errors);
    if (!check.valid) return;

    setBusy(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const payload = await response.json().catch(() => ({}));

      if (response.status === 422 && payload.errors) {
        setErrors(payload.errors);
        return;
      }
      if (!response.ok) {
        setFailure(payload.error || 'Something went wrong. Please try again.');
        return;
      }

      // refresh() so server components re-render with the new session before
      // the navigation lands — otherwise the account page renders signed-out.
      router.replace(next && next.startsWith('/') ? next : '/account');
      router.refresh();
    } catch {
      setFailure('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <Field
        id="email"
        label="Email address"
        type="email"
        autoComplete="email"
        placeholder="your@email.com"
        value={values.email}
        onChange={(email) => setValues((p) => ({ ...p, email }))}
        error={errors.email}
      />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        value={values.password}
        onChange={(password) => setValues((p) => ({ ...p, password }))}
        error={errors.password}
      />
      {failure && <FormAlert tone="error">{failure}</FormAlert>}
      <SubmitButton busy={busy} busyLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
