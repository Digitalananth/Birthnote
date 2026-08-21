'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Field from '@/components/auth/Field';
import SubmitButton from '@/components/auth/SubmitButton';
import FormAlert from '@/components/auth/FormAlert';
import { validateProfile, type FieldErrors, type ProfileValues } from '@/lib/auth-validation';

interface Errors extends FieldErrors<ProfileValues> {
  email?: string;
  currentPassword?: string;
}

export default function ProfileForm({
  user,
}: {
  user: { name: string; email: string; phone: string | null; whatsapp: string | null };
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    name: user.name,
    email: user.email,
    phone: user.phone ?? '',
    whatsapp: user.whatsapp ?? '',
    currentPassword: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const emailChanging = values.email.trim().toLowerCase() !== user.email;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailure('');
    setSaved(false);

    const check = validateProfile(values);
    setErrors(check.errors);
    if (!check.valid) return;

    setBusy(true);
    try {
      const response = await fetch('/api/account/profile', {
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

      setValues((p) => ({ ...p, currentPassword: '' }));
      setSaved(true);
      // The layout header shows the name and email, so re-render the server tree.
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
        label="Name"
        autoComplete="name"
        value={values.name}
        onChange={(name) => setValues((p) => ({ ...p, name }))}
        error={errors.name}
      />
      <Field
        id="email"
        label="Email address"
        type="email"
        autoComplete="email"
        value={values.email}
        onChange={(email) => setValues((p) => ({ ...p, email }))}
        error={errors.email}
        hint="This is where every order update is sent."
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
        id="whatsapp"
        label="WhatsApp"
        type="tel"
        optional
        placeholder="+91 98765 43210"
        value={values.whatsapp}
        onChange={(whatsapp) => setValues((p) => ({ ...p, whatsapp }))}
        error={errors.whatsapp}
        hint="We will use this for order updates once WhatsApp notifications are live."
      />

      {/*
        Only asked for when the email is actually changing — the address is the
        login identifier, so taking it over must cost more than an open tab.
      */}
      {emailChanging && (
        <Field
          id="currentPassword"
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={values.currentPassword}
          onChange={(currentPassword) => setValues((p) => ({ ...p, currentPassword }))}
          error={errors.currentPassword}
          hint="Required to change the email address on the account."
        />
      )}

      {failure && <FormAlert tone="error">{failure}</FormAlert>}
      {saved && <FormAlert tone="success">Your details have been saved.</FormAlert>}

      <SubmitButton busy={busy} busyLabel="Saving…">
        Save changes
      </SubmitButton>
    </form>
  );
}
