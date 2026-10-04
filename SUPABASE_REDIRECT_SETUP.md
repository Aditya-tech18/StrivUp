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

**This is the setting that makes email signup work.** Supabase's default
`{{ .ConfirmationURL }}` returns the session in the URL *fragment*. Fragments
are never sent to the server, so with server-side auth the person lands looking
signed out, gets bounced by `proxy.ts`, and concludes that signing up is
broken. The app has a `/auth/confirm` route handler that exchanges a token hash
for a real session — the templates have to point at it.

Replace the link in each template body:

| Template | Link URL |
|---|---|
| Confirm signup | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup` |
| Magic Link | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink` |
| Change Email Address | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change` |
| Reset Password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` |

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
| `/auth/callback` | OAuth `code` exchange (Google, business Google) |
| `/auth/confirm` | Email link `token_hash` exchange (signup, recovery, magic link, email change) |
| `/phone` | Two-step SMS OTP: number → 6-digit code |
| `/forgot-password` → `/reset-password` | Password recovery |

Routing and session refresh all happen in `src/proxy.ts` — the single routing
layer. There is deliberately no `middleware.ts`.
