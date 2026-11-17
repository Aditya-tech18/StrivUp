-- Apply only after deploying the JWT-verified, leased review-proof worker and
-- setting proof_review_dispatch_config to the project's legacy public anon key.
select cron.schedule('proof-review-retries','* * * * *',
  $$select public.dispatch_proof_reviews('https://cxujipeulvhreiryaptr.supabase.co/functions/v1/review-proof');$$);
select cron.schedule('proof-review-history-cleanup','20 3 * * *',
  $$delete from cron.job_run_details where jobid in
    (select jobid from cron.job where jobname in ('proof-review-retries','proof-review-history-cleanup'))
    and end_time < now()-interval '7 days';$$);
