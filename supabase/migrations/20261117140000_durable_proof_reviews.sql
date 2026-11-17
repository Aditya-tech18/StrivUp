-- Applied against the introspected live schema. The scheduler is activated
-- separately, after deploying the token-authenticated edge worker.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- pg_net grants table reads broadly by default. Dispatch bodies contain private
-- one-use credentials, so keep its queue and response tables server-only too.
-- Supabase owns pg_net's transient tables and does not allow grant changes.
-- Keep `net` out of exposed API schemas. Dispatch contains only a two-minute,
-- single-use, proof-scoped lease, never a service key or reusable worker secret.

create table if not exists public.proof_review_jobs (
  submission_id uuid primary key references public.proof_submissions(id) on delete cascade,
  submission_version timestamptz not null,
  media_url text not null,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  started_at timestamptz,
  lease_token uuid,
  last_error text,
  completed_at timestamptz
);
alter table public.proof_review_jobs enable row level security;
revoke all on public.proof_review_jobs from public,anon,authenticated;
grant all on public.proof_review_jobs to service_role;

-- Legacy public JWT passes the existing gateway check; it is not a worker
-- credential. The expiring per-proof lease still authenticates each job.
create table if not exists public.proof_review_dispatch_config (
  singleton boolean primary key default true check (singleton),
  public_api_key text not null
);
alter table public.proof_review_dispatch_config enable row level security;
revoke all on public.proof_review_dispatch_config from public,anon,authenticated;
grant all on public.proof_review_dispatch_config to service_role;
alter table public.proof_review_jobs enable row level security;
revoke all on public.proof_review_jobs from public, anon, authenticated;
grant all on public.proof_review_jobs to service_role;
create index if not exists proof_review_jobs_due on public.proof_review_jobs(next_attempt_at) where completed_at is null;

create or replace function public.sync_proof_review_job() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.verification_status='pending' and not coalesce(new.ai_reviewed,false)
     and not coalesce(new.admin_removed,false) and new.media_url is not null then
    insert into public.proof_review_jobs(submission_id,submission_version,media_url)
    values(new.id,new.submitted_at,new.media_url)
    on conflict(submission_id) do update set
      submission_version=excluded.submission_version,media_url=excluded.media_url,
      attempt_count=0,next_attempt_at=now(),locked_until=null,lease_token=null,
      last_error=null,completed_at=null,started_at=null
    where proof_review_jobs.submission_version is distinct from excluded.submission_version
       or proof_review_jobs.media_url is distinct from excluded.media_url
       or proof_review_jobs.completed_at is not null;
  else
    update public.proof_review_jobs set completed_at=now(),locked_until=null,lease_token=null where submission_id=new.id;
  end if;
  return new;
end $$;
revoke all on function public.sync_proof_review_job() from public,anon,authenticated;
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='sync_proof_review_job' and tgrelid='public.proof_submissions'::regclass) then
    create trigger sync_proof_review_job after insert or update on public.proof_submissions
      for each row execute function public.sync_proof_review_job();
  end if;
end $$;

-- Browser callers can only request their own existing, unprocessed upload.
-- Repeated clicks do not reset backoff or extend a lease.
create or replace function public.enqueue_proof_review(p_submission_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare p public.proof_submissions;
begin
  select * into p from public.proof_submissions where id=p_submission_id and user_id=auth.uid() for update;
  if not found then raise exception 'Proof not found' using errcode='42501'; end if;
  if p.verification_status<>'pending' or coalesce(p.ai_reviewed,false) or coalesce(p.admin_removed,false) or p.media_url is null then return false; end if;
  insert into public.proof_review_jobs(submission_id,submission_version,media_url)
  values(p.id,p.submitted_at,p.media_url) on conflict(submission_id) do nothing;
  return true;
end $$;
revoke all on function public.enqueue_proof_review(uuid) from public,anon;
grant execute on function public.enqueue_proof_review(uuid) to authenticated;

-- Cron owns dispatch. The URL is set by the activation migration, not supplied
-- by untrusted callers. A token is new for every lease and never client-readable.
create or replace function public.dispatch_proof_reviews(p_url text) returns integer
language plpgsql security definer set search_path = '' as $$
declare j public.proof_review_jobs; n integer:=0; capacity integer; api_key text;
begin
  if not pg_try_advisory_xact_lock(1711171400) then return 0; end if;
  select public_api_key into api_key from public.proof_review_dispatch_config where singleton;
  if api_key is null then return 0; end if;
  select greatest(0,4-count(*))::integer into capacity from public.proof_review_jobs
    where completed_at is null and locked_until>now();
  for j in select * from public.proof_review_jobs
    where completed_at is null and next_attempt_at<=now() and (locked_until is null or locked_until<=now())
    order by next_attempt_at limit capacity for update skip locked
  loop
    j.lease_token:=gen_random_uuid();
    update public.proof_review_jobs set lease_token=j.lease_token,locked_until=now()+interval '2 minutes',started_at=null,
      attempt_count=attempt_count+1,
      next_attempt_at=now()+make_interval(secs=>least(3600,60*power(2,least(attempt_count,6))) + random()*10)
      where submission_id=j.submission_id;
    perform net.http_post(url:=p_url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||api_key,'apikey',api_key),
      body:=jsonb_build_object('submission_id',j.submission_id,'review_token',j.lease_token),timeout_milliseconds:=60000);
    n:=n+1;
  end loop;
  return n;
end $$;
revoke all on function public.dispatch_proof_reviews(text) from public,anon,authenticated;
grant execute on function public.dispatch_proof_reviews(text) to service_role;

-- Consume each dispatch token once, so duplicate HTTP delivery cannot run the
-- expensive model twice. Expired workers are recovered with a fresh token.
create or replace function public.start_proof_review(p_submission_id uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j public.proof_review_jobs;
begin
  update public.proof_review_jobs set started_at=now()
  where submission_id=p_submission_id and lease_token=p_token and completed_at is null
    and locked_until>now() and started_at is null returning * into j;
  if not found then return null; end if;
  return jsonb_build_object('submission_version',j.submission_version,'media_url',j.media_url);
end $$;
revoke all on function public.start_proof_review(uuid,uuid) from public,anon,authenticated;
grant execute on function public.start_proof_review(uuid,uuid) to service_role;

-- One transaction records a verdict, its audit event and queue completion.
-- Lock proof first, matching the upload trigger's lock order.
create or replace function public.finish_proof_review(
  p_submission_id uuid,p_token uuid,p_patch jsonb,p_event jsonb,p_error text default null,p_retryable boolean default false
) returns boolean language plpgsql security definer set search_path = '' as $$
declare p public.proof_submissions; j public.proof_review_jobs;
begin
  select * into p from public.proof_submissions where id=p_submission_id for update;
  if not found then return false; end if;
  select * into j from public.proof_review_jobs where submission_id=p_submission_id for update;
  if not found or p_token is null or j.lease_token is null or j.locked_until is null or j.started_at is null
    or j.lease_token is distinct from p_token or j.locked_until<=now() or j.completed_at is not null
    or p.submitted_at is distinct from j.submission_version or p.media_url is distinct from j.media_url
    or p.verification_status<>'pending' or coalesce(p.ai_reviewed,false) or coalesce(p.admin_removed,false)
  then return false; end if;
  if p_retryable then
    update public.proof_review_jobs set locked_until=null,lease_token=null,last_error=left(p_error,2000)
    where submission_id=p_submission_id;
  else
    update public.proof_submissions set
      file_hash=coalesce(p_patch->>'file_hash',file_hash),
      ai_reviewed=true,
      ai_classification=coalesce(p_patch->>'ai_classification','uncertain'),
      ai_confidence=(p_patch->>'ai_confidence')::numeric,
      ai_reasoning=p_patch->>'ai_reasoning',
      verification_status=coalesce(p_patch->>'verification_status','pending'),
      rejection_reason=p_patch->>'rejection_reason',
      reviewed_at=case when p_patch->>'verification_status' in ('approved','rejected') then now() else reviewed_at end
    where id=p_submission_id;
    update public.proof_review_jobs set completed_at=now(),locked_until=null,lease_token=null,last_error=p_error
    where submission_id=p_submission_id;
  end if;
  insert into public.moderation_events(proof_id,user_id,event_type,source,decision,reason,confidence)
  values(p.id,p.user_id,p_event->>'event_type',coalesce(p_event->>'source','system'),p_event->>'decision',
    left(p_event->>'reason',2000),(p_event->>'confidence')::numeric);
  return true;
end $$;
revoke all on function public.finish_proof_review(uuid,uuid,jsonb,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.finish_proof_review(uuid,uuid,jsonb,jsonb,text,boolean) to service_role;

-- Recover uploads stranded by earlier outages; human-review items are excluded.
insert into public.proof_review_jobs(submission_id,submission_version,media_url)
select id,submitted_at,media_url from public.proof_submissions
where verification_status='pending' and not coalesce(ai_reviewed,false) and not coalesce(admin_removed,false) and media_url is not null
on conflict(submission_id) do nothing;
