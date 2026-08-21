'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import FormAlert from '@/components/auth/FormAlert';
import { validateNewPassword, PASSWORD_MIN } from '@/lib/auth-validation';

export default function AdminResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [values, setValues] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [failure, setFailure] = useState('');
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailure('');

    const check = validateNewPassword(values);
    setErrors(check.errors);
    if (!check.valid) return;

    setPending(true);
    try {
      const response = await fetch('/api/admin/reset-password', {
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
      // The reset signs them in, so go straight to the queue.
      router.replace('/admin');
      router.refresh();
    } catch {
      setFailure('We could not reach the server. Try again.');
    } finally {
      setPending(false);
    }
  };

  const input =
    'px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label htmlFor="password" className="text-sm font-semibold text-foreground">
        New password
      </label>
      <input
        id="password"
        type="password"
        autoComplete="new-password"
        value={values.password}
        onChange={(event) => setValues((p) => ({ ...p, password: event.target.value }))}
        className={input}
      />
      {errors.password && <p className="text-sm text-red-600">{errors.password}</p>}

      <label htmlFor="confirmPassword" className="text-sm font-semibold text-foreground">
        Confirm new password
      </label>
      <input
        id="confirmPassword"
        type="password"
        autoComplete="new-password"
        value={values.confirmPassword}
        onChange={(event) => setValues((p) => ({ ...p, confirmPassword: event.target.value }))}
        className={input}
      />
      {errors.confirmPassword && <p className="text-sm text-red-600">{errors.confirmPassword}</p>}

      <p className="text-xs text-muted-foreground">At least {PASSWORD_MIN} characters.</p>

      {failure && <FormAlert tone="error">{failure}</FormAlert>}

      <button
        type="submit"
        disabled={pending}
        className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Set password'}
      </button>
    </form>
  );
}
