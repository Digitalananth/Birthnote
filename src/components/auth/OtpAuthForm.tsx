'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Field from '@/components/auth/Field';
import SubmitButton from '@/components/auth/SubmitButton';
import FormAlert from '@/components/auth/FormAlert';
import {
  validateIdentifierEntry,
  validateOtpEntry,
  identifierChannel,
  formatPhoneNumber,
  OTP_LENGTH,
  type FieldErrors,
  type OtpValues,
  type IdentifierChannel,
} from '@/lib/auth-validation';

/**
 * Signing in, in two steps: a mobile number or an email address, then the code
 * sent to it.
 *
 * One field takes either, rather than a pair of tabs, because the two are
 * never ambiguous — an address has an `@` and a number does not — and a person
 * who has to choose a mode before typing has been asked a question they should
 * not have to think about. The server decides for itself, from the same rule
 * (`identifierChannel`); this side only picks the labels.
 *
 * There is no separate "create an account" form, because with a code as the
 * only credential there is nothing to create — the second step makes an
 * account if the identifier has none. `/login` and `/signup` both render this,
 * which is why the copy never claims to know which one the person is doing
 * until the server has said whether they are new.
 *
 * The code is checked on the server and only there. The validation here is for
 * fast feedback on an obviously wrong entry or a half-typed code.
 */
type Step = 'identifier' | 'code';

export default function OtpAuthForm({ next }: { next?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('identifier');

  const [identifier, setIdentifier] = useState('');
  /** The canonical number or address the server confirmed it sent to. */
  const [sentTo, setSentTo] = useState('');
  const [channel, setChannel] = useState<IdentifierChannel>('sms');
  const [isNewAccount, setIsNewAccount] = useState(false);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  // The contact detail the person did *not* sign in with, offered once.
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [errors, setErrors] = useState<FieldErrors<OtpValues>>({});
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Counts the resend cooldown down in the UI. The server enforces its own —
  // this only stops the button being offered when it is certain to be refused.
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (cooldown <= 0) return;
    timer.current = setInterval(() => setCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [cooldown]);

  /** What to call the thing the code went to, in a sentence. */
  const sentToLabel = channel === 'email' ? sentTo : formatPhoneNumber(sentTo);

  const requestCode = async (resend = false) => {
    setFailure('');
    setNotice('');

    const check = validateIdentifierEntry({ identifier });
    setErrors(check.errors);
    if (!check.valid || !check.normalised) return;

    setBusy(true);
    try {
      const response = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: check.normalised.identifier }),
      });
      const payload = await response.json().catch(() => ({}));

      if (response.status === 422 && payload.errors) {
        setErrors(payload.errors);
        return;
      }
      if (!response.ok) {
        // A 429 carries the seconds left, so the button can be disabled for
        // exactly as long as it will keep being refused.
        if (typeof payload.retryAfter === 'number') setCooldown(payload.retryAfter);
        setFailure(payload.error || 'We could not send your code. Please try again.');
        return;
      }

      setSentTo(payload.identifier as string);
      setChannel((payload.channel as IdentifierChannel) ?? 'sms');
      setIsNewAccount(Boolean(payload.isNewAccount));
      setCooldown(Number(payload.resendInSeconds) || 45);
      setStep('code');
      setCode('');
      if (resend) setNotice('A new code is on its way.');
    } catch {
      setFailure('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    setFailure('');
    setNotice('');

    const check = validateOtpEntry({ identifier: sentTo, code, name, email, phone });
    setErrors(check.errors);
    if (!check.valid || !check.normalised) return;

    // Asked for, and required, only on an identifier we have never seen.
    if (isNewAccount && !name.trim()) {
      setErrors({ name: 'Please enter your name' });
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(check.normalised),
      });
      const payload = await response.json().catch(() => ({}));

      if (payload.errors) {
        setErrors(payload.errors);
        // A dead code cannot be retyped into life, so go back for a new one.
        if (payload.expired) {
          setStep('identifier');
          setFailure(payload.errors.code || 'That code has expired. Request a new one.');
          setErrors({});
        }
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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (step === 'identifier') void requestCode();
    else void submitCode();
  };

  if (step === 'identifier') {
    // Switches the keyboard and the autofill hint the moment an `@` appears,
    // rather than making the person declare which they are typing first.
    const typing = identifierChannel(identifier);
    return (
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <Field
          id="identifier"
          label="Mobile number or email"
          type={typing === 'email' ? 'email' : 'tel'}
          autoComplete={typing === 'email' ? 'email' : 'tel'}
          placeholder="+91 98765 43210 or you@email.com"
          value={identifier}
          onChange={setIdentifier}
          error={errors.identifier}
          hint="We will send you a code. No password to remember."
        />
        {failure && <FormAlert tone="error">{failure}</FormAlert>}
        <SubmitButton busy={busy} busyLabel="Sending your code…">
          Send me a code
        </SubmitButton>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <div>
        <Field
          id="code"
          label={`${OTP_LENGTH}-digit code`}
          type="text"
          // `one-time-code` is what lets iOS and Android offer the code from
          // the SMS straight above the keyboard.
          autoComplete="one-time-code"
          placeholder="123456"
          value={code}
          onChange={(value) => setCode(value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
          error={errors.code}
        />
        <p className="text-xs text-muted-foreground mt-2">
          Sent to {sentToLabel}.{' '}
          <button
            type="button"
            onClick={() => {
              setStep('identifier');
              setErrors({});
              setFailure('');
            }}
            className="text-primary underline"
          >
            Use a different one
          </button>
        </p>
      </div>

      {/*
        An identifier with no account behind it is about to get one, so this is
        the moment to ask for a name — and for the other way of reaching them,
        which is offered but never required. Someone signing back in is never
        shown any of this.
      */}
      {isNewAccount && (
        <>
          <Field
            id="name"
            label="Your name"
            autoComplete="name"
            placeholder="Full name"
            value={name}
            onChange={setName}
            error={errors.name}
          />
          {channel === 'sms' ? (
            <Field
              id="email"
              label="Email address"
              type="email"
              optional
              autoComplete="email"
              placeholder="your@email.com"
              value={email}
              onChange={setEmail}
              error={errors.email}
              hint="Only for receipts and order updates. You can add it later instead."
            />
          ) : (
            <Field
              id="phone"
              label="Mobile number"
              type="tel"
              optional
              autoComplete="tel"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={setPhone}
              error={errors.phone}
              hint="For delivery updates, and so you can sign in by SMS too."
            />
          )}
        </>
      )}

      {failure && <FormAlert tone="error">{failure}</FormAlert>}
      {notice && <FormAlert tone="success">{notice}</FormAlert>}

      <SubmitButton busy={busy} busyLabel={isNewAccount ? 'Creating your account…' : 'Signing in…'}>
        {isNewAccount ? 'Create my account' : 'Sign in'}
      </SubmitButton>

      <p className="text-sm text-muted-foreground text-center">
        {cooldown > 0 ? (
          `You can ask for another code in ${cooldown}s.`
        ) : (
          <button
            type="button"
            onClick={() => void requestCode(true)}
            disabled={busy}
            className="text-primary underline disabled:opacity-50"
          >
            Send the code again
          </button>
        )}
      </p>
    </form>
  );
}
