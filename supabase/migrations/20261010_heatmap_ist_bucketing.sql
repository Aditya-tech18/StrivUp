-- Applied to the live project (cxujipeulvhreiryaptr) via Supabase MCP on
-- 2026-10-10. Recorded here so the file tree matches what is deployed.
--
-- Bucket heatmap days by India time, not UTC.
--
-- date(submitted_at) resolves in the database's timezone, which is UTC. India
-- is UTC+5:30, so anything posted between 00:00 and 05:30 IST was credited to
-- the previous day's square. For a product whose whole point is "did you show
-- up today", that is the wrong day.
--
-- 'Asia/Kolkata' rather than a fixed +05:30 so the conversion stays correct if
-- India ever adopts DST, and because a named zone states the intent.
--
-- NOT A STREAK CHANGE: streaks keys off proof_submissions.day_number, not off
-- any date, so streak counts are untouched.
--
-- The client axis matches this — see todayInIndia() in ActivityHeatmap.tsx.

CREATE OR REPLACE VIEW public.profile_activity_heatmap
WITH (security_invoker = on) AS
SELECT
  user_id,
  submission_date,
  SUM(challenge_count)::integer + SUM(quest_count)::integer AS submission_count,
  SUM(challenge_count)::integer AS challenge_count,
  SUM(quest_count)::integer     AS quest_count
FROM (
  SELECT user_id, date(submitted_at AT TIME ZONE 'Asia/Kolkata') AS submission_date,
         count(*) AS challenge_count, 0 AS quest_count
  FROM public.proof_submissions
  WHERE verification_status = ANY (ARRAY['approved'::text, 'pending'::text])
    AND admin_removed = false
  GROUP BY user_id, date(submitted_at AT TIME ZONE 'Asia/Kolkata')
  UNION ALL
  SELECT user_id, date(submitted_at AT TIME ZONE 'Asia/Kolkata') AS submission_date,
         0 AS challenge_count, count(*) AS quest_count
  FROM public.quest_task_submissions
  WHERE verification_status = ANY (ARRAY['approved'::text, 'pending'::text])
  GROUP BY user_id, date(submitted_at AT TIME ZONE 'Asia/Kolkata')
) sources
GROUP BY user_id, submission_date;

REVOKE ALL ON public.profile_activity_heatmap FROM anon;
GRANT SELECT ON public.profile_activity_heatmap TO authenticated;

-- Same treatment for the per-challenge view, so switching the selector cannot
-- move a square by a day. It also gains the admin_removed filter the combined
-- view already had.
CREATE OR REPLACE VIEW public.profile_heatmap
WITH (security_invoker = on) AS
SELECT
  user_id,
  challenge_id,
  date(submitted_at AT TIME ZONE 'Asia/Kolkata') AS submission_date,
  count(*)::integer AS submission_count
FROM public.proof_submissions
WHERE verification_status = ANY (ARRAY['approved'::text, 'pending'::text])
  AND admin_removed = false
GROUP BY user_id, challenge_id, date(submitted_at AT TIME ZONE 'Asia/Kolkata');

REVOKE ALL ON public.profile_heatmap FROM anon;
GRANT SELECT ON public.profile_heatmap TO authenticated;
