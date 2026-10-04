# Physical Activity / Pedometer System

How step-verified quest tasks work in StrivUp, and — importantly — what a web
app can and cannot do about background tracking.

## The honest constraint

**A browser cannot count steps in the background.** This is a platform limit,
not an implementation gap:

- `DeviceMotionEvent` fires only while the page is foreground and visible. Lock
  the screen or switch apps and the page is frozen; iOS Safari suspends JS.
- Service workers cannot access motion sensors and are killed after seconds of
  idle. Periodic Background Sync is Chromium-only, installed-PWA-only, and
  wakes at best every few hours.
- **There is no web API for HealthKit or Health Connect.** Both are native-only.

A foreground-only JS pedometer would also be defeated by shaking the phone.

## What actually happens instead

Real fitness apps don't count in the background either — the **OS motion
coprocessor** does, continuously, with no app running. The app reads the
accumulated total later. StrivUp does the same.

**The primary source is the in-app pedometer.** The user opens StrivUp, taps
Start, puts the phone in a pocket and walks:

```
accelerometer -> step detection in src/lib/activity/pedometer.ts
   -> POST /api/activity/native/sync every 20s and on stop
   -> server clamps, keeps the day monotonic, runs fraud heuristics
   -> ingest_activity_records() normalises + dedupes + recalculates
   -> quest progress advances, task completes, reward becomes eligible
```

No third-party account, no OAuth, no app store. **But it only counts while the
app is open and the screen is on** — that limit is real and the UI says so
plainly rather than hiding it.

OAuth providers remain as an **optional secondary** source for people who
already use one, pulled server-side by `GET /api/activity/cron` every two hours.
Note that Fitbit closed new app registrations and its legacy Web API is
decommissioned in September 2026, so the `fitbit` provider only works for apps
registered before that; new integrations go through the Google Health API, whose
scopes are Restricted and need a Google privacy/security review.

## Pull vs push

Two directions, deliberately kept separate:

| | OAuth providers | In-app pedometer |
|---|---|---|
| Direction | server **pulls** | device **pushes** |
| Entry point | `/api/activity/sync`, `/api/activity/cron` | `/api/activity/native/sync` |
| Client sees values? | never | yes — it sends them |
| Source / trust | `FITBIT` → `VERIFIED` | `DEVICE_SENSOR` → `SELF_REPORTED` |

`isPushOnlyProvider()` in `service.ts` keeps the cron loop from trying to
"fetch" from a phone.

## Why quests default to `self_reported`

`physical_activity_value()` only counts `VERIFIED` rows when a task is set to
`device_verified`. The in-app pedometer records `SELF_REPORTED`, because a
browser sensor can be shaken and calling that verified would be a lie. So a
`device_verified` task would never complete while the pedometer is the only
source — which is why the quest builder now defaults to `self_reported`.

Businesses who later connect a real health provider can switch the task back to
`device_verified` and the stricter gate applies immediately, with no code
change. Both paths are covered by `supabase/tests/physical_activity_test.sql`.

## Step detection

`src/lib/activity/pedometer.ts` reads `accelerationIncludingGravity`, tracks a
low-pass baseline (the resting value drifts with how the phone is held — it is
not always 9.81), arms when magnitude rises 1.2 m/s² above it, and counts one
step on the falling edge. Counting on the fall rather than the peak is what
stops one noisy peak registering several times. Steps faster than 250 ms apart
are ignored, matching the server's cadence check.

A screen wake lock is requested while tracking, since the counter dies with the
screen. Unsupported or refused is non-fatal.

## Architecture

| Layer | Location |
|---|---|
| Types | `src/lib/activity/types.ts` |
| Provider abstraction (server only) | `src/lib/activity/providers.ts` |
| Sync orchestration (server only) | `src/lib/activity/service.ts` |
| Service-role client | `src/lib/supabase/admin.ts` |
| Data helpers (RLS-bound) | `src/lib/data/activity.ts` |
| Components | `src/components/features/activity/` |
| Routes | `src/app/api/activity/*` |
| Engine (SQL) | `supabase/migrations/20260928_physical_activity_functions.sql` |
| Tests | `supabase/tests/physical_activity_test.sql` |

## Data model

- **`activity_records`** — source of truth. Never mutated by quest logic.
- **`quest_activity_progress`** — a *projection* over it, per task per period.
- **`quest_task_activity_config`** — the target, attached to a `quest_tasks`
  row whose `proof_type` is `physical_activity`.
- **`activity_connections`** + **`activity_connection_secrets`** — provider
  link and its tokens, split so tokens can be locked away.
- **`activity_sync_logs`**, **`activity_verification_events`** — audit.

### Why two quests can both use the same 10,500 steps

Progress is recomputed as a `SUM` over `activity_records`, never debited from
it. A 5,000-step quest and a 10,000-step quest are two independent projections
of one immutable fact, so both legitimately complete:

```
Device activity   10,500 steps
  Quest A          5,000 / 5,000   COMPLETED
  Quest B         10,000 / 10,000  COMPLETED
```

## Security

- The browser **cannot** assert a step count. `EXECUTE` on
  `ingest_activity_records`, `recalc_physical_task_progress`,
  `recalc_user_physical_progress`, `physical_activity_value` and
  `evaluate_quest_completion` is revoked from `authenticated`. `/api/activity/sync`
  accepts *no* step values — only a request to go and read from the provider.
- OAuth tokens live in `activity_connection_secrets`, which has RLS enabled and
  **deliberately no policies**, plus grants revoked from `anon`/`authenticated`.
  Only the service role can read it. **Do not add a policy to that table.**
- A `MANUAL` source can never be `VERIFIED` — enforced by a table CHECK, not
  just by application code.
- A `device_verified` task counts only `VERIFIED` rows; a flagged row
  (`activity_status <> 'VALID'`) stops counting immediately.
- Businesses can read `quest_activity_progress` for **their own quests only**,
  and have no policy at all on `activity_records`. A restaurant sees
  "4,821 / 5,000", never a health history.

## Timezone

Everything daily is computed in an explicit timezone, defaulting to
`Asia/Kolkata`, matching the existing `quest_order_verifications.issued_on`
default. Nothing relies on server UTC date.

## Fraud handling

`classify_activity_record()` flags:

- `implausible_daily_volume` — more than 100,000 steps in a day
- `impossible_cadence` — sustained above 4 steps/second over a session
- `impossible_velocity` — implied speed above 45 km/h

A flagged record is **suspended, not punished**: it stops counting and appears
at `/admin/activity` for a human. Nobody is banned off one odd reading. An
admin approve/reject triggers a recalculation, so a wrongly-flagged walk
retroactively completes the task it should have.

## Running the tests

```bash
psql "$DATABASE_URL" -f supabase/tests/physical_activity_test.sql
```

The suite is one transaction that ends by raising
`ALL_TESTS_PASSED_ROLLBACK` — **that error is the pass signal**, and it rolls
back every row the suite created, so it is safe against a real database.
Anything beginning `FAILURES:` is a genuine failure.

## Setup checklist

1. Fill `SUPABASE_SERVICE_ROLE_KEY`, provider credentials and `CRON_SECRET`
   (see `.env.example`).
2. Register `https://<domain>/api/activity/callback/<provider>` with each
   provider.
3. Deploy — `vercel.json` already schedules the 2-hourly sync.
4. Create a quest with a task whose proof type is **Physical Activity**, set a
   target, publish.
5. As a participant, connect a provider at `/settings/activity`.
