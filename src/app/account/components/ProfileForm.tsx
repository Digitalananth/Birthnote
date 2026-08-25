'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Field from '@/components/auth/Field';
import SubmitButton from '@/components/auth/SubmitButton';
import FormAlert from '@/components/auth/FormAlert';
import {
  validateProfile,
  formatPhoneNumber,
  type FieldErrors,
  type ProfileValues,
} from '@/lib/auth-validation';

export default function ProfileForm({
  user,
}: {
  user: { name: string; email: string | null; phone: string | null; whatsapp: string | null };
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    name: user.name,
    email: user.email ?? '',
    whatsapp: user.whatsapp ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors<ProfileValues>>({});
  const [failure, setFailure] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

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

      setSaved(true);
      // The layout header shows the name, so re-render the server tree.
      router.refresh();
    } catch {
      setFailure('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {/*
        The mobile number is shown, never edited: it is what this account signs
        in with, so moving it would need a code sent to the new number to prove
        it. Rendered as plain text rather than a disabled input so it does not
        read as a field that is temporarily unavailable.
      */}
      <div>
        <span className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3">
          Mobile number
        </span>
        <p className="py-3 text-base font-medium text-foreground border-b-2 border-border">
          {formatPhoneNumber(user.phone) || 'Not set'}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          This is how you sign in. Contact us if you need to change it.
        </p>
      </div>

      <Field
        id="name"
        label="Name"
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
        optional
        autoComplete="email"
        placeholder="your@email.com"
        value={values.email}
        onChange={(email) => setValues((p) => ({ ...p, email }))}
        error={errors.email}
        hint="Where receipts and order updates are sent. Leave it blank if you would rather not give one."
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

      {failure && <FormAlert tone="error">{failure}</FormAlert>}
      {saved && <FormAlert tone="success">Your details have been saved.</FormAlert>}

      <SubmitButton busy={busy} busyLabel="Saving…">
        Save changes
      </SubmitButton>
    </form>
  );
}
