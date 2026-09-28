-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260928_challenge_completion.sql
-- Project:   cxujipeulvhreiryaptr (striv-mvp)
--
-- Written against the LIVE schema (see AGENTS.md). Idempotent.
--
-- WHY
-- challenge_participants.status has always permitted 'completed', but nothing
-- in the codebase ever wrote it. Live: all 14 participations are 'active', zero
-- have completed_at, and 7 are already past their challenge's duration. So
-- nobody ever finishes anything — there is no payoff moment, "completed" on a
-- profile is permanently 0, and no completion-based badge could ever populate.
--
-- HOW COMPLETION IS DECIDED
-- Duration elapsed, and at least one approved proof  -> 'completed'
-- Duration elapsed, and no approved proof at all     -> 'dropped'
-- Still inside the duration, or open-ended           -> unchanged
--
-- The bar is deliberately "showed up at least once" rather than a percentage.
-- StrivUp's signal of quality is the consistency percentage already computed by
-- profile_challenge_stats — "Completed, 87% consistent" is more honest and more
-- useful than a binary pass/fail that most people would fail. Someone who never
-- submitted anything did not complete it, so they read as 'dropped'.
--
-- WHY A FUNCTION AND NOT A CRON JOB
-- pg_cron is available on this project but not installed. At current scale a
-- lazily-invoked, idempotent function avoids adding infrastructure, and the
-- guard clause makes it a cheap no-op on the overwhelming majority of calls.
-- To move it to a schedule later, install pg_cron and add one line:
--   select cron.schedule('settle-completions','5 0 * * *',
--                        $$select public.settle_challenge_completions()$$);
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Allow the new notification type ──────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'new_follower', 'proof_approved', 'proof_rejected', 'challenge_joined',
    'proof_removed', 'business_verification_approved',
    'business_verification_rejected', 'business_bill_code_generated',
    'quest_joined', 'quest_task_approved', 'quest_task_rejected',
    'quest_completed', 'quest_reward_earned', 'quest_reward_fulfilled',
    'follow_request', 'follow_accepted',
    -- new
    'challenge_completed'
  ]));


-- ── 2. Settle finished participations ───────────────────────────────────────
-- p_user_id NULL settles everyone (for a scheduled run); passing a user id
-- settles just that person, which is what the app does on page load.
--
-- Returns the number of rows that became 'completed', so a caller can decide
-- whether to show a celebration without a second query.
CREATE OR REPLACE FUNCTION public.settle_challenge_completions(p_user_id uuid DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_completed integer := 0;
BEGIN
  WITH due AS (
    SELECT cp.challenge_id,
           cp.user_id,
           EXISTS (
             SELECT 1 FROM public.proof_submissions ps
              WHERE ps.challenge_id = cp.challenge_id
                AND ps.user_id      = cp.user_id
                AND ps.verification_status = 'approved'
           ) AS showed_up
      FROM public.challenge_participants cp
      JOIN public.challenges c ON c.id = cp.challenge_id
     WHERE cp.status = 'active'
       AND c.duration_days IS NOT NULL
       -- Past the final day: joined_at + duration has elapsed.
       AND cp.joined_at + (c.duration_days || ' days')::interval < now()
       AND (p_user_id IS NULL OR cp.user_id = p_user_id)
  ),
  settled AS (
    UPDATE public.challenge_participants cp
       SET status       = CASE WHEN due.showed_up THEN 'completed' ELSE 'dropped' END,
           completed_at = CASE WHEN due.showed_up THEN now() ELSE NULL END
      FROM due
     WHERE cp.challenge_id = due.challenge_id
       AND cp.user_id      = due.user_id
    RETURNING cp.user_id, cp.challenge_id, cp.status
  )
  SELECT count(*)::int INTO v_completed FROM settled WHERE status = 'completed';

  RETURN v_completed;
END;
$function$;

REVOKE ALL ON FUNCTION public.settle_challenge_completions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_challenge_completions(uuid) TO authenticated;


-- ── 3. Celebrate it ─────────────────────────────────────────────────────────
-- Trigger-driven, per the project rule that notifications are never written
-- from the client. Fires only on the active -> completed transition, so
-- re-settling can never re-notify.
CREATE OR REPLACE FUNCTION public.notify_challenge_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_title text;
  v_days  int;
BEGIN
  IF OLD.status = 'active' AND NEW.status = 'completed' THEN
    SELECT title, duration_days INTO v_title, v_days
      FROM public.challenges WHERE id = NEW.challenge_id;

    INSERT INTO public.notifications (user_id, type, title, message, related_challenge_id)
    VALUES (
      NEW.user_id,
      'challenge_completed',
      'Challenge complete',
      'You finished ' || COALESCE(v_days || '-day ', '') ||
        '"' || COALESCE(v_title, 'your challenge') || '". That is a streak nobody can argue with.',
      NEW.challenge_id
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_challenge_completed ON public.challenge_participants;
CREATE TRIGGER on_challenge_completed
  AFTER UPDATE ON public.challenge_participants
  FOR EACH ROW EXECUTE FUNCTION public.notify_challenge_completed();


-- ── 4. Index for the settle query's guard clause ────────────────────────────
CREATE INDEX IF NOT EXISTS challenge_participants_active_idx
  ON public.challenge_participants (user_id)
  WHERE status = 'active';
