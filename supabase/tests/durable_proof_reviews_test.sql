-- All changes, trigger side effects and queued HTTP requests are rolled back.
begin;
do $$
declare seed public.proof_submissions; sid uuid:=gen_random_uuid(); tok uuid:=gen_random_uuid(); result boolean; n integer;
begin
  select * into seed from public.proof_submissions limit 1;
  if not found then raise exception 'Fixture requires one existing submission'; end if;
  insert into public.proof_submissions(id,challenge_id,user_id,day_number,task_id,media_url,verification_status)
  values(sid,seed.challenge_id,seed.user_id,
    (select coalesce(max(day_number),0)+1 from public.proof_submissions where challenge_id=seed.challenge_id and user_id=seed.user_id),
    seed.task_id,seed.media_url,'pending');
  if not exists(select 1 from public.proof_review_jobs where submission_id=sid and completed_at is null) then raise exception 'Upload was not queued'; end if;
  if has_table_privilege('authenticated','public.proof_review_jobs','select') then raise exception 'Private job token is exposed'; end if;
  if has_function_privilege('authenticated','public.start_proof_review(uuid,uuid)','execute') then raise exception 'Worker RPC exposed'; end if;
  if has_function_privilege('anon','public.dispatch_proof_reviews(text)','execute') then raise exception 'Dispatcher exposed'; end if;
  if public.start_proof_review(sid,tok) is not null then raise exception 'Invalid token accepted'; end if;
  update public.proof_review_jobs set lease_token=tok,locked_until=now()+interval '2 minutes',attempt_count=1,next_attempt_at=now()+interval '1 minute' where submission_id=sid;
  if public.start_proof_review(sid,tok) is null then raise exception 'Valid lease rejected'; end if;
  if public.start_proof_review(sid,tok) is not null then raise exception 'Lease replay accepted'; end if;
  result:=public.finish_proof_review(sid,tok,'{}','{"event_type":"ai_failed","source":"system","reason":"test outage"}','test 503',true);
  if not result then raise exception 'Could not record retry'; end if;
  if (select ai_reviewed or verification_status<>'pending' from public.proof_submissions where id=sid) then raise exception 'Outage decided proof'; end if;
  if not exists(select 1 from public.proof_review_jobs where submission_id=sid and completed_at is null and lease_token is null and next_attempt_at>now()) then raise exception 'Retry not durable'; end if;
  -- Owner enqueue cannot reset backoff; another user cannot enqueue it.
  perform set_config('request.jwt.claim.sub',seed.user_id::text,true);
  perform public.enqueue_proof_review(sid);
  if not exists(select 1 from public.proof_review_jobs where submission_id=sid and attempt_count=1 and next_attempt_at>now()) then raise exception 'Enqueue reset backoff'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.enqueue_proof_review(sid);
    raise exception 'Foreign owner accepted';
  exception when insufficient_privilege then null;
  end;
  -- Old worker cannot overwrite a replacement upload.
  update public.proof_review_jobs set lease_token=tok,locked_until=now()+interval '2 minutes',started_at=now() where submission_id=sid;
  update public.proof_submissions set submitted_at=clock_timestamp()+interval '1 second' where id=sid;
  if public.finish_proof_review(sid,tok,'{"verification_status":"approved"}','{"event_type":"ai_approved","source":"ai"}') then raise exception 'Stale verdict applied'; end if;
  -- Manual decisions win even if a worker is still running.
  update public.proof_review_jobs set lease_token=tok,locked_until=now()+interval '2 minutes',started_at=now() where submission_id=sid;
  update public.proof_submissions set verification_status='rejected',rejection_reason='Manual fixture decision' where id=sid;
  if public.finish_proof_review(sid,tok,'{"verification_status":"approved"}','{"event_type":"ai_approved","source":"ai"}') then raise exception 'Manual decision overwritten'; end if;
  -- Re-queue and finish: proof, audit and completion are atomic and idempotent.
  update public.proof_submissions set verification_status='pending',ai_reviewed=false,submitted_at=clock_timestamp()+interval '2 seconds' where id=sid;
  update public.proof_review_jobs set lease_token=tok,locked_until=now()+interval '2 minutes',started_at=now() where submission_id=sid;
  result:=public.finish_proof_review(sid,tok,'{"verification_status":"rejected","ai_classification":"mismatch","ai_confidence":0.9,"ai_reasoning":"Fixture"}',
    '{"event_type":"ai_flagged","source":"ai","decision":"mismatch","reason":"Fixture"}');
  if not result then raise exception 'Final verdict not applied'; end if;
  if public.finish_proof_review(sid,tok,'{}','{"event_type":"ai_failed"}') then raise exception 'Final verdict replay accepted'; end if;
  if not exists(select 1 from public.proof_review_jobs where submission_id=sid and completed_at is not null) then raise exception 'Final job still active'; end if;
  select count(*) into n from public.moderation_events where proof_id=sid and reason='Fixture';
  if n<>1 then raise exception 'Audit event duplicated or missing'; end if;
  -- Real dispatch is transactional: pg_net sends nothing after rollback.
  update public.proof_submissions set verification_status='pending',ai_reviewed=false,submitted_at=clock_timestamp()+interval '3 seconds' where id=sid;
  update public.proof_review_jobs set next_attempt_at='2000-01-01' where submission_id=sid;
  perform public.dispatch_proof_reviews('https://cxujipeulvhreiryaptr.supabase.co/functions/v1/review-proof');
  select lease_token into tok from public.proof_review_jobs where submission_id=sid;
  if tok is null then raise exception 'Due job not dispatched'; end if;
  perform public.dispatch_proof_reviews('https://cxujipeulvhreiryaptr.supabase.co/functions/v1/review-proof');
  if (select lease_token is distinct from tok from public.proof_review_jobs where submission_id=sid) then raise exception 'Dispatcher duplicated lease'; end if;
  raise notice 'DURABLE_PROOF_REVIEW_CHECKS_PASSED';
end $$;
rollback;
