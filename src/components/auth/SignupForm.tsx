'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Field from '@/components/auth/Field';
import SubmitButton from '@/components/auth/SubmitButton';
import FormAlert from '@/components/auth/FormAlert';
import {
  validateSignup,
  PASSWORD_MIN,
  type FieldErrors,
  type SignupValues,
} from '@/lib/auth-validation';

export default function SignupForm({ next }: { next?: string }) {
  const router = useRouter();
  const [values, setValues] = useState({ name: '', email: '', password: '', phone: '' });
  const [errors, setErrors] = useState<FieldErrors<SignupValues>>({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailure('');

    const check = validateSignup(values);
    setErrors(check.errors);
    if (!check.valid) return;

    setBusy(true);
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const payload = await response.json().catch(() => ({}));

      if ((response.status === 422 || response.status === 409) && payload.errors) {
        setErrors(payload.errors);
        return;
      }
      if (!response.ok) {
        setFailure(payload.error || 'Something went wrong. Please try again.');
        return;
      }

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
        id="name"
        label="Your name"
        autoComplete="name"
        placeholder="Full name"
        value={values.name}
        onChange={(name) => setValues((p) => ({ ...p, name }))}
        error={errors.name}
      />
      <Field
        id="email"
        label="Email address"
        type="email"
        autoComplete="email"
        placeholder="your@email.com"
        value={values.email}
        onChange={(email) => setValues((p) => ({ ...p, email }))}
        error={errors.email}
        hint="Orders you have already placed with this address will appear in your account."
      />
      <Field
        id="phone"
        label="Phone"
        type="tel"
        optional
        autoComplete="tel"
        placeholder="+91 98765 43210"
        value={values.phone}
        onChange={(phone) => setValues((p) => ({ ...p, phone }))}
        error={errors.phone}
      />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        value={values.password}
        onChange={(password) => setValues((p) => ({ ...p, password }))}
        error={errors.password}
        hint={`At least ${PASSWORD_MIN} characters.`}
      />
      {failure && <FormAlert tone="error">{failure}</FormAlert>}
      <SubmitButton busy={busy} busyLabel="Creating your account…">
        Create account
      </SubmitButton>
    </form>
  );
}
