-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260928_follow_system.sql
-- Project:   cxujipeulvhreiryaptr (striv-mvp)
--
-- Makes the follow system actually usable. Written against LIVE schema.
-- Idempotent: safe to re-run.
--
-- Already live, nothing to add:
--   followers PK (follower_id, followed_id), CHECK (follower_id <> followed_id),
--   request_status text NOT NULL DEFAULT 'accepted'
--     CHECK (request_status IN ('pending','accepted','rejected')),
--   SELECT  "Followers are publicly readable"      USING (true)
--   INSERT  "Users can follow as themselves"       WITH CHECK (follower_id = auth.uid())
--   DELETE  "Users can unfollow as themselves"     USING (follower_id = auth.uid())
--   AFTER INSERT trigger on_new_follower -> notify_new_follower()
--
-- This migration adds:
--   1. A BEFORE INSERT trigger that decides request_status SERVER-SIDE from the
--      target's is_private flag. Without it, `request_status` defaults to
--      'accepted' and a client could follow straight into a private account.
--   2. An UPDATE policy so ONLY the followed user can accept or reject.
--   3. follow_request / follow_accepted notifications, so private-account
--      follows are not silent. Both notification types are already permitted by
--      notifications_type_check.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Server-side decision of request_status ───────────────────────────────
CREATE OR REPLACE FUNCTION public.set_follow_request_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Always overwrite whatever the client sent: this is the authorisation
  -- decision, so it cannot be an input.
  SELECT CASE WHEN COALESCE(p.is_private, false) THEN 'pending' ELSE 'accepted' END
    INTO NEW.request_status
    FROM public.profiles p
   WHERE p.id = NEW.followed_id;

  -- Unknown target: fail closed rather than defaulting to 'accepted'.
  IF NEW.request_status IS NULL THEN
    NEW.request_status := 'pending';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS before_follow_insert ON public.followers;
CREATE TRIGGER before_follow_insert
  BEFORE INSERT ON public.followers
  FOR EACH ROW EXECUTE FUNCTION public.set_follow_request_status();


-- ── 2. Only the followed user may accept or reject ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'followers'
       AND policyname = 'Followed user can accept or reject requests'
  ) THEN
    CREATE POLICY "Followed user can accept or reject requests"
      ON public.followers
      FOR UPDATE
      USING (followed_id = auth.uid())
      WITH CHECK (followed_id = auth.uid());
  END IF;
END $$;


-- ── 3. Notifications for the private-account path ───────────────────────────
-- Extends the existing AFTER INSERT trigger function to cover the 'pending'
-- case, which previously returned early and notified nobody.
CREATE OR REPLACE FUNCTION public.notify_new_follower()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
BEGIN
  SELECT full_name INTO v_name FROM public.profiles WHERE id = NEW.follower_id;

  IF NEW.request_status = 'accepted' THEN
    INSERT INTO public.notifications (user_id, type, title, message, related_user_id)
    VALUES (
      NEW.followed_id,
      'new_follower',
      'New follower',
      COALESCE(v_name, 'Someone') || ' started following you.',
      NEW.follower_id
    );
  ELSIF NEW.request_status = 'pending' THEN
    INSERT INTO public.notifications (user_id, type, title, message, related_user_id)
    VALUES (
      NEW.followed_id,
      'follow_request',
      'Follow request',
      COALESCE(v_name, 'Someone') || ' wants to follow you.',
      NEW.follower_id
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Tell the requester when they are let in. Fires only on the pending -> accepted
-- transition, so re-saving an already-accepted row never re-notifies.
CREATE OR REPLACE FUNCTION public.notify_follow_accepted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
BEGIN
  IF OLD.request_status = 'pending' AND NEW.request_status = 'accepted' THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE id = NEW.followed_id;

    INSERT INTO public.notifications (user_id, type, title, message, related_user_id)
    VALUES (
      NEW.follower_id,
      'follow_accepted',
      'Follow request accepted',
      COALESCE(v_name, 'Someone') || ' accepted your follow request.',
      NEW.followed_id
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_follow_accepted ON public.followers;
CREATE TRIGGER on_follow_accepted
  AFTER UPDATE ON public.followers
  FOR EACH ROW EXECUTE FUNCTION public.notify_follow_accepted();


-- ── Index for the "who requested to follow me" query ────────────────────────
CREATE INDEX IF NOT EXISTS followers_followed_pending_idx
  ON public.followers (followed_id)
  WHERE request_status = 'pending';
