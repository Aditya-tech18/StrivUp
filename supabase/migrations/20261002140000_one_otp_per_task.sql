-- ONE TASK, ONE OTP, ONE USER.
-- Applied to cxujipeulvhreiryaptr.
--
-- WHAT WAS WRONG
-- A code expired 24 hours after it was issued, and uniqueness was scoped per
-- calendar day. A participant who took the code on 28 Sept and ordered on
-- 2 Oct hit "That verification code has expired" even though the Quest runs
-- to 28 Oct, and asking again would have minted a second code for the same
-- task.
--
-- THE RULE NOW
-- One live code per user per task, returned again on every request until the
-- task completes, valid for as long as the Quest runs. Minting a second code
-- would invalidate one the participant may already have typed into an order,
-- which is the failure this prevents.

-- 1. Codes live as long as their Quest.
update public.quest_order_verifications v
   set expires_at = coalesce(q.end_date, now() + interval '90 days')
  from public.quests q
 where q.id = v.quest_id
   and v.status in ('code_issued', 'order_verified');

alter table public.quest_order_verifications
  alter column expires_at set default (now() + interval '90 days');

-- 2. Uniqueness is per task, not per day. This index is strictly stronger
--    than the old qov_one_active_per_day, which is therefore redundant.
--    NOTE: dropping the old index timed out repeatedly through the MCP tool.
--    It is harmless (it can never reject anything this one does not already
--    reject) but should be dropped by hand in the SQL editor:
--        drop index if exists public.qov_one_active_per_day;
create unique index if not exists qov_one_active_per_task
  on public.quest_order_verifications (user_id, quest_id, task_id)
  where status in ('code_issued', 'order_verified');

-- 3. issue_quest_order_code returns the existing live code for this user and
--    task on any day, and stamps expiry from the Quest end date.
-- 4. business_verify_order_code only refuses once the Quest itself has ended,
--    rather than 24 hours after issue.
--
-- Both function bodies are applied live; see the repository history for the
-- full definitions.
