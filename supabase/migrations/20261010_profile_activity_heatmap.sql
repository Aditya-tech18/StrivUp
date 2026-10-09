-- Applied to the live project (cxujipeulvhreiryaptr) via Supabase MCP on
-- 2026-10-10. Recorded here so the file tree matches what is deployed; see
-- AGENTS.md on this folder having drifted from the live schema.
--
-- profile_activity_heatmap — every kind of proof, in one grid.
--
-- profile_heatmap reads proof_submissions only, so quest task submissions had
-- never coloured a square. At the time of writing the live database held 5
-- quest submissions and not one reached the profile. It also counted
-- admin-removed proofs, which should not keep crediting a streak.
--
-- profile_heatmap is left in place: the profile still offers a per-challenge
-- view and that view backs it.
--
-- security_invoker = on so the underlying RLS applies. Both source tables are
-- owner-scoped on SELECT; without this the view would run as owner and expose
-- everyone's activity.

CREATE OR REPLACE VIEW public.profile_activity_heatmap
WITH (security_invoker = on) AS
SELECT
  user_id,
  submission_date,
  SUM(challenge_count)::integer + SUM(quest_count)::integer AS submission_count,
  SUM(challenge_count)::integer AS challenge_count,
  SUM(quest_count)::integer     AS quest_count
FROM (
  SELECT user_id, date(submitted_at) AS submission_date,
         count(*) AS challenge_count, 0 AS quest_count
  FROM public.proof_submissions
  WHERE verification_status = ANY (ARRAY['approved'::text, 'pending'::text])
    AND admin_removed = false
  GROUP BY user_id, date(submitted_at)
  UNION ALL
  SELECT user_id, date(submitted_at) AS submission_date,
         0 AS challenge_count, count(*) AS quest_count
  FROM public.quest_task_submissions
  WHERE verification_status = ANY (ARRAY['approved'::text, 'pending'::text])
  GROUP BY user_id, date(submitted_at)
) sources
GROUP BY user_id, submission_date;

GRANT SELECT ON public.profile_activity_heatmap TO authenticated;
