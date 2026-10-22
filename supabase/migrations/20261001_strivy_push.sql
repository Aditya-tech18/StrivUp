-- STRIVY Phase 4.1: Web Push subscriptions, preferences and a send log.
--
-- APPLIED to the live striv-mvp DB (tables + both functions confirmed
-- 2026-10-21). Kept for fresh environments. Original note: written and tested
-- locally; apply it deliberately when
-- the push engine is approved. Idempotent: safe to run more than once.
--
-- What it adds (nothing existing is altered):
--   strivy_push_subscriptions      one row per browser/device push endpoint
--   strivy_notification_preferences per-user daily nudges on/off, cap, spacing, language
--   strivy_push_log                 every push STRIVY claims/sends (dedupe + cap)
--   strivy_save_push_subscription() the signed-in user takes over an endpoint
--   strivy_claim_push()             atomic cap/spacing/dedupe check + insert,
--                                   service role only (the scheduler)
--
-- User isolation:
--   * Users can read/delete only their own subscriptions and log rows, and
--     read/write only their own preferences (RLS).
--   * Nobody but the service role can write the log, so a client can't fake
--     "already sent" rows or bypass the daily cap.
--   * Subscription keys are never readable by other users.

-- ── Subscriptions ──────────────────────────────────────────────────────────
create table if not exists public.strivy_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0,
  constraint strivy_push_endpoint_https check (endpoint like 'https://%'),
  constraint strivy_push_endpoint_len check (char_length(endpoint) <= 1000),
  constraint strivy_push_keys_len check (char_length(p256dh) <= 200 and char_length(auth) <= 100)
);

create unique index if not exists strivy_push_subscriptions_endpoint_key
  on public.strivy_push_subscriptions (endpoint);
create index if not exists strivy_push_subscriptions_user_idx
  on public.strivy_push_subscriptions (user_id);

alter table public.strivy_push_subscriptions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'strivy_push_subscriptions' and policyname = 'strivy_push_subscriptions_select_own') then
    create policy strivy_push_subscriptions_select_own on public.strivy_push_subscriptions
      for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'strivy_push_subscriptions' and policyname = 'strivy_push_subscriptions_delete_own') then
    create policy strivy_push_subscriptions_delete_own on public.strivy_push_subscriptions
      for delete to authenticated using (user_id = auth.uid());
  end if;
end $$;
-- No INSERT/UPDATE policy: subscriptions are saved through
-- strivy_save_push_subscription(), which always uses auth.uid().

-- ── Preferences ────────────────────────────────────────────────────────────
create table if not exists public.strivy_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default true,
  max_per_day integer not null default 3 check (max_per_day between 0 and 3),
  min_spacing_minutes integer not null default 180 check (min_spacing_minutes between 30 and 720),
  updated_at timestamptz not null default now()
);

-- Push language: `language` is the user's explicit choice (null = auto),
-- `chat_language` is what their STRIVY chat was last written in.
alter table public.strivy_notification_preferences
  add column if not exists language text
    check (language in ('en', 'hinglish', 'hi', 'bho'));
alter table public.strivy_notification_preferences
  add column if not exists chat_language text
    check (chat_language in ('en', 'hinglish', 'hi', 'bho'));

alter table public.strivy_notification_preferences enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'strivy_notification_preferences' and policyname = 'strivy_prefs_select_own') then
    create policy strivy_prefs_select_own on public.strivy_notification_preferences
      for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'strivy_notification_preferences' and policyname = 'strivy_prefs_insert_own') then
    create policy strivy_prefs_insert_own on public.strivy_notification_preferences
      for insert to authenticated with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'strivy_notification_preferences' and policyname = 'strivy_prefs_update_own') then
    create policy strivy_prefs_update_own on public.strivy_notification_preferences
      for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

-- ── Send log ───────────────────────────────────────────────────────────────
create table if not exists public.strivy_push_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dedupe_key text not null,
  push_type text not null,
  entity_id text,
  local_date date not null,
  time_window text not null check (time_window in ('morning', 'afternoon', 'evening')),
  tone text not null,
  title text not null check (char_length(title) <= 60),
  body text not null check (char_length(body) <= 200),
  url text not null check (url like '/%' and url not like '//%'),
  status text not null default 'claimed' check (status in ('claimed', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- One push per event, ever (the key carries a date for daily events).
create unique index if not exists strivy_push_log_user_key
  on public.strivy_push_log (user_id, dedupe_key);
-- Never the same words twice in one day.
create unique index if not exists strivy_push_log_user_day_body
  on public.strivy_push_log (user_id, local_date, md5(body));
create index if not exists strivy_push_log_user_day
  on public.strivy_push_log (user_id, local_date);

alter table public.strivy_push_log enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'strivy_push_log' and policyname = 'strivy_push_log_select_own') then
    create policy strivy_push_log_select_own on public.strivy_push_log
      for select to authenticated using (user_id = auth.uid());
  end if;
end $$;

-- ── Save a subscription for the signed-in user ─────────────────────────────
-- A browser endpoint belongs to one browser profile. If another account used
-- this browser before, that account loses the endpoint, so it never gets the
-- new account's pushes (and vice versa).
create or replace function public.strivy_save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from public.strivy_push_subscriptions where endpoint = p_endpoint;
  insert into public.strivy_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_user, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.strivy_save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.strivy_save_push_subscription(text, text, text, text) to authenticated;

-- ── Claim a push (scheduler only) ──────────────────────────────────────────
-- Serialised per user and day with an advisory lock, so two scheduler runs at
-- once can't both pass the cap. Returns the new log id, or null with a reason.
create or replace function public.strivy_claim_push(
  p_user uuid, p_dedupe_key text, p_push_type text, p_entity_id text, p_local_date date,
  p_window text, p_tone text, p_title text, p_body text, p_url text,
  p_max_per_day integer, p_min_spacing_minutes integer
) returns table (id uuid, reason text)
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
  v_last timestamptz;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('strivy_push:' || p_user::text || ':' || p_local_date::text));

  if exists (select 1 from public.strivy_push_log l
             where l.user_id = p_user and l.dedupe_key = p_dedupe_key) then
    return query select null::uuid, 'duplicate event'; return;
  end if;
  if exists (select 1 from public.strivy_push_log l
             where l.user_id = p_user and l.local_date = p_local_date and md5(l.body) = md5(p_body)) then
    return query select null::uuid, 'same message today'; return;
  end if;

  select count(*), max(l.created_at) into v_count, v_last
    from public.strivy_push_log l
   where l.user_id = p_user and l.local_date = p_local_date and l.status <> 'failed';

  if v_count >= least(coalesce(p_max_per_day, 3), 3) then
    return query select null::uuid, 'daily limit'; return;
  end if;
  if exists (select 1 from public.strivy_push_log l
             where l.user_id = p_user and l.local_date = p_local_date
               and l.time_window = p_window and l.status <> 'failed') then
    return query select null::uuid, 'window already used'; return;
  end if;
  if v_last is not null and v_last > now() - make_interval(mins => greatest(coalesce(p_min_spacing_minutes, 180), 30)) then
    return query select null::uuid, 'too soon'; return;
  end if;

  insert into public.strivy_push_log
    (user_id, dedupe_key, push_type, entity_id, local_date, time_window, tone, title, body, url)
  values
    (p_user, p_dedupe_key, p_push_type, p_entity_id, p_local_date, p_window, p_tone, p_title, p_body, p_url)
  returning strivy_push_log.id into v_id;

  return query select v_id, null::text;
end $$;

revoke all on function public.strivy_claim_push(uuid, text, text, text, date, text, text, text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.strivy_claim_push(uuid, text, text, text, date, text, text, text, text, text, integer, integer)
  to service_role;
