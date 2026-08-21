'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Field from '@/components/auth/Field';
import SubmitButton from '@/components/auth/SubmitButton';
import FormAlert from '@/components/auth/FormAlert';
import {
  validateNewPassword,
  PASSWORD_MIN,
  type FieldErrors,
  type NewPasswordValues,
} from '@/lib/auth-validation';

export default function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [values, setValues] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<FieldErrors<NewPasswordValues>>({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailure('');

    const check = validateNewPassword(values);
    setErrors(check.errors);
    if (!check.valid) return;

    setBusy(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, token }),
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

      // The reset signs them in, so go straight to the account.
      router.replace('/account');
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
        id="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        value={values.password}
        onChange={(password) => setValues((p) => ({ ...p, password }))}
        error={errors.password}
        hint={`At least ${PASSWORD_MIN} characters.`}
      />
      <Field
        id="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={values.confirmPassword}
        onChange={(confirmPassword) => setValues((p) => ({ ...p, confirmPassword }))}
        error={errors.confirmPassword}
      />
      {failure && <FormAlert tone="error">{failure}</FormAlert>}
      <SubmitButton busy={busy} busyLabel="Saving…">
        Set new password
      </SubmitButton>
    </form>
  );
}
