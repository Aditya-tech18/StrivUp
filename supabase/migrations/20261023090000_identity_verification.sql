-- ============================================================================
-- Identity verification: the blue tick, and the gold one.
--
-- Two tiers, two different proofs:
--
--   business  gold seal.  Earned by the EXISTING business verification flow
--             (business_profiles.verification_status = 'verified', granted by
--             an admin). No email step: a business already proved itself with
--             documents when it was verified.
--
--   user      blue seal.  Earned by BOTH an email the person has confirmed
--             AND a government document an admin has approved. Neither alone
--             is enough.
--
-- Nothing here grants a tick as a side effect. The only two writes that can
-- set profiles.verification_type are admin_review_identity_request (blue) and
-- the trigger below mirroring an admin's business decision (gold).
--
-- The document itself never becomes public. It lands in a PRIVATE bucket
-- under the owner's user id, and only the owner and a platform admin can read
-- it, through a signed URL with a short life.
--
-- NOTE FOR THE OWNER, not a legal opinion: storing copies of Aadhaar carries
-- specific obligations in India (masking, retention, who may hold them). This
-- migration keeps the file private and admin-only, and stores NO document
-- number anywhere, but whether STRIVUP may hold these copies at all is a
-- question for a qualified Indian lawyer.
--
-- Idempotent throughout: safe to re-run.
--
-- APPLIED 2026-10-23 against cxujipeulvhreiryaptr, statement by statement
-- rather than in one go: the Supabase MCP endpoint used here times out on
-- multi-statement batches and on DROP, though CREATE and CREATE OR REPLACE
-- go through fine. That is a quirk of that endpoint, not of this SQL; run
-- through psql it applies as a single file.
-- ============================================================================

-- ── profiles: which tier, and since when ───────────────────────────────────
alter table public.profiles
  add column if not exists verification_type text not null default 'none';

alter table public.profiles
  add column if not exists verified_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_verification_type_check'
  ) then
    alter table public.profiles
      add constraint profiles_verification_type_check
      check (verification_type in ('none', 'user', 'business'));
  end if;
end $$;

comment on column public.profiles.verification_type is
  'none | user (blue seal) | business (gold seal). Written only by '
  'admin_review_identity_request and sync_verification_type_from_business.';

-- ── the application itself ─────────────────────────────────────────────────
create table if not exists public.identity_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,

  -- The email is read back from auth.users rather than taken from the client,
  -- so "verified" here can only ever mean "Supabase confirmed it".
  email text,
  email_verified_at timestamptz,

  document_type text,
  -- Path inside the private bucket, never a public URL.
  document_path text,
  document_uploaded_at timestamptz,

  status text not null default 'draft',
  rejection_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.identity_verification_requests'::regclass
      and conname = 'ivr_document_type_check'
  ) then
    alter table public.identity_verification_requests
      add constraint ivr_document_type_check
      check (document_type is null
             or document_type in ('aadhaar', 'voter_id', 'driving_license'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.identity_verification_requests'::regclass
      and conname = 'ivr_status_check'
  ) then
    alter table public.identity_verification_requests
      add constraint ivr_status_check
      check (status in ('draft', 'email_pending', 'docs_pending',
                        'under_review', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists ivr_status_idx
  on public.identity_verification_requests (status, created_at desc);

-- ── RLS: read your own, admins read all, nobody writes directly ────────────
alter table public.identity_verification_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'identity_verification_requests'
      and policyname = 'ivr_select_own'
  ) then
    create policy ivr_select_own
      on public.identity_verification_requests
      for select to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'identity_verification_requests'
      and policyname = 'ivr_select_admin'
  ) then
    create policy ivr_select_admin
      on public.identity_verification_requests
      for select to authenticated
      using (public.is_platform_admin(auth.uid()));
  end if;
end $$;

-- No insert/update/delete policy on purpose. Every write goes through the
-- SECURITY DEFINER functions below, which decide what the caller may change.

-- ── the private document bucket ────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('identity-documents', 'identity-documents', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

do $$
begin
  -- Upload only into a folder named after your own user id.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'identity_docs_insert_own'
  ) then
    create policy identity_docs_insert_own
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'identity-documents'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'identity_docs_select_own'
  ) then
    create policy identity_docs_select_own
      on storage.objects for select to authenticated
      using (
        bucket_id = 'identity-documents'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  -- A reviewer has to be able to look at the document they are judging.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'identity_docs_select_admin'
  ) then
    create policy identity_docs_select_admin
      on storage.objects for select to authenticated
      using (
        bucket_id = 'identity-documents'
        and public.is_platform_admin(auth.uid())
      );
  end if;

  -- Replacing a rejected document should not need an admin.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'identity_docs_delete_own'
  ) then
    create policy identity_docs_delete_own
      on storage.objects for delete to authenticated
      using (
        bucket_id = 'identity-documents'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

-- ── touch trigger ──────────────────────────────────────────────────────────
create or replace function public.ivr_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ivr_touch_trg on public.identity_verification_requests;
create trigger ivr_touch_trg
  before update on public.identity_verification_requests
  for each row execute function public.ivr_touch();

-- ============================================================================
-- Caller-side functions
-- ============================================================================

/*
 * Where the caller stands right now. One row, their own, plus whether the
 * account email is confirmed — which is read from auth.users, so the client
 * cannot assert it.
 */
create or replace function public.my_identity_verification()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_req public.identity_verification_requests%rowtype;
  v_type text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select u.email, u.email_confirmed_at into v_email, v_confirmed
  from auth.users u where u.id = v_user;

  select * into v_req
  from public.identity_verification_requests where user_id = v_user;

  select verification_type into v_type from public.profiles where id = v_user;

  return jsonb_build_object(
    'ok', true,
    'account_email', v_email,
    'email_confirmed', v_confirmed is not null,
    'verification_type', coalesce(v_type, 'none'),
    'request', case when v_req.id is null then null else jsonb_build_object(
      'id', v_req.id,
      'status', v_req.status,
      'document_type', v_req.document_type,
      'has_document', v_req.document_path is not null,
      'email_verified_at', v_req.email_verified_at,
      'rejection_reason', v_req.rejection_reason,
      'reviewed_at', v_req.reviewed_at,
      'created_at', v_req.created_at
    ) end
  );
end;
$$;

/*
 * Submit, or resubmit after a rejection.
 *
 * Refuses outright unless the account email is confirmed, because the rule is
 * email AND document, in that order. The email stored is the confirmed one
 * from auth.users; whatever the client sends is ignored.
 */
create or replace function public.submit_identity_verification(
  p_document_type text,
  p_document_path text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_existing text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_document_type is null
     or p_document_type not in ('aadhaar', 'voter_id', 'driving_license') then
    return jsonb_build_object('ok', false, 'error', 'bad_document_type');
  end if;

  -- The path must sit under the caller's own folder, or someone could point
  -- their application at another person's upload.
  if p_document_path is null
     or p_document_path not like (v_user::text || '/%') then
    return jsonb_build_object('ok', false, 'error', 'bad_document_path');
  end if;

  select u.email, u.email_confirmed_at into v_email, v_confirmed
  from auth.users u where u.id = v_user;

  if v_confirmed is null then
    return jsonb_build_object('ok', false, 'error', 'email_not_confirmed');
  end if;

  select status into v_existing
  from public.identity_verification_requests where user_id = v_user;

  if v_existing in ('under_review', 'approved') then
    return jsonb_build_object('ok', false, 'error', 'already_' || v_existing);
  end if;

  insert into public.identity_verification_requests
    (user_id, email, email_verified_at, document_type, document_path,
     document_uploaded_at, status, rejection_reason, reviewed_by, reviewed_at)
  values
    (v_user, v_email, v_confirmed, p_document_type, p_document_path,
     now(), 'under_review', null, null, null)
  on conflict (user_id) do update set
    email                = excluded.email,
    email_verified_at    = excluded.email_verified_at,
    document_type        = excluded.document_type,
    document_path        = excluded.document_path,
    document_uploaded_at = excluded.document_uploaded_at,
    status               = 'under_review',
    rejection_reason     = null,
    reviewed_by          = null,
    reviewed_at          = null;

  -- Mirrors the application state onto the profile so other screens have one
  -- column to read. It is NOT the tick: that is verification_type.
  update public.profiles set verification_status = 'pending' where id = v_user;

  return jsonb_build_object('ok', true, 'status', 'under_review');
end;
$$;

-- ============================================================================
-- Admin-side functions. Every one of them re-checks is_platform_admin against
-- the database; none of them believe a flag sent by a browser.
-- ============================================================================

create or replace function public.admin_list_identity_requests(
  p_status text default 'under_review',
  p_limit int default 50
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_admin uuid := auth.uid();
  v_rows jsonb;
begin
  if not public.is_platform_admin(v_admin) then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows
  from (
    select
      q.id, q.user_id, q.email, q.email_verified_at, q.document_type,
      q.document_path, q.status, q.rejection_reason, q.created_at,
      q.reviewed_at,
      p.full_name, p.username, p.avatar_url, p.verification_type
    from public.identity_verification_requests q
    join public.profiles p on p.id = q.user_id
    where p_status is null or p_status = 'all' or q.status = p_status
    order by q.created_at
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) r;

  return jsonb_build_object('ok', true, 'requests', v_rows);
end;
$$;

/*
 * The only way a blue seal is ever granted.
 *
 * Re-reads the email confirmation at decision time rather than trusting the
 * snapshot taken at submission, so an account that changed to an unconfirmed
 * address between applying and review cannot be approved.
 *
 * A verified business keeps its gold seal: gold outranks blue, and an owner
 * who also proves their identity should not be demoted.
 */
create or replace function public.admin_review_identity_request(
  p_request_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_admin uuid := auth.uid();
  v_user uuid;
  v_confirmed timestamptz;
  v_is_business boolean;
begin
  if not public.is_platform_admin(v_admin) then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  select user_id into v_user
  from public.identity_verification_requests where id = p_request_id;

  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not p_approve then
    update public.identity_verification_requests
       set status = 'rejected',
           rejection_reason = p_reason,
           reviewed_by = v_admin,
           reviewed_at = now()
     where id = p_request_id;

    update public.profiles
       set verification_status = 'rejected'
     where id = v_user;

    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  select u.email_confirmed_at into v_confirmed
  from auth.users u where u.id = v_user;

  if v_confirmed is null then
    return jsonb_build_object('ok', false, 'error', 'email_not_confirmed');
  end if;

  select exists (
    select 1 from public.business_profiles b
    where b.id = v_user and b.verification_status = 'verified'
  ) into v_is_business;

  update public.identity_verification_requests
     set status = 'approved',
         email_verified_at = v_confirmed,
         rejection_reason = null,
         reviewed_by = v_admin,
         reviewed_at = now()
   where id = p_request_id;

  update public.profiles
     set verification_status = 'approved',
         verification_type = case when v_is_business then 'business' else 'user' end,
         verified_at = coalesce(verified_at, now())
   where id = v_user;

  return jsonb_build_object(
    'ok', true,
    'status', 'approved',
    'verification_type', case when v_is_business then 'business' else 'user' end
  );
end;
$$;

-- ============================================================================
-- Gold seal: mirrors the admin's business decision onto the profile.
-- ============================================================================

create or replace function public.sync_verification_type_from_business()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.verification_status = 'verified' then
    update public.profiles
       set verification_type = 'business',
           verified_at = coalesce(verified_at, now())
     where id = new.id;

  elsif coalesce(old.verification_status, '') = 'verified' then
    -- Lost its verification. Fall back to a blue seal if the person also
    -- passed identity verification in their own right, otherwise to nothing.
    update public.profiles p
       set verification_type = case
             when p.verification_status = 'approved' then 'user' else 'none' end,
           verified_at = case
             when p.verification_status = 'approved' then p.verified_at else null end
     where p.id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_verification_type_trg on public.business_profiles;
create trigger sync_verification_type_trg
  after insert or update of verification_status on public.business_profiles
  for each row execute function public.sync_verification_type_from_business();

-- ── backfill: businesses already verified before this migration ────────────
update public.profiles p
   set verification_type = 'business',
       verified_at = coalesce(p.verified_at, now())
  from public.business_profiles b
 where b.id = p.id
   and b.verification_status = 'verified'
   and p.verification_type <> 'business';

-- ── grants ─────────────────────────────────────────────────────────────────
grant execute on function public.my_identity_verification() to authenticated;
grant execute on function public.submit_identity_verification(text, text) to authenticated;
grant execute on function public.admin_list_identity_requests(text, int) to authenticated;
grant execute on function public.admin_review_identity_request(uuid, boolean, text) to authenticated;
