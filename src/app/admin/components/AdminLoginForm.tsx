'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';

export default function AdminLoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [values, setValues] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Login failed.');
      router.replace(next);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Login failed.');
      setPending(false);
    }
  };

  const input =
    'px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label htmlFor="email" className="text-sm font-semibold text-foreground">
        Email address
      </label>
      <input
        id="email"
        type="email"
        autoComplete="username"
        value={values.email}
        onChange={(event) => setValues((p) => ({ ...p, email: event.target.value }))}
        className={input}
      />

      <label htmlFor="password" className="text-sm font-semibold text-foreground">
        Password
      </label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        value={values.password}
        onChange={(event) => setValues((p) => ({ ...p, password: event.target.value }))}
        className={input}
      />

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        <Icon name="LockClosedIcon" size={16} />
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
