'use client';

import React, { useState } from 'react';
import Field from '@/components/auth/Field';
import SubmitButton from '@/components/auth/SubmitButton';
import FormAlert from '@/components/auth/FormAlert';
import { validateNewPassword, PASSWORD_MIN } from '@/lib/auth-validation';

interface Errors {
  currentPassword?: string;
  password?: string;
  confirmPassword?: string;
}

export default function ChangePasswordForm() {
  const [values, setValues] = useState({
    currentPassword: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailure('');
    setSaved(false);

    const check = validateNewPassword(values);
    setErrors(check.errors);
    if (!check.valid) return;

    setBusy(true);
    try {
      const response = await fetch('/api/account/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const payload = await response.json().catch(() => ({}));

      if (payload.errors) {
        setErrors(payload.errors);
        return;
      }
      if (!response.ok) {
        setFailure(payload.error || 'Something went wrong. Please try again.');
        return;
      }

      setValues({ currentPassword: '', password: '', confirmPassword: '' });
      setSaved(true);
    } catch {
      setFailure('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <Field
        id="currentPassword"
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={values.currentPassword}
        onChange={(currentPassword) => setValues((p) => ({ ...p, currentPassword }))}
        error={errors.currentPassword}
      />
      <Field
        id="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        value={values.password}
        onChange={(password) => setValues((p) => ({ ...p, password }))}
        error={errors.password}
        hint={`At least ${PASSWORD_MIN} characters.`}
      />
      <Field
        id="confirmNewPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={values.confirmPassword}
        onChange={(confirmPassword) => setValues((p) => ({ ...p, confirmPassword }))}
        error={errors.confirmPassword}
      />

      {failure && <FormAlert tone="error">{failure}</FormAlert>}
      {saved && (
        <FormAlert tone="success">
          Your password has been changed and every other device has been signed out.
        </FormAlert>
      )}

      <SubmitButton busy={busy} busyLabel="Saving…">
        Change password
      </SubmitButton>
    </form>
  );
}
