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

## STRIVY

STRIVY is StrivUp's built-in accountability companion: a floating button on the
main app pages that opens a chat (a bottom sheet on phones, a side panel on
desktop). It answers questions about the signed-in person's own challenges,
quests, streaks, proofs, weekly progress and rewards, and explains how StrivUp
works.

**It is off by default.** Set this server-only variable in Vercel (no
`NEXT_PUBLIC_` prefix) and redeploy to turn it on:

```
STRIVY_ENABLED=true
```

How it works:

- One endpoint, `POST /api/strivy/chat`. It checks the user with `getUser()`,
  rejects deactivated accounts, and queries Supabase as that user, so RLS
  applies. The chat uses no service-role key and writes nothing to the database.
- Answers are built from the database, not generated. `src/lib/strivy/`
  detects the intent with keyword rules (`intents.ts`), loads only the data
  that intent needs, always filtered to the user's own id (`context.ts`,
  `src/lib/data/strivy.ts`), and fills a template in Strivy's voice
  (`replies.ts`). If something can't be loaded, Strivy says so instead of
  guessing.
- Product knowledge lives in `knowledge.ts`, with each feature tagged
  available, planned or not built. Update it when a feature ships.
- Challenges (the daily proof and streak loop) and quests (one-off,
  location-based activities) are kept separate in every answer.
- The pipeline (`pipeline.ts`) is: intent → context → grounded draft →
  optional model rewrite → grounding check (`grounding.ts`) → reply. The
  draft is always a complete answer on its own.
- Text model (optional, free): with `OPENROUTER_API_KEY` set, STRIVY uses
  OpenRouter's Free Models Router (`openrouter/free`, see `openrouter.ts`),
  called from the server only. It is free-only by construction: only
  `openrouter/free` or a `:free` model id is ever sent (any other
  `OPENROUTER_MODEL` is ignored), every request carries a $0 price cap, and a
  reply that reports a cost switches the model off. Small talk (greetings,
  "kya haal", jokes, "mood off") is written by the model from a compact
  prompt in the person's own language and script (English, Roman Hinglish,
  Hindi, Bhojpuri in either script); it reads and sends no personal data and
  may not claim any. Questions about the person's quests, streaks, pending
  tasks, proofs or rewards are answered from Supabase first: the model only
  rewords the grounded draft and its reply is thrown away if it adds any
  number, progress figure, name, date, status, reward, link or technical
  wording. If there is no key, or OpenRouter is rate-limited, down or slower
  than `STRIVY_LLM_TIMEOUT_MS` (default 30 s, max 60 s), STRIVY answers with
  the draft. Ollama is no longer used (`ollama.ts` is legacy, kept only for
  its tests). Gemini is voice transcription only.
  Setup:
  1. Create a free key at https://openrouter.ai/keys. Keep the account at
     zero credits (or set the key's credit limit to $0).
  2. In `.env.local`: `OPENROUTER_API_KEY=sk-or-...` and
     `OPENROUTER_MODEL=openrouter/free`.
  3. Restart `npm run dev`. `GET /api/strivy/llm` (signed in) says whether
     the model is usable and, in development, checks the key. With
     `STRIVY_DEBUG=true` the server console logs each reply's intent,
     language, provider, the free model that answered, latency and fallback
     reason. The chat UI never shows these details.
- Voice (optional, same pipeline): the mic in the input dictates one message,
  and "Talk to Strivy" runs a hands-free loop (listen, answer, read the reply
  aloud, listen again). What is heard is sent to `/api/strivy/chat` exactly
  like typed text, so grounding and fallbacks are identical. Language is
  automatic ("Auto", the default; EN / हिं are optional overrides): with
  `GEMINI_API_KEY` set, audio is recorded and `POST
  /api/strivy/voice/transcribe` has Gemini detect the language itself
  (English, Hindi, Hinglish, Bhojpuri and other Indian languages, mixed
  speech included). Without a key, the browser's Web Speech API (no key) is
  used, listening in en-IN or hi-IN depending on the language the person has
  been using. Gemini is used for voice transcription only, never for chat; the
  key never reaches the browser and is never logged. Replies are read aloud
  with the browser's `speechSynthesis`, kept to two short sentences. Mic
  denied, no mic or an unsupported browser each show a message and typing
  keeps working. Settings: `GEMINI_API_KEY`, `STRIVY_VOICE_PROVIDER`
  (`auto`, `browser`, `gemini`), `GEMINI_VOICE_MODEL`.
- The conversation is kept in the browser tab (sessionStorage, tied to the
  signed-in account and cleared on sign-out), never in the database.
- Tests: `npm run test:strivy` (Node's built-in test runner, no extra
  packages).
- Check-ins (Phase 3): once per tab per day the launcher calls
  `POST /api/strivy/checkin`, which detects accountability moments from the
  user's own data (`events.ts`: streak milestone, streak at risk, quest
  ending soon, proof verdicts, rewards, inactivity), turns them into grounded
  messages (`accountability.ts`) and shows new ones in the panel (a dot on the
  button). Writing them to Alerts needs the migration
  `supabase/migrations/20260929_strivy_notifications.sql` **(not applied)** and
  `STRIVY_NOTIFICATIONS_ENABLED=true`; until then nothing is written. Nothing
  runs in the background for check-ins; they only happen when the app is open.
- Push notifications (Phase 4): real Web Push, up to 3 a day per user, only
  when there's something real to say. A scheduler (`src/lib/strivy/push/`)
  picks the most important moment per window (09–11, 14–17, 19–22 India
  time), writes a short message in the user's language, checks it against
  their data, claims it atomically (no duplicates, daily cap, spacing) and
  sends it through the app's service worker (`public/sw.js` imports the push
  handlers from `public/strivy-sw.js`). Users switch push on per device,
  and daily nudges and their language in the panel's bell menu. It needs the
  migration `supabase/migrations/20261001_strivy_push.sql` (already applied to the live DB),
  the variables in `.env.example` (VAPID keys, `CRON_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY` server-only, `STRIVY_PUSH_ENABLED=true`).
  `vercel.json` runs `/api/strivy/push/cron` three times a day, once inside
  each window (04:00, 09:00 and 14:00 UTC = 09:30, 14:30 and 19:30 IST);
  Vercel Cron sends `Authorization: Bearer $CRON_SECRET` itself. The
  service-role key is used only by that scheduler, on the server; the chat
  never uses it.
- Polish and resilience (Phase 5): follow-ups like "kitne task bache?",
  "kab se?" and "kitna?", stricter checks on any future model rewrite
  (length, language), a per-user chat limit (20 a minute, in memory), friendly
  500s instead of internal errors on every STRIVY route, safe rendering of
  replies and links, launcher and panel motion (off under reduced motion),
  a one-time "keep you accountable?" push card, weekly message rotation and a
  dev-only "preview next nudge" (`STRIVY_PUSH_DEV_TOOLS=true` and
  `NEXT_PUBLIC_STRIVY_PUSH_DEV_TOOLS=true`, never in production).
  No new migration.

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
