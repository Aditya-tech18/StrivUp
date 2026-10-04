-- ============================================================================
-- Quest order verification (business quests)
--
-- Adds the two-code verification loop used by business Quests whose tasks are
-- fulfilled through an external ordering platform (Zomato / Swiggy / walk-in):
--
--   1. User taps "Upload Proof"  -> STRIVUP issues an ORDER code (SVxxxx)
--   2. User puts that code in the order instructions and places the order
--   3. Business searches the ORDER code in STRIVUP and verifies the order
--   4. STRIVUP issues a BILL code (SVxxxx) for the business to write on the bill
--   5. User enters the BILL code in STRIVUP -> task completes, progress updates
--
-- STRIVUP has no integration with Zomato or Swiggy. The codes travel through
-- the order description and the printed bill; nothing here talks to a delivery
-- platform API.
--
-- Everything below is idempotent — the live schema has drifted from this
-- folder, so re-running must be safe.
-- ============================================================================

-- ── quest_tasks: per-task imagery + the order_verification proof type ───────

alter table public.quest_tasks
  add column if not exists image_url text;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'quest_tasks_proof_type_check'
      and conrelid = 'public.quest_tasks'::regclass
  ) then
    alter table public.quest_tasks drop constraint quest_tasks_proof_type_check;
  end if;
end $$;

alter table public.quest_tasks
  add constraint quest_tasks_proof_type_check
  check (proof_type = any (array[
    'photo', 'video', 'screenshot', 'photo_text', 'qr',
    'bill_document', 'location', 'manual', 'none',
    'order_verification'
  ]));

-- ── business_profiles: second phone + Google Business Profile fields ────────
-- These stay null until somebody verifies them for this exact outlet. The UI
-- renders "Google rating unavailable" rather than inventing a number, so a
-- null here is a correct, displayable state — never a placeholder to fill in.

alter table public.business_profiles
  add column if not exists business_phone_alt      text,
  add column if not exists google_place_id         text,
  add column if not exists google_maps_url         text,
  add column if not exists google_rating           numeric(2,1),
  add column if not exists google_review_count     integer,
  add column if not exists google_verified_at      timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'business_profiles_google_rating_check'
      and conrelid = 'public.business_profiles'::regclass
  ) then
    alter table public.business_profiles
      add constraint business_profiles_google_rating_check
      check (google_rating is null or (google_rating >= 0 and google_rating <= 5));
  end if;
end $$;

-- ── quest_order_verifications ──────────────────────────────────────────────

create table if not exists public.quest_order_verifications (
  id                  uuid primary key default gen_random_uuid(),
  quest_id            uuid not null references public.quests(id)        on delete cascade,
  task_id             uuid not null references public.quest_tasks(id)   on delete cascade,
  user_id             uuid not null references auth.users(id)           on delete cascade,
  business_id         uuid          references public.business_profiles(id) on delete set null,

  order_code          text not null,
  bill_code           text,
  platform            text,

  status              text not null default 'code_issued',

  -- IST calendar day the order code was issued on; the one-code-per-day rule
  -- is enforced against this, not against created_at.
  issued_on           date not null default ((now() at time zone 'Asia/Kolkata')::date),
  expires_at          timestamptz not null default (now() + interval '24 hours'),

  order_verified_at   timestamptz,
  order_verified_by   uuid references auth.users(id) on delete set null,
  bill_code_issued_at timestamptz,
  completed_at        timestamptz,

  bill_code_attempts  integer not null default 0,
  notes               text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quest_order_verifications_status_check'
      and conrelid = 'public.quest_order_verifications'::regclass
  ) then
    alter table public.quest_order_verifications
      add constraint quest_order_verifications_status_check
      check (status = any (array[
        'code_issued', 'order_verified', 'completed', 'expired', 'cancelled'
      ]));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'quest_order_verifications_platform_check'
      and conrelid = 'public.quest_order_verifications'::regclass
  ) then
    alter table public.quest_order_verifications
      add constraint quest_order_verifications_platform_check
      check (platform is null or platform = any (array['zomato', 'swiggy', 'other']));
  end if;
end $$;

-- One active order code per user, per task, per IST day.
create unique index if not exists qov_one_active_per_day
  on public.quest_order_verifications (user_id, quest_id, task_id, issued_on)
  where status in ('code_issued', 'order_verified');

-- An order code must be unambiguous while it is live, so the business can
-- search on it alone.
create unique index if not exists qov_active_order_code
  on public.quest_order_verifications (order_code)
  where status in ('code_issued', 'order_verified');

create index if not exists qov_quest_status
  on public.quest_order_verifications (quest_id, status, created_at desc);

create index if not exists qov_user
  on public.quest_order_verifications (user_id, quest_id, task_id);

create index if not exists qov_business_status
  on public.quest_order_verifications (business_id, status, created_at desc);

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table public.quest_order_verifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quest_order_verifications'
      and policyname = 'qov_owner_read'
  ) then
    create policy qov_owner_read on public.quest_order_verifications
      for select using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'quest_order_verifications'
      and policyname = 'qov_business_read'
  ) then
    create policy qov_business_read on public.quest_order_verifications
      for select using (
        exists (
          select 1 from public.quests q
          where q.id = quest_order_verifications.quest_id
            and q.creator_id = auth.uid()
        )
      );
  end if;
end $$;

-- Writes go exclusively through the SECURITY DEFINER functions below: code
-- generation, the daily limit and the bill-code check are only trustworthy if
-- clients cannot insert or update rows directly. No INSERT/UPDATE/DELETE
-- policy is defined, so PostgREST rejects direct writes.

-- ── Helpers ────────────────────────────────────────────────────────────────

-- SVxxxx, digits only — short enough to hand-write on a bill and to retype
-- into an order description without ambiguity.
create or replace function public.strivup_generate_code()
returns text
language sql
volatile
as $$
  select 'SV' || lpad((floor(random() * 10000))::int::text, 4, '0');
$$;

create or replace function public.quest_order_verifications_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists quest_order_verifications_touch on public.quest_order_verifications;
create trigger quest_order_verifications_touch
  before update on public.quest_order_verifications
  for each row execute function public.quest_order_verifications_touch();

-- ── 1. User: issue (or re-read) today's order code ─────────────────────────

create or replace function public.issue_quest_order_code(
  p_quest_id uuid,
  p_task_id  uuid,
  p_platform text default null
)
returns public.quest_order_verifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user       uuid := auth.uid();
  v_quest      public.quests%rowtype;
  v_task       public.quest_tasks%rowtype;
  v_existing   public.quest_order_verifications%rowtype;
  v_row        public.quest_order_verifications%rowtype;
  v_code       text;
  v_today      date := (now() at time zone 'Asia/Kolkata')::date;
  v_tries      int := 0;
begin
  if v_user is null then
    raise exception 'Sign in to start verification' using errcode = '28000';
  end if;

  select * into v_quest from public.quests where id = p_quest_id;
  if not found then
    raise exception 'Quest not found' using errcode = 'P0002';
  end if;

  if v_quest.quest_status not in ('active', 'published') then
    raise exception 'This Quest is not accepting verifications right now'
      using errcode = 'P0001';
  end if;

  select * into v_task
    from public.quest_tasks
   where id = p_task_id and quest_id = p_quest_id;
  if not found then
    raise exception 'Task not found on this Quest' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.quest_participants
     where quest_id = p_quest_id and user_id = v_user
  ) then
    raise exception 'Join the Quest before starting a task' using errcode = 'P0001';
  end if;

  -- Already completed? Nothing to issue.
  if exists (
    select 1 from public.quest_task_submissions
     where quest_id = p_quest_id
       and task_id  = p_task_id
       and user_id  = v_user
       and verification_status = 'approved'
  ) then
    raise exception 'This task is already complete' using errcode = 'P0001';
  end if;

  -- Expire anything stale for this user/task before applying the daily rule,
  -- so an abandoned code from a previous day never blocks a fresh attempt.
  update public.quest_order_verifications
     set status = 'expired'
   where user_id = v_user
     and quest_id = p_quest_id
     and task_id = p_task_id
     and status in ('code_issued', 'order_verified')
     and expires_at < now();

  -- One active code per day: hand back the live one instead of minting another.
  select * into v_existing
    from public.quest_order_verifications
   where user_id = v_user
     and quest_id = p_quest_id
     and task_id = p_task_id
     and issued_on = v_today
     and status in ('code_issued', 'order_verified')
   limit 1;

  if found then
    if p_platform is not null and v_existing.platform is distinct from p_platform then
      update public.quest_order_verifications
         set platform = p_platform
       where id = v_existing.id
      returning * into v_existing;
    end if;
    return v_existing;
  end if;

  -- Retry on the partial-unique collision rather than trusting one draw.
  loop
    v_tries := v_tries + 1;
    v_code := public.strivup_generate_code();
    begin
      insert into public.quest_order_verifications (
        quest_id, task_id, user_id, business_id, order_code, platform, issued_on
      ) values (
        p_quest_id, p_task_id, v_user, v_quest.business_id, v_code, p_platform, v_today
      )
      returning * into v_row;
      return v_row;
    exception
      when unique_violation then
        if v_tries >= 12 then
          raise exception 'Could not allocate a verification code, try again'
            using errcode = 'P0001';
        end if;
    end;
  end loop;
end $$;

-- ── 2. Business: look up an order code (read-only) ─────────────────────────

create or replace function public.business_lookup_order_code(p_code text)
returns table (
  id                uuid,
  quest_id          uuid,
  quest_title       text,
  task_id           uuid,
  task_title        text,
  user_id           uuid,
  participant_name  text,
  order_code        text,
  bill_code         text,
  platform          text,
  status            text,
  issued_on         date,
  expires_at        timestamptz,
  created_at        timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    v.id, v.quest_id, q.title, v.task_id, t.title,
    v.user_id, p.full_name,
    v.order_code, v.bill_code, v.platform, v.status,
    v.issued_on, v.expires_at, v.created_at
  from public.quest_order_verifications v
  join public.quests q       on q.id = v.quest_id
  join public.quest_tasks t  on t.id = v.task_id
  left join public.profiles p on p.id = v.user_id
  where upper(v.order_code) = upper(btrim(p_code))
    and q.creator_id = auth.uid()
  order by v.created_at desc
  limit 5;
$$;

-- ── 3. Business: verify the order, minting the bill code ───────────────────

create or replace function public.business_verify_order_code(
  p_code     text,
  p_platform text default null
)
returns public.quest_order_verifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_row   public.quest_order_verifications%rowtype;
  v_code  text;
  v_tries int := 0;
begin
  if v_user is null then
    raise exception 'Sign in to verify orders' using errcode = '28000';
  end if;

  select v.* into v_row
    from public.quest_order_verifications v
    join public.quests q on q.id = v.quest_id
   where upper(v.order_code) = upper(btrim(p_code))
     and q.creator_id = v_user
     and v.status in ('code_issued', 'order_verified')
   order by v.created_at desc
   limit 1;

  if not found then
    raise exception 'No open verification found for that code' using errcode = 'P0002';
  end if;

  -- Already verified — hand back the same bill code so a second lookup during
  -- the same shift does not invalidate the code already written on a bill.
  if v_row.status = 'order_verified' then
    return v_row;
  end if;

  if v_row.expires_at < now() then
    update public.quest_order_verifications
       set status = 'expired'
     where id = v_row.id;
    raise exception 'That verification code has expired' using errcode = 'P0001';
  end if;

  loop
    v_tries := v_tries + 1;
    v_code := public.strivup_generate_code();
    begin
      update public.quest_order_verifications
         set status              = 'order_verified',
             bill_code           = v_code,
             bill_code_issued_at = now(),
             order_verified_at   = now(),
             order_verified_by   = v_user,
             platform            = coalesce(p_platform, platform),
             expires_at          = greatest(expires_at, now() + interval '24 hours')
       where id = v_row.id
      returning * into v_row;
      return v_row;
    exception
      when unique_violation then
        if v_tries >= 12 then
          raise exception 'Could not allocate a bill code, try again'
            using errcode = 'P0001';
        end if;
    end;
  end loop;
end $$;

-- ── 4. User: redeem the bill code and complete the task ────────────────────

create or replace function public.complete_task_with_bill_code(
  p_quest_id uuid,
  p_task_id  uuid,
  p_bill_code text
)
returns public.quest_order_verifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.quest_order_verifications%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in to complete this task' using errcode = '28000';
  end if;

  select * into v_row
    from public.quest_order_verifications
   where user_id  = v_user
     and quest_id = p_quest_id
     and task_id  = p_task_id
     and status   = 'order_verified'
   order by created_at desc
   limit 1;

  if not found then
    raise exception 'No verified order is waiting for a bill code' using errcode = 'P0002';
  end if;

  if v_row.bill_code_attempts >= 8 then
    raise exception 'Too many incorrect attempts. Ask the business to re-verify.'
      using errcode = 'P0001';
  end if;

  if upper(btrim(p_bill_code)) is distinct from upper(v_row.bill_code) then
    update public.quest_order_verifications
       set bill_code_attempts = bill_code_attempts + 1
     where id = v_row.id;
    raise exception 'That bill code does not match' using errcode = 'P0001';
  end if;

  update public.quest_order_verifications
     set status = 'completed', completed_at = now()
   where id = v_row.id
  returning * into v_row;

  -- Verified order == approved submission. The business already confirmed the
  -- order and wrote the bill code, so there is nothing left to review.
  insert into public.quest_task_submissions (
    quest_id, task_id, user_id, verification_status, caption, reviewed_at, submitted_at
  ) values (
    p_quest_id, p_task_id, v_user, 'approved',
    'Verified via STRIVUP order verification (' || v_row.order_code || ')',
    now(), now()
  )
  on conflict (quest_id, task_id, user_id) do update
     set verification_status = 'approved',
         rejection_reason    = null,
         reviewed_at         = now(),
         caption             = excluded.caption;

  return v_row;
end $$;

-- ── 5. Quest progress + leaderboard, from verified activity only ───────────

create or replace function public.quest_leaderboard(
  p_quest_id uuid,
  p_limit    int default 10
)
returns table (
  user_id          uuid,
  full_name        text,
  username         text,
  avatar_url       text,
  tasks_completed  bigint,
  points           bigint,
  rank             bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with verified as (
    select s.user_id, count(*) as tasks_completed, max(s.reviewed_at) as last_at
      from public.quest_task_submissions s
     where s.quest_id = p_quest_id
       and s.verification_status = 'approved'
     group by s.user_id
  )
  select
    v.user_id,
    p.full_name,
    p.username,
    p.avatar_url,
    v.tasks_completed,
    (v.tasks_completed * 100)::bigint as points,
    rank() over (order by v.tasks_completed desc, v.last_at asc) as rank
  from verified v
  left join public.profiles p on p.id = v.user_id
  order by v.tasks_completed desc, v.last_at asc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.issue_quest_order_code(uuid, uuid, text)        to authenticated;
grant execute on function public.business_lookup_order_code(text)                to authenticated;
grant execute on function public.business_verify_order_code(text, text)          to authenticated;
grant execute on function public.complete_task_with_bill_code(uuid, uuid, text)  to authenticated;
grant execute on function public.quest_leaderboard(uuid, int)                    to authenticated, anon;
