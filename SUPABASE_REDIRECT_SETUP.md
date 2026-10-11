# Supabase auth setup

Everything in this file is **dashboard configuration**, not code. The app code
for Google, email and phone sign-in is complete; these settings are what make
each one actually work in a given environment.

Project: `cxujipeulvhreiryaptr`

---

## 1. Redirect URLs (required — affects all methods)

https://supabase.com/dashboard/project/cxujipeulvhreiryaptr/auth/url-configuration

Supabase only honours a `redirectTo` that exactly matches an entry in the
allowlist. When nothing matches it silently drops the path and falls back to
the Site URL — which is how `localhost:3000/?code=…` happens.

Under **Redirect URLs**, add:

```
http://localhost:3000/auth/callback
http://localhost:3000/auth/confirm
https://<your-production-domain>/auth/callback
https://<your-production-domain>/auth/confirm
```

Under **Site URL**, set the production domain once deployed (it is
`http://localhost:3000` today, which is correct for local work only).

---

## 2. Email templates (required — email signup is broken without this)

https://supabase.com/dashboard/project/cxujipeulvhreiryaptr/auth/templates

**This is the setting that makes email signup work.**

Signup confirmation is a **6-digit code**, not a link. The app shows a code
entry step after signup and calls `verifyOtp`, the same interaction as the
phone flow. A code beats a link here for three reasons: it does not depend on
the redirect allowlist, it survives opening the email on a phone while signing
up on a laptop, and it cannot land the person back on the site signed out —
which is exactly what the default link did, because it returns the session in
the URL *fragment* and fragments are never sent to the server.

Supabase puts every variable in every email, so one template can carry both.
Put the code first and keep the link as a fallback:

| Template | Body should contain |
|---|---|
| Confirm signup | `{{ .Token }}` (the 6-digit code) — optionally also `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup` |
| Magic Link | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink` |
| Change Email Address | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change` |
| Reset Password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` |

`{{ .Token }}` is the plain 6-digit code. `{{ .TokenHash }}` is the value the
link form needs — they are not interchangeable.

Password reset stays a link, because it has to carry the person to a form where
they type a new password; a code would just add a step.

`/auth/confirm` rejects any `type` outside that list and sends expired or
reused links to `/login?error=link_expired`, which explains itself.

---

## 3. Custom SMTP (required before launch)

https://supabase.com/dashboard/project/cxujipeulvhreiryaptr/settings/auth

Supabase's built-in SMTP is for development only: it will **only deliver to
addresses belonging to project members**, and it is rate limited to a handful
of messages per hour. Every signup from a student who is not on the Supabase
team will silently never receive a confirmation email.

Configure a real sender (Resend, SendGrid, AWS SES, Postmark) before any real
user touches signup.

---

## 4. Phone / SMS (required for mobile sign-in)

https://supabase.com/dashboard/project/cxujipeulvhreiryaptr/auth/providers

Phone is currently **disabled**. The live settings endpoint reports
`"phone": false`, and a request to `/auth/v1/otp` returns:

```json
{"code":400,"error_code":"phone_provider_disabled","msg":"Unsupported phone provider"}
```

The `/phone` screen handles this gracefully — it tells the person phone
sign-in is not switched on yet and points them at Google or email — but no SMS
can be sent until:

1. **Phone provider** is enabled.
2. An **SMS provider** is configured with real credentials (Twilio, MessageBird,
   Vonage, or Twilio Verify). Supabase does not send SMS itself; this costs
   money per message.
3. For sending to **Indian numbers**, the sender must be registered under TRAI's
   DLT regime (principal entity + header + template registration) or carriers
   will drop the messages. Budget time for this — it is paperwork, not code.

Nothing in the app needs to change when these are switched on; the flow starts
working on the next request.

---

## 5. What each code path uses

| Route | Purpose |
|---|---|
| `/signup` | Email + password, then a 6-digit code, then `/profile/setup` |
| `/login` | Password. An unconfirmed account is sent a fresh code and taken to the same verify step rather than dead-ending |
| `/auth/callback` | OAuth `code` exchange (Google, business Google) |
| `/auth/confirm` | Email link `token_hash` exchange — the fallback for anyone who taps the link instead of copying the code |
| `/phone` | Two-step SMS OTP: number → 6-digit code |
| `/forgot-password` → `/reset-password` | Password recovery |

Routing and session refresh all happen in `src/proxy.ts` — the single routing
layer. There is deliberately no `middleware.ts`.
