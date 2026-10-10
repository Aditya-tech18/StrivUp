-- Applied to cxujipeulvhreiryaptr on 2026-10-10.
--
-- Streaks view: let the challenge_id filter reach the base table.
--
-- The previous definition referenced the `runs` CTE twice (once in FROM, once
-- in a correlated subquery for current_streak). Two references stop Postgres
-- inlining the CTE, a materialized CTE is an optimization fence, and the
-- consequence was that `where challenge_id = ?` was applied only after a
-- window function had already run over every approved proof in the table.
--
-- Opening a challenge page queries this view twice, so every page load was
-- computing streak runs for every user of every challenge and discarding all
-- but one. Measured on 60k synthetic proof rows across 300 challenges:
-- 97.3 ms with a 2,380-buffer temp spill before, 0.6 ms after.
--
-- Replacing the correlated subquery with array_agg leaves one reference, the
-- CTE inlines, and the filter pushes down into an index scan. Output is
-- unchanged: run_end_day is max(day_number) per run, so no two runs of the
-- same (challenge, user) can tie, and "first by run_end_day desc" picks the
-- same row either way. Verified equal across all 6,000 groups at 60k rows.
--
-- security_invoker stays on. Without it the view would run as its owner and
-- bypass the RLS on proof_submissions, exposing every user's proof history.
create or replace view public.streaks
with (security_invoker = true) as
with approved as (
  select challenge_id,
         user_id,
         day_number,
         day_number - row_number() over (
           partition by challenge_id, user_id order by day_number
         ) as grp
  from proof_submissions
  where verification_status = 'approved'
), runs as (
  select challenge_id,
         user_id,
         grp,
         count(*) as run_length,
         max(day_number) as run_end_day
  from approved
  group by challenge_id, user_id, grp
)
select challenge_id,
       user_id,
       max(run_length) as longest_streak,
       (array_agg(run_length order by run_end_day desc))[1] as current_streak
from runs
group by challenge_id, user_id;

-- Feeds the pushdown above, and the success-rate query on the challenge page
-- (challenge_id + verification_status, ordered by day_number). Every existing
-- index on this table leads with user_id or is the (challenge_id, user_id,
-- day_number) unique, neither of which can serve a per-challenge status scan.
create index if not exists idx_proof_submissions_challenge_status_day
  on public.proof_submissions (challenge_id, verification_status, day_number desc);

-- getChallengeTasks filters by challenge_id and orders by sort_order; the
-- table had only its primary key, so this was a sequential scan.
create index if not exists idx_challenge_tasks_challenge_sort
  on public.challenge_tasks (challenge_id, sort_order);

-- The ACTIVE participant count on every challenge page.
create index if not exists idx_challenge_participants_active
  on public.challenge_participants (challenge_id)
  where status = 'active';
