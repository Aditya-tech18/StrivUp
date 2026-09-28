-- ════════════════════════════════════════════════════════════════════════════
-- Roles, account status, and the business verification state machine
--
-- Written against the LIVE schema of cxujipeulvhreiryaptr, not against the
-- migration folder (which has drifted). Verified before writing:
--
--   • trg_guard_profile_privileged_columns and trg_guard_business_profile_write
--     are both attached and enabled, so is_admin / moderator_role and
--     business_profiles.verification_status already cannot be set from a
--     client. Those holes are closed — this migration does not re-close them.
--
--   • BUT: profiles has zero rows with is_admin = true, and there is no
--     function that can move a business out of 'submitted'. The guard blocks
--     the client and nothing on the server does it instead, so the blue tick
--     is currently unreachable for every business on the platform. The
--     'StrivUp' business has been stuck at 'submitted' for exactly this reason.
--
-- This migration supplies the missing half: an admin to do the reviewing, and
-- SECURITY DEFINER entry points that are the only way verification state moves.
-- Those functions run as the table owner, so the guard triggers let their
-- writes through while still refusing every direct client write.
--
-- Additive and idempotent. Nothing is dropped.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Role helpers ─────────────────────────────────────────────────────────

create or replace function public.is_platform_admin(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
     where p.id = p_user
       and (p.is_admin = true or p.moderator_role = 'super_admin')
  );
$$;

-- Admin or any moderator — content moderation is a wider circle than
-- business verification.
create or replace function public.is_platform_reviewer(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
     where p.id = p_user
       and (p.is_admin = true or coalesce(p.moderator_role, 'none') <> 'none')
  );
$$;

-- ── 2. Account status + active mode on profiles ─────────────────────────────
-- account_status is admin-enforced and distinct from profiles.is_deactivated,
-- which is the user's own reversible self-deactivation.

alter table public.profiles
  add column if not exists account_status            text not null default 'active',
  add column if not exists account_status_reason     text,
  add column if not exists account_status_changed_at timestamptz,
  add column if not exists account_status_changed_by uuid references auth.users(id) on delete set null,
  -- Which experience the person is currently looking at. Free to change: it is
  -- a view preference, never a permission. Every business capability is gated
  -- on business_profiles.verification_status server-side, so setting this to
  -- 'business' on its own grants nothing.
  add column if not exists active_mode               text not null default 'user';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_account_status_check') then
    alter table public.profiles add constraint profiles_account_status_check
      check (account_status in ('active', 'deactivated', 'suspended', 'banned'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_active_mode_check') then
    alter table public.profiles add constraint profiles_active_mode_check
      check (active_mode in ('user', 'business'));
  end if;
end $$;

create or replace function public.is_account_active(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select account_status = 'active' from profiles where id = p_user), true);
$$;

-- ── 3. Extend the profile guard to cover account_status ─────────────────────
-- Same shape as the live function, plus the four new admin-only columns.
-- active_mode is deliberately NOT frozen: the switcher must be able to set it.

create or replace function public.guard_profile_privileged_columns()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;

  if tg_op = 'INSERT' then
    new.is_admin                   := false;
    new.moderator_role             := 'none';
    new.verification_status        := 'none';
    new.restriction_status         := 'none';
    new.restriction_until          := null;
    new.moderation_violation_count := 0;
    new.account_status             := 'active';
    new.account_status_reason      := null;
    new.account_status_changed_at  := null;
    new.account_status_changed_by  := null;
    return new;
  end if;

  new.is_admin                   := old.is_admin;
  new.moderator_role             := old.moderator_role;
  new.verification_status        := old.verification_status;
  new.restriction_status         := old.restriction_status;
  new.restriction_until          := old.restriction_until;
  new.moderation_violation_count := old.moderation_violation_count;
  new.account_status             := old.account_status;
  new.account_status_reason      := old.account_status_reason;
  new.account_status_changed_at  := old.account_status_changed_at;
  new.account_status_changed_by  := old.account_status_changed_by;
  return new;
end $$;

-- ── 4. Bootstrap the first admin, in the database, by email ─────────────────
-- Never in frontend code and never by a hardcoded email check at runtime: this
-- writes a row, and from here on admin is ordinary database state that the
-- admin console can grant to anyone else.

update public.profiles p
   set is_admin = true, moderator_role = 'super_admin'
  from auth.users u
 where u.id = p.id
   and lower(u.email) = 'strivup.officialteam@gmail.com';

-- ── 5. Business verification lifecycle ──────────────────────────────────────

alter table public.business_profiles
  add column if not exists verification_submitted_at timestamptz,
  add column if not exists verification_reviewed_at  timestamptz,
  add column if not exists verification_reviewed_by  uuid references auth.users(id) on delete set null,
  add column if not exists verification_notes        text;

alter table public.business_profiles drop constraint if exists business_profiles_verification_status_check;
alter table public.business_profiles add constraint business_profiles_verification_status_check
  check (verification_status in (
    'not_started', 'draft', 'incomplete', 'submitted', 'under_review',
    'needs_more_info', 'resubmission_required', 'verified', 'rejected', 'suspended'
  ));

-- Documents. Which document types a business must supply is data, not a
-- frontend constant, so a category can require different proof without a
-- redeploy.
create table if not exists public.business_verification_documents (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.business_profiles(id) on delete cascade,
  doc_type     text not null,
  storage_path text not null,
  file_name    text,
  mime_type    text,
  size_bytes   bigint,
  status       text not null default 'submitted',
  review_note  text,
  uploaded_at  timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid references auth.users(id) on delete set null
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bvd_doc_type_check') then
    alter table public.business_verification_documents add constraint bvd_doc_type_check
      check (doc_type in (
        'business_registration', 'gst', 'pan', 'shop_licence',
        'address_proof', 'owner_id', 'other'
      ));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'bvd_status_check') then
    alter table public.business_verification_documents add constraint bvd_status_check
      check (status in ('submitted', 'accepted', 'rejected'));
  end if;
end $$;

create index if not exists bvd_business on public.business_verification_documents (business_id, uploaded_at desc);

-- Every status transition, so a rejected business can see exactly what changed
-- and when, and an admin decision is never unattributable.
create table if not exists public.business_verification_history (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.business_profiles(id) on delete cascade,
  from_status   text,
  to_status     text not null,
  actor_id      uuid references auth.users(id) on delete set null,
  actor_role    text not null default 'system',
  reason        text,
  created_at    timestamptz not null default now()
);

create index if not exists bvh_business on public.business_verification_history (business_id, created_at desc);

-- Admin actions against accounts (business_audit_log already covers
-- business-scoped events; this one is for people).
create table if not exists public.admin_actions (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid not null references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_entity  text,
  target_id      uuid,
  action         text not null,
  reason         text,
  metadata       jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists admin_actions_target on public.admin_actions (target_user_id, created_at desc);
create index if not exists admin_actions_admin  on public.admin_actions (admin_id, created_at desc);

-- ── 6. RLS ──────────────────────────────────────────────────────────────────

alter table public.business_verification_documents enable row level security;
alter table public.business_verification_history   enable row level security;
alter table public.admin_actions                   enable row level security;

do $$
begin
  -- Documents: the owning business and platform admins. Nobody else, ever —
  -- these are registration certificates and identity documents.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='business_verification_documents' and policyname='bvd_owner_read') then
    create policy bvd_owner_read on public.business_verification_documents
      for select using (business_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='business_verification_documents' and policyname='bvd_owner_insert') then
    create policy bvd_owner_insert on public.business_verification_documents
      for insert with check (business_id = auth.uid());
  end if;

  -- Deleting is how a business swaps a wrong file before submitting; once the
  -- row is accepted or rejected it is evidence and stays put.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='business_verification_documents' and policyname='bvd_owner_delete') then
    create policy bvd_owner_delete on public.business_verification_documents
      for delete using (business_id = auth.uid() and status = 'submitted');
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='business_verification_documents' and policyname='bvd_admin_read') then
    create policy bvd_admin_read on public.business_verification_documents
      for select using (public.is_platform_admin(auth.uid()));
  end if;

  -- History: readable by the business it concerns and by admins.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='business_verification_history' and policyname='bvh_owner_read') then
    create policy bvh_owner_read on public.business_verification_history
      for select using (business_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='business_verification_history' and policyname='bvh_admin_read') then
    create policy bvh_admin_read on public.business_verification_history
      for select using (public.is_platform_admin(auth.uid()));
  end if;

  -- Admin actions: admins only.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='admin_actions' and policyname='admin_actions_admin_read') then
    create policy admin_actions_admin_read on public.admin_actions
      for select using (public.is_platform_admin(auth.uid()));
  end if;
end $$;

-- No INSERT/UPDATE policy on history or admin_actions: they are written only
-- by the SECURITY DEFINER functions below, so an audit trail cannot be forged
-- or edited by whoever it happens to incriminate.

-- Admins need to read every business profile, not just verified ones, to
-- review a pending application.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='business_profiles' and policyname='bp_admin_read_all') then
    create policy bp_admin_read_all on public.business_profiles
      for select using (public.is_platform_admin(auth.uid()));
  end if;
end $$;

-- ── 7. Business submits itself for review ───────────────────────────────────

create or replace function public.submit_business_verification()
returns public.business_profiles
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_biz  public.business_profiles%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in to submit verification' using errcode = '28000';
  end if;

  select * into v_biz from public.business_profiles where id = v_user;
  if not found then
    raise exception 'Create your business profile first' using errcode = 'P0002';
  end if;

  if v_biz.verification_status = 'verified' then
    raise exception 'This business is already verified' using errcode = 'P0001';
  end if;

  if v_biz.verification_status = 'suspended' then
    raise exception 'This business is suspended. Contact STRIVUP support.' using errcode = 'P0001';
  end if;

  if v_biz.verification_status in ('submitted', 'under_review') then
    return v_biz;  -- already queued; resubmitting changes nothing
  end if;

  -- Enough of a profile to be reviewable at all.
  if coalesce(btrim(v_biz.business_name), '') = ''
     or coalesce(btrim(v_biz.category), '') = ''
     or coalesce(btrim(v_biz.address), '') = '' then
    raise exception 'Add your business name, category and address before submitting'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.business_verification_documents where business_id = v_user
  ) then
    raise exception 'Upload at least one verification document before submitting'
      using errcode = 'P0001';
  end if;

  update public.business_profiles
     set verification_status    = 'submitted',
         verification_submitted_at = now(),
         rejection_reason       = null,
         updated_at             = now()
   where id = v_user
  returning * into v_biz;

  insert into public.business_verification_history (business_id, from_status, to_status, actor_id, actor_role)
  values (v_user, 'draft', 'submitted', v_user, 'business');

  return v_biz;
end $$;

-- ── 8. Admin reviews a business ─────────────────────────────────────────────
-- The only path to a blue tick. Runs as the table owner, so the guard trigger
-- lets it through while every client write stays refused.

create or replace function public.admin_review_business(
  p_business_id uuid,
  p_action      text,
  p_reason      text default null
)
returns public.business_profiles
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_biz   public.business_profiles%rowtype;
  v_from  text;
  v_to    text;
begin
  if not public.is_platform_admin(v_admin) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into v_biz from public.business_profiles where id = p_business_id;
  if not found then
    raise exception 'Business not found' using errcode = 'P0002';
  end if;

  v_from := v_biz.verification_status;

  v_to := case lower(p_action)
            when 'approve'             then 'verified'
            when 'reject'              then 'rejected'
            when 'request_resubmission' then 'resubmission_required'
            when 'needs_more_info'     then 'needs_more_info'
            when 'under_review'        then 'under_review'
            when 'suspend'             then 'suspended'
            when 'unsuspend'           then 'submitted'
            else null
          end;

  if v_to is null then
    raise exception 'Unknown review action: %', p_action using errcode = 'P0001';
  end if;

  -- A rejection the business cannot act on is a dead end, so reasons are
  -- required wherever the business is expected to do something next.
  if v_to in ('rejected', 'resubmission_required', 'needs_more_info', 'suspended')
     and coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required when you %', lower(p_action) using errcode = 'P0001';
  end if;

  update public.business_profiles
     set verification_status   = v_to,
         rejection_reason      = case when v_to in ('rejected','resubmission_required','needs_more_info')
                                      then p_reason else null end,
         verification_notes    = coalesce(p_reason, verification_notes),
         verification_reviewed_at = now(),
         verification_reviewed_by = v_admin,
         updated_at            = now()
   where id = p_business_id
  returning * into v_biz;

  insert into public.business_verification_history
    (business_id, from_status, to_status, actor_id, actor_role, reason)
  values (p_business_id, v_from, v_to, v_admin, 'admin', p_reason);

  insert into public.admin_actions
    (admin_id, target_user_id, target_entity, target_id, action, reason, metadata)
  values (v_admin, p_business_id, 'business_profile', p_business_id,
          'business_' || lower(p_action), p_reason,
          jsonb_build_object('from', v_from, 'to', v_to));

  return v_biz;
end $$;

-- ── 9. Admin enforces account status ────────────────────────────────────────

create or replace function public.admin_set_account_status(
  p_user_id uuid,
  p_status  text,
  p_reason  text default null
)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_row   public.profiles%rowtype;
begin
  if not public.is_platform_admin(v_admin) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if p_status not in ('active', 'deactivated', 'suspended', 'banned') then
    raise exception 'Unknown account status: %', p_status using errcode = 'P0001';
  end if;

  if p_status <> 'active' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required to % an account', p_status using errcode = 'P0001';
  end if;

  -- An admin locking themselves out takes the whole console with them.
  if p_user_id = v_admin and p_status <> 'active' then
    raise exception 'You cannot change your own account status' using errcode = 'P0001';
  end if;

  update public.profiles
     set account_status            = p_status,
         account_status_reason     = case when p_status = 'active' then null else p_reason end,
         account_status_changed_at = now(),
         account_status_changed_by = v_admin
   where id = p_user_id
  returning * into v_row;

  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  insert into public.admin_actions
    (admin_id, target_user_id, target_entity, target_id, action, reason)
  values (v_admin, p_user_id, 'profile', p_user_id, 'account_' || p_status, p_reason);

  return v_row;
end $$;

-- ── 10. What can this account do right now? ─────────────────────────────────
-- One call for the mode switcher, so the client never derives permission by
-- reading a status string and deciding for itself.

create or replace function public.get_account_context()
returns table (
  user_id              uuid,
  username             text,
  full_name            text,
  account_status       text,
  active_mode          text,
  is_admin             boolean,
  has_business         boolean,
  business_id          uuid,
  business_name        text,
  verification_status  text,
  can_use_business_mode boolean,
  rejection_reason     text
)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    p.username,
    p.full_name,
    p.account_status,
    p.active_mode,
    public.is_platform_admin(p.id),
    b.id is not null,
    b.id,
    b.business_name,
    coalesce(b.verification_status, 'not_started'),
    coalesce(b.verification_status, '') = 'verified'
      and p.account_status = 'active',
    b.rejection_reason
  from public.profiles p
  left join public.business_profiles b on b.id = p.id
  where p.id = auth.uid();
$$;

-- Server-side gate for every business capability. Callers that publish a
-- Quest, publish a business Challenge or verify an order check this rather
-- than trusting a mode flag from the browser.
create or replace function public.can_act_as_business(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.business_profiles b
      join public.profiles p on p.id = b.id
     where b.id = p_user
       and b.verification_status = 'verified'
       and p.account_status = 'active'
  );
$$;

grant execute on function public.is_platform_admin(uuid)                      to authenticated;
grant execute on function public.is_platform_reviewer(uuid)                   to authenticated;
grant execute on function public.is_account_active(uuid)                      to authenticated;
grant execute on function public.can_act_as_business(uuid)                    to authenticated;
grant execute on function public.submit_business_verification()               to authenticated;
grant execute on function public.admin_review_business(uuid, text, text)      to authenticated;
grant execute on function public.admin_set_account_status(uuid, text, text)   to authenticated;
grant execute on function public.get_account_context()                        to authenticated;

-- ── 11. Private bucket for verification documents ───────────────────────────
-- Registration certificates and identity documents must never be publicly
-- addressable; the existing avatars/proof-media buckets are both public, so
-- these need a bucket of their own.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-documents', 'business-documents', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  -- Objects are namespaced by business id: <business_id>/<file>. The owning
  -- business reads and writes its own folder; admins read everything.
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='bizdocs_owner_rw') then
    create policy bizdocs_owner_rw on storage.objects
      for all
      using (bucket_id = 'business-documents' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'business-documents' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;

  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='bizdocs_admin_read') then
    create policy bizdocs_admin_read on storage.objects
      for select
      using (bucket_id = 'business-documents' and public.is_platform_admin(auth.uid()));
  end if;
end $$;
