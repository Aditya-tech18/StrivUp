/*
 * 20260928_physical_activity.sql — Physical Activity / Pedometer system
 *
 * Additive only. The only changes to existing tables are two widened CHECK
 * constraints; widening is safe for every existing row.
 *
 * Design notes that are load-bearing:
 *
 *  1. activity_records is the SOURCE OF TRUTH and is never mutated by quest
 *     logic. quest_activity_progress is a PROJECTION over it. That is what
 *     makes it correct for two quests to both "consume" the same 10,500 steps
 *     without either subtracting from the other (spec section 9).
 *
 *  2. Idempotency (spec section 28) is enforced by the unique index on
 *     (user_id, provider, dedupe_key). Re-syncing the same day updates the
 *     row in place instead of inserting a duplicate.
 *
 *  3. OAuth tokens live in activity_connection_secrets, which has RLS enabled
 *     and DELIBERATELY NO POLICIES. Postgres denies all access under RLS when
 *     no policy matches, so only the service role can ever read tokens.
 *     Do not add a policy to that table.
 *
 *  4. Trusted writes go through SECURITY DEFINER functions, matching the
 *     existing issue_quest_order_code / complete_task_with_bill_code pattern.
 *     The browser can never assert a step count directly (spec section 42).
 *
 *  5. Timezone is explicit everywhere and defaults to Asia/Kolkata (spec
 *     section 33), matching quest_order_verifications.issued_on.
 */

/* -- 1. Widen existing CHECK constraints ---------------------------------- */

ALTER TABLE public.quest_tasks DROP CONSTRAINT IF EXISTS quest_tasks_proof_type_check;
ALTER TABLE public.quest_tasks ADD CONSTRAINT quest_tasks_proof_type_check
  CHECK (proof_type = ANY (ARRAY[
    'photo','video','screenshot','photo_text','qr','bill_document',
    'location','manual','none','order_verification','physical_activity'
  ]));

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'new_follower','proof_approved','proof_rejected','challenge_joined',
    'proof_removed','business_verification_approved','business_verification_rejected',
    'business_bill_code_generated','quest_joined','quest_task_approved',
    'quest_task_rejected','quest_completed','quest_reward_earned',
    'quest_reward_fulfilled','follow_request','follow_accepted','challenge_completed',
    'activity_synced','activity_goal_near','activity_task_completed','activity_flagged'
  ]));

/* -- 2. Provider connections ---------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.activity_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider          text NOT NULL,
  external_user_id  text,
  status            text NOT NULL DEFAULT 'connected',
  scopes            text[] NOT NULL DEFAULT '{}',
  timezone          text NOT NULL DEFAULT 'Asia/Kolkata',
  last_synced_at    timestamptz,
  last_sync_status  text,
  last_sync_error   text,
  connected_at      timestamptz NOT NULL DEFAULT now(),
  disconnected_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_connections_provider_check CHECK (provider = ANY (ARRAY[
    'fitbit','strava','google_fit','health_connect','healthkit','device_sensor','manual'
  ])),
  CONSTRAINT activity_connections_status_check CHECK (status = ANY (ARRAY[
    'connected','disconnected','expired','error'
  ]))
);

CREATE UNIQUE INDEX IF NOT EXISTS activity_connections_user_provider_uidx
  ON public.activity_connections (user_id, provider);

/* Tokens are isolated. RLS on, no policies -> service role only. */
CREATE TABLE IF NOT EXISTS public.activity_connection_secrets (
  connection_id     uuid PRIMARY KEY REFERENCES public.activity_connections(id) ON DELETE CASCADE,
  access_token      text,
  refresh_token     text,
  token_expires_at  timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

/* -- 3. Normalized activity records (source of truth) --------------------- */

CREATE TABLE IF NOT EXISTS public.activity_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  connection_id       uuid REFERENCES public.activity_connections(id) ON DELETE SET NULL,
  provider            text NOT NULL,
  source              text NOT NULL,
  activity_type       text NOT NULL DEFAULT 'steps',
  granularity         text NOT NULL DEFAULT 'daily',
  dedupe_key          text NOT NULL,
  external_id         text,
  local_date          date NOT NULL,
  timezone            text NOT NULL DEFAULT 'Asia/Kolkata',
  started_at          timestamptz NOT NULL,
  ended_at            timestamptz NOT NULL,
  steps               integer NOT NULL DEFAULT 0,
  distance_m          numeric(12,2) NOT NULL DEFAULT 0,
  duration_s          integer NOT NULL DEFAULT 0,
  calories            numeric(10,2) NOT NULL DEFAULT 0,
  verification_status text NOT NULL DEFAULT 'UNVERIFIED',
  activity_status     text NOT NULL DEFAULT 'VALID',
  flagged_reason      text,
  raw                 jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_records_source_check CHECK (source = ANY (ARRAY[
    'FITBIT','STRAVA','GOOGLE_FIT','HEALTH_CONNECT','HEALTHKIT','DEVICE_SENSOR','STRIVUP_NATIVE','MANUAL'
  ])),
  CONSTRAINT activity_records_activity_type_check CHECK (activity_type = ANY (ARRAY[
    'steps','walking','running','jogging','cycling','distance','duration','workout'
  ])),
  CONSTRAINT activity_records_granularity_check CHECK (granularity = ANY (ARRAY['daily','session'])),
  /* A MANUAL source may never claim device verification (spec sections 10, 11). */
  CONSTRAINT activity_records_verification_check CHECK (
    verification_status = ANY (ARRAY['VERIFIED','SELF_REPORTED','UNVERIFIED'])
    AND NOT (source = 'MANUAL' AND verification_status = 'VERIFIED')
  ),
  CONSTRAINT activity_records_status_check CHECK (activity_status = ANY (ARRAY[
    'VALID','SUSPICIOUS','REJECTED','UNDER_REVIEW'
  ])),
  CONSTRAINT activity_records_nonneg_check CHECK (
    steps >= 0 AND distance_m >= 0 AND duration_s >= 0 AND calories >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS activity_records_dedupe_uidx
  ON public.activity_records (user_id, provider, dedupe_key);
CREATE INDEX IF NOT EXISTS activity_records_user_date_idx
  ON public.activity_records (user_id, local_date DESC);
CREATE INDEX IF NOT EXISTS activity_records_user_type_date_idx
  ON public.activity_records (user_id, activity_type, local_date);
CREATE INDEX IF NOT EXISTS activity_records_flagged_idx
  ON public.activity_records (activity_status) WHERE activity_status <> 'VALID';

/* -- 4. Per-task physical configuration ----------------------------------- */

CREATE TABLE IF NOT EXISTS public.quest_task_activity_config (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id            uuid NOT NULL UNIQUE REFERENCES public.quest_tasks(id) ON DELETE CASCADE,
  quest_id           uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  activity_type      text NOT NULL DEFAULT 'steps',
  target_value       numeric(12,2) NOT NULL,
  unit               text NOT NULL DEFAULT 'steps',
  tracking_mode      text NOT NULL DEFAULT 'device_verified',
  frequency          text NOT NULL DEFAULT 'daily',
  specific_date      date,
  timezone           text NOT NULL DEFAULT 'Asia/Kolkata',
  allow_manual_proof boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qtac_activity_type_check CHECK (activity_type = ANY (ARRAY[
    'steps','walking','running','jogging','cycling','distance','duration','workout'
  ])),
  CONSTRAINT qtac_tracking_mode_check CHECK (tracking_mode = ANY (ARRAY[
    'device_verified','self_reported'
  ])),
  CONSTRAINT qtac_frequency_check CHECK (frequency = ANY (ARRAY[
    'daily','total','specific_date'
  ])),
  CONSTRAINT qtac_target_positive_check CHECK (target_value > 0),
  CONSTRAINT qtac_specific_date_required CHECK (
    frequency <> 'specific_date' OR specific_date IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS qtac_quest_idx ON public.quest_task_activity_config (quest_id);

/* -- 5. Progress projection ----------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.quest_activity_progress (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id           uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  task_id            uuid NOT NULL REFERENCES public.quest_tasks(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_date        date NOT NULL,
  current_value      numeric(12,2) NOT NULL DEFAULT 0,
  target_value       numeric(12,2) NOT NULL,
  percentage         numeric(5,2) NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'NOT_STARTED',
  completed_at       timestamptz,
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qap_status_check CHECK (status = ANY (ARRAY[
    'NOT_STARTED','IN_PROGRESS','COMPLETED'
  ]))
);

/* period_date is NOT NULL: the 'total' frequency uses the quest start date as
   its single bucket, which keeps the unique index simple and NULL-free. */
CREATE UNIQUE INDEX IF NOT EXISTS qap_task_user_period_uidx
  ON public.quest_activity_progress (task_id, user_id, period_date);
CREATE INDEX IF NOT EXISTS qap_quest_user_idx
  ON public.quest_activity_progress (quest_id, user_id);
CREATE INDEX IF NOT EXISTS qap_user_status_idx
  ON public.quest_activity_progress (user_id, status);

/* -- 6. Sync logs + audit events ------------------------------------------ */

CREATE TABLE IF NOT EXISTS public.activity_sync_logs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  connection_id         uuid REFERENCES public.activity_connections(id) ON DELETE SET NULL,
  provider              text NOT NULL,
  status                text NOT NULL DEFAULT 'success',
  records_fetched       integer NOT NULL DEFAULT 0,
  records_inserted      integer NOT NULL DEFAULT 0,
  records_updated       integer NOT NULL DEFAULT 0,
  records_flagged       integer NOT NULL DEFAULT 0,
  progress_rows_touched integer NOT NULL DEFAULT 0,
  tasks_completed       integer NOT NULL DEFAULT 0,
  error_message         text,
  started_at            timestamptz NOT NULL DEFAULT now(),
  finished_at           timestamptz,
  CONSTRAINT activity_sync_logs_status_check CHECK (status = ANY (ARRAY[
    'success','partial','failed'
  ]))
);

CREATE INDEX IF NOT EXISTS activity_sync_logs_user_idx
  ON public.activity_sync_logs (user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.activity_verification_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  quest_id           uuid REFERENCES public.quests(id) ON DELETE CASCADE,
  task_id            uuid REFERENCES public.quest_tasks(id) ON DELETE CASCADE,
  activity_record_id uuid REFERENCES public.activity_records(id) ON DELETE SET NULL,
  event_type         text NOT NULL,
  metadata           jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ave_event_type_check CHECK (event_type = ANY (ARRAY[
    'PROVIDER_CONNECTED','PROVIDER_DISCONNECTED','ACTIVITY_SYNCED','ACTIVITY_VERIFIED',
    'ACTIVITY_REJECTED','ACTIVITY_MARKED_SUSPICIOUS','QUEST_PROGRESS_UPDATED',
    'PHYSICAL_TASK_COMPLETED','REWARD_UNLOCKED','SYNC_FAILED','ADMIN_ACTIVITY_REVIEWED'
  ]))
);

CREATE INDEX IF NOT EXISTS ave_user_idx  ON public.activity_verification_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ave_quest_idx ON public.activity_verification_events (quest_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ave_type_idx  ON public.activity_verification_events (event_type, created_at DESC);
