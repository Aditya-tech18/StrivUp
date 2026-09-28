-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260928_privacy_and_notification_fixes.sql
-- Project:   cxujipeulvhreiryaptr (striv-mvp)
--
-- Written against the LIVE schema, not against the other files in this folder
-- (see AGENTS.md — they have drifted). Idempotent: safe to re-run.
--
-- Three fixes, all verified against live state before writing:
--
--   S1  profile_challenge_stats and profile_heatmap run as the view OWNER and
--       ignore RLS (pg_class.reloptions IS NULL on both, while `streaks`
--       correctly has security_invoker=true). Any authenticated user can read
--       any other user's per-challenge stats and full submission heatmap —
--       including for PRIVATE challenges — just by passing a different
--       user_id. Today nothing does that, but the /u/[handle] public profile
--       route would make it a one-line exploit, and it defeats
--       profiles.is_private no matter how carefully the page is gated.
--
--   S2  Duplicate notification triggers. `followers` carries both
--       on_new_follower and trg_notify_follower (same function);
--       `proof_submissions` carries both on_proof_review_result and
--       trg_notify_proof (different functions, both firing on status change),
--       so every proof review produces two notifications.
--
--   S3  notify_new_follower passes p_message => NULL into create_notification,
--       but notifications.message is NOT NULL. The INSERT raises, and
--       create_notification's `EXCEPTION WHEN OTHERS THEN NULL` swallows it.
--       Net effect: follow notifications have never worked. Live count of
--       type='new_follower' is 0.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── S1. Make the two profile views respect the caller's RLS ──────────────────
-- Traced before applying: the owner keeps full access to their own profile,
-- because challenge_participants allows `user_id = auth.uid()`, challenges
-- allows participants, and proof_submissions allows `user_id = auth.uid()`.
-- A visitor keeps public-challenge stats and loses private-challenge stats,
-- which is the intended outcome.
ALTER VIEW public.profile_challenge_stats SET (security_invoker = on);
ALTER VIEW public.profile_heatmap         SET (security_invoker = on);


-- ── S2. Drop the duplicate triggers ─────────────────────────────────────────
-- followers: both triggers call notify_new_follower. Keep on_new_follower.
DROP TRIGGER IF EXISTS trg_notify_follower ON public.followers;

-- proof_submissions: the two triggers call DIFFERENT functions.
--   notify_proof_review_result  (kept)  — records related_submission_id, the
--       day number and the actual rejection_reason, and pins search_path.
--   notify_proof_reviewed       (dropped) — generic "was rejected.", no
--       submission reference, no reason, and routes through
--       create_notification, which swallows failures.
-- Keeping the informative one means a rejected participant now sees WHY.
DROP TRIGGER IF EXISTS trg_notify_proof ON public.proof_submissions;

-- The notify_proof_reviewed() function is left in place but is now unreferenced
-- by any trigger. Kept deliberately so the change is easy to inspect and
-- reverse; drop it once you are satisfied.


-- ── S3. Repair the follow notification ──────────────────────────────────────
-- Also pins search_path, which SECURITY DEFINER functions should always do and
-- which clears one of the Supabase security advisor warnings for this function.
--
-- Title/message are split to match the shape the alerts UI already renders for
-- proof notifications (short bold title, detail underneath).
CREATE OR REPLACE FUNCTION public.notify_new_follower()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
BEGIN
  -- A pending follow request is not a follow yet; private accounts notify on
  -- acceptance instead.
  IF NEW.request_status <> 'accepted' THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE id = NEW.follower_id;

  -- Inserted directly rather than via create_notification(), whose
  -- `EXCEPTION WHEN OTHERS THEN NULL` is what hid this bug for so long.
  INSERT INTO public.notifications (
    user_id, type, title, message, related_user_id
  ) VALUES (
    NEW.followed_id,
    'new_follower',
    'New follower',
    COALESCE(v_name, 'Someone') || ' started following you.',
    NEW.follower_id
  );

  RETURN NEW;
END;
$function$;
