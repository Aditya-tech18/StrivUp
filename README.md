# StrivUp

**India's Platform for Growth — Build Better. Every Day.**

A challenge- and quest-based growth platform: structured challenges with a real
proof mechanism, streaks, leaderboards and a community proof feed, across
fitness, coding, reading, AI/ML, entrepreneurship, social work and exam prep.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4, Material Design 3 token system, Inter |
| Backend | Supabase — Auth, Postgres, Storage, Edge Functions |
| Proof AI | `gemini-3.5-flash-lite` via the Gemini Interactions API |
| Hosting | Vercel |

Supabase project: `striv-mvp` (`cxujipeulvhreiryaptr`, ap-south-1 / Mumbai).

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in the two values below
npm run dev
```

`.env.local` needs:

```
NEXT_PUBLIC_SUPABASE_URL=https://cxujipeulvhreiryaptr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable anon key>
```

Optional, and recommended in production so Open Graph images resolve against
the right origin:

```
NEXT_PUBLIC_SITE_URL=https://<your-production-domain>
```

Both `NEXT_PUBLIC_*` values ship to the browser, which is expected — the anon
key is a publishable key protected by row-level security. **No service-role key
or AI key ever belongs in this file.** Those live only as Supabase Edge Function
secrets.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build (fails on type errors — keep it that way) |
| `npm run lint` | ESLint, including React Compiler rules |
| `npm run type-check` | `tsc --noEmit` |
| `npm run format` | Prettier write |

## Architecture rules

These are load-bearing. Breaking them has caused real outages.

1. **Routing lives in exactly one file: `src/proxy.ts`.** Next 16 renamed the
   `middleware` convention to `proxy`, and the file must sit beside `app/` —
   which here means `src/`, not the repo root. A `proxy.ts` at the repo root is
   silently ignored. Never add a `middleware.ts` back.
2. **PII isolation.** `email`, `phone`, `age` and `gender` live only in
   `profile_private` (owner-only RLS). Never add PII columns to the publicly
   readable `profiles` table.
3. **Verified ≠ Premium.** Identity-verification badges and any paid/Pro badge
   are separate systems. Never conflate them in UI or logic.
4. **Notifications are DB-trigger-driven only.** Never insert a notification
   from the client. `notifications` deliberately has no INSERT policy, so RLS
   enforces this.
5. **Moderation roles** (`moderator`, `senior_moderator`, `super_admin`) and
   their UI + Postgres enforcement are off-limits.
6. **The Business tab is built but intentionally disabled for v1.** Don't
   re-enable it.
7. **The live database is the source of truth, not `supabase/migrations/`.**
   Those files have drifted from the live schema — live `followers` has a
   `request_status` column the files never mention, and live `notifications` has
   six columns they don't. Introspect the live schema before writing DDL, and
   make every migration idempotent (`IF NOT EXISTS`, `pg_policies` guards).

## Edge Functions

Deployed under `supabase/functions/`. Both require a valid user JWT.

### `review-proof`

Proof verification. The order is deliberate and must not change:

1. **SHA-256 dedupe** of the media against all prior submissions — decided
   locally, never sent to the model. Catches the same image reused by the same
   person *or shared between people*.
2. **Gemini** judges whether the image is plausible evidence, returning a
   schema-enforced structured verdict.
3. Confidence ≥ 0.6 auto-approves or auto-rejects. Below that the submission
   stays `pending` and lands in the human review queue.

Reading the queue state, with no extra columns:

| `ai_reviewed` | `ai_classification` | Meaning |
|---|---|---|
| `true` | `uncertain` | Awaiting human review |
| `true` | `match` / `mismatch` | Decided |
| `false` | `null` | Not yet processed — safe to retry |

`ai_classification` is constrained to `match | mismatch | uncertain`. Duplicates
record `mismatch`; the specific reason lives in `ai_reasoning` and in
`moderation_events.event_type`.

Capped at 30 AI reviews per user per rolling 24h (`DAILY_AI_REVIEW_CAP`). Over
the cap, submissions queue for human review rather than being rejected.

### `delete-account`

Permanent account deletion, required by Google Play policy and by the shipped
privacy policy. Deletes storage objects, detaches the six `ON DELETE NO ACTION`
foreign keys that would otherwise abort the delete, then deletes the auth user —
which cascades `profiles` and everything beneath it.

### Required secrets

Set in **Supabase → Edge Functions → Secrets**, never in `.env.local`:

| Secret | Used by |
|---|---|
| `GEMINI_API_KEY` | `review-proof` |
| `DAILY_AI_REVIEW_CAP` | `review-proof` (optional, defaults to 30) |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
by the platform automatically.

## Deploying

1. Push to `main`; import the repo in Vercel.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `NEXT_PUBLIC_SITE_URL` in Vercel's environment variables.
3. In **Supabase → Authentication → URL Configuration**, set **Site URL** to the
   production domain and add these **Redirect URLs** (see
   `SUPABASE_REDIRECT_SETUP.md`):
   ```
   https://<production-domain>/auth/callback
   http://localhost:3000/auth/callback
   ```
   Google OAuth drops the callback path and lands on `/?code=…` if the exact URL
   is not allow-listed. `src/proxy.ts` catches that case as a safety net, but the
   allow-list is the real fix.
4. Confirm `npm run build` passes locally first — the build intentionally fails
   on type errors.

## Project layout

```
src/
  proxy.ts              Routing, session refresh, auth + deactivation gates
  app/
    (auth)/             Gateway, login, signup
    (app)/              Authenticated shell — feed, explore, challenges,
                        profile, alerts, settings
    auth/callback/      OAuth code exchange
    layout.tsx          Root metadata + viewport
    global-error.tsx    Root-layout failure boundary
  components/
    ui/                 Design-system primitives
    features/           Composed, domain-aware components
  lib/
    data/               Query modules — accept a SupabaseClient, server-safe
    supabase/           Client factories + profile read/write helpers
supabase/
  functions/            Edge Functions
  migrations/           Historical only — see architecture rule 7
```

Note the two data-layer conventions: `src/lib/data/*` **accepts** a
`SupabaseClient` so it works in server components, while
`src/lib/supabase/profile.ts` creates a browser client internally and is
client-only. Pick the right one for where the code runs.
