# Phase 6 — Sign in with a one-time code

Customer accounts stopped having passwords. The way in is a six-digit code,
sent either by SMS to a mobile number or by email to an address — whichever
the customer typed.

Admin accounts are untouched: they still sign in with an email address and a
password, from `admin_users`.

---

## The flow

Two steps, one form, rendered by both `/login` and `/signup`:

1. `POST /api/auth/otp/request` — a number or an address goes in, a code goes
   out over the matching channel.
2. `POST /api/auth/otp/verify` — the code comes back; the session is created,
   and the *account* is created too if that identifier had none.

There is no separate act of registering, which is why the two pages render the
same component and differ only in wording. `/signup` is kept rather than
redirected because several places link to it, and landing on a page titled
"Welcome back" would read as having been sent somewhere else.

| Piece | Where |
| --- | --- |
| Code issue / verify | `src/lib/otp.ts` |
| MSG91 delivery | `src/lib/sms.ts` |
| Phone normalisation | `normalisePhoneNumber` in `src/lib/auth-validation.ts` |
| Email delivery | `signInCodeEmail` in `src/lib/mail.ts` |
| The form | `src/components/auth/OtpAuthForm.tsx` |
| Codes table | `auth_otps` |

## One field, not two tabs

`identifierChannel` decides which of the two was typed, and the test is the
`@`: no phone number contains one, no address omits it. The browser and the
server apply the same rule from the same module, so what the form thinks it
sent a code to and what the server actually sent it to cannot diverge.

Both sides of that decision are stored. `auth_otps` keys on `(identifier,
channel)`, and the account is looked up by phone *or* by email accordingly —
never by both. Searching both columns would mean a code proving an address
could open the account holding the number, and two ways in would become one way
in for someone holding neither.

## The code is ours; MSG91 only delivers it

MSG91 has an endpoint that will generate *and* verify an OTP for you. It is not
used. `/api/v5/otp` accepts an `otp` parameter, so the code is generated here,
its SHA-256 stored here, and its expiry, attempt limit and single use enforced
here — against our own table.

That is worth the extra file for two reasons. Sign-in behaves identically
whichever provider is in front of it, so changing SMS vendor is a rewrite of
`sms.ts` and nothing else. And the rules that make a six-digit secret safe are
in the repository where they can be read, rather than in a vendor's defaults.

A six-digit code has a million values, which is only tolerable because guessing
is expensive: **ten minutes** to live, **five** wrong answers, and spent the
moment it is used or a newer one is issued. Remove any one and it is guessable.

## Normalising the number is the whole trick

`+91 98765 43210`, `098765 43210` and `9876543210` are one person. They are
reduced to `919876543210` — digits only, country code included — in
`auth-validation.ts`, which imports nothing server-only so the browser and the
API reduce them identically. Get this wrong and the same customer collects a
new account every time they type their number differently.

`NEXT_PUBLIC_AUTH_DEFAULT_COUNTRY_CODE` is what makes a bare ten-digit number
unambiguous. It is `NEXT_PUBLIC_` precisely so both sides read one value.

## Two identifiers, one account

An account may carry both a number and an address, and either signs in. The
second one is offered — never required — on the step that creates the account:
someone who signed in by SMS is asked for an address, someone who signed in by
email is asked for a number.

Filling one in never overwrites the other. `markPhoneVerified` and
`markEmailVerified` both use `COALESCE`, so a detail already on file stays put;
changing it is what the profile page is for. A number that already belongs to
another account is refused with `PhoneTakenError` rather than silently moved.

`users.phone` is nullable, so an account opened with an address alone is a
valid account with no number at all.

## Claiming guest orders needs a proved identifier

Orders placed without an account are matched to one on every sign-in:
`claimGuestOrders` sets `orders.user_id` where the row has no owner and its
`customer_email` or `whatsapp` matches the account.

It matches **only identifiers the account has proved with a one-time code**,
which is why it takes the whole `User` rather than loose strings. A guest order
carries the contact details of a person who may well have no account, so a
detail that was merely *typed* — the optional second contact offered at signup,
or an address entered on the profile page — must never claim anything. The
`user_id IS NULL` guard means an order cannot be moved between accounts, but
that cuts the wrong way once a wrong claim happens: the first claim wins and the
rightful owner is locked out of their own history for good.

So the profile page no longer claims orders when the address changes, and
`/api/auth/otp/verify` passes the user rather than the pair of details it
collected. Without this, signing in with one's own number and then typing a
stranger's address into the profile form handed over every guest order that
address ever placed — name, email, WhatsApp number, recipient details, message,
status and payment state.

## What an identifier being the identifier costs

**The number cannot be edited from the profile page.** Changing it is changing
who can sign in, so anyone with a borrowed open tab could point an account at
their own phone and keep it. Moving a number safely needs a code sent to the
*new* number; until that is built, the number is fixed at what the account was
created with, and the profile page shows it as text rather than a field.

The email address *is* editable there, and that is a live inconsistency worth
knowing about: an address is now also a way in, so the profile page can change
a credential without proving anything, while the number cannot. Editing an
address clears `email_verified`, but the sign-in path does not currently
require that flag. Closing this properly means the same code-to-the-new-address
step the number needs.

Until it is closed, one consequence is worth stating plainly: an unproved
address on an account still *reserves* that address. Put someone else's address
on your account and they cannot open one of their own with it, and when they
ask for a code at that address the code proves the address but signs them into
the account holding it. Guest orders are no longer part of the damage — see
above — but the reservation is, and it is the same fix that closes both: an
address must be proved before it is written, and an address only typed must
lose to one actually proved.

**Accounts that predate this have no number.** They cannot sign in. The
migration counts them and says so, because the shop owner should learn that
from a log rather than from a customer. Their orders are untouched and still
reachable by reference, and they get a fresh account the next time they sign in
with a number.

## Enumeration, deliberately accepted

`/api/auth/otp/request` answers with `isNewAccount`, so the second step knows
whether to ask for a name. That does tell a caller which numbers have accounts.

It was taken over the alternative — asking every returning customer for a name
they have already given — because the rate limits are what actually bound the
attack: 5 requests per number per hour, 20 per IP per hour, 45 seconds between
any two. Someone already holding a list of numbers or addresses learns little
worth having at that speed.

## Email

Still optional. `users.email` is nullable, and its UNIQUE key permits any
number of NULLs — at most one account per address, unlimited accounts with no
address at all. The same is now true of `users.phone`. Neither is required;
what is required is at least one of them, because one of them is what the code
was sent to.

The sign-in email carries the digits and no link. A message with a button in it
is the shape every phishing mail imitates, and training customers to click one
costs more than the convenience is worth.

Where an email is genuinely needed — a receipt for an order — the request form
asks for it and saves it back to the account, so it is asked exactly once.

## What was removed

`/api/auth/login`, `/api/auth/signup`, `/api/auth/forgot-password`,
`/api/auth/reset-password`, `/api/account/password`, the pages and forms behind
them, `users.password_hash`, the `password_resets` table, and — at the move to
two channels — the `phone_otps` table, replaced by `auth_otps`. It is dropped
rather than migrated: every row in it is either already spent or a code that
dies within ten minutes, so anyone mid-sign-in at deploy time simply asks for
another.

The column and the table are **dropped**, not left in place. Password hashes
that nothing can check are not inert: they are a store of secrets, still worth
stealing and still worth cracking, kept for a login that no longer exists.

`hashPassword` / `verifyPassword` / `fakePasswordCheck` moved from
`src/lib/users.ts` to `src/lib/password.ts` unchanged — admins still need them,
and moving them must not invalidate a single existing admin password.

## Configuration

See `.env.example`. SMS codes need `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID`;
email codes need the `SMTP_*` block that the order emails already use. With
either side unconfigured its codes are printed to the server console instead of
sent, which is how the flow is exercised locally without spending money on SMS.

An email code that SMTP genuinely fails to deliver returns 502, exactly as a
failed SMS does — unlike an order confirmation, a sign-in message the customer
never receives leaves them stuck at the code box.

The template must be DLT-approved and contain `##OTP##`. Keep
`MSG91_OTP_EXPIRY_MINUTES` equal to `AUTH_OTP_TTL_SECONDS`, or the SMS will
promise a different expiry than the one enforced.
