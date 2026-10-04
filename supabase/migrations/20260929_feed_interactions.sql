-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260929_feed_interactions.sql
-- Project:   cxujipeulvhreiryaptr (striv-mvp)
--
-- Written against the LIVE schema (see AGENTS.md). Idempotent.
--
-- WHY
-- The like and comment buttons have existed in FeedCard since the first
-- version, rendering a hardcoded 0 and doing nothing when tapped — feed.ts
-- literally carried the comment "Likes/comments not in schema yet". Nothing was
-- broken; nothing was ever built. This is the schema half.
--
-- VISIBILITY
-- Likes and comments must inherit the visibility of the proof they hang off,
-- or a private challenge leaks through its comment threads. Rather than rely on
-- proof_submissions' own RLS applying inside these policies (referencing a table
-- from a policy is a recursion hazard), the condition is mirrored explicitly and
-- reuses the existing SECURITY DEFINER helper is_challenge_participant().
--
-- The mirrored rule, matching proof_submissions' SELECT policy:
--   own proof, OR (approved AND (public challenge
--                                OR own challenge
--                                OR participant))
-- plus admin_removed = false, so removed content takes its thread with it.
--
-- DELIBERATELY NOT EARNING STRIVCOINS
-- Likes and comments are the two cheapest actions in the product and the most
-- trivially farmable — like/unlike in a loop, or post "nice" a hundred times.
-- Paying for them would inflate the currency to meaninglessness. They are
-- social signal, not work. Only verified proof earns.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Likes ────────────────────────────────────────────────────────────────
-- Composite PK rather than a surrogate id: one like per person per proof is the
-- business rule, so let the primary key enforce it instead of application code.
CREATE TABLE IF NOT EXISTS public.proof_likes (
  proof_id   uuid NOT NULL REFERENCES public.proof_submissions(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proof_id, user_id)
);

-- Counting likes per proof for a page of feed posts.
CREATE INDEX IF NOT EXISTS proof_likes_proof_idx ON public.proof_likes (proof_id);

ALTER TABLE public.proof_likes ENABLE ROW LEVEL SECURITY;


-- ── 2. Comments ─────────────────────────────────────────────────────────────
-- parent_id supports the single level of replies the designs show. Self-
-- referencing cascade means deleting a comment takes its replies with it.
CREATE TABLE IF NOT EXISTS public.proof_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_id   uuid NOT NULL REFERENCES public.proof_submissions(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_id  uuid REFERENCES public.proof_comments(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Bounded so a comment cannot be used as free blob storage, and trimmed so
  -- whitespace-only comments are rejected by the database rather than the UI.
  CONSTRAINT proof_comments_body_check
    CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000)
);

CREATE INDEX IF NOT EXISTS proof_comments_proof_idx
  ON public.proof_comments (proof_id, created_at);

ALTER TABLE public.proof_comments ENABLE ROW LEVEL SECURITY;


-- ── 3. Shared visibility predicate ──────────────────────────────────────────
-- SECURITY DEFINER so the policies below can read proof_submissions and
-- challenges without tripping RLS recursion. It takes the viewer explicitly
-- rather than calling auth.uid() internally, so it is honest about its inputs.
CREATE OR REPLACE FUNCTION public.can_see_proof(p_proof_id uuid, p_viewer uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.proof_submissions ps
      JOIN public.challenges c ON c.id = ps.challenge_id
     WHERE ps.id = p_proof_id
       AND ps.admin_removed = false
       AND (
         ps.user_id = p_viewer
         OR (ps.verification_status = 'approved'
             AND (c.visibility = 'public'
                  OR c.creator_id = p_viewer
                  OR public.is_challenge_participant(c.id, p_viewer)))
       )
  );
$function$;

REVOKE ALL ON FUNCTION public.can_see_proof(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_proof(uuid, uuid) TO authenticated;


-- ── 4. Policies: likes ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
     AND tablename='proof_likes' AND policyname='Likes visible with the proof') THEN
    CREATE POLICY "Likes visible with the proof" ON public.proof_likes
      FOR SELECT USING (public.can_see_proof(proof_id, auth.uid()));
  END IF;

  -- You may only like as yourself, and only something you can actually see.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
     AND tablename='proof_likes' AND policyname='Users like as themselves') THEN
    CREATE POLICY "Users like as themselves" ON public.proof_likes
      FOR INSERT WITH CHECK (
        user_id = auth.uid() AND public.can_see_proof(proof_id, auth.uid())
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
     AND tablename='proof_likes' AND policyname='Users unlike as themselves') THEN
    CREATE POLICY "Users unlike as themselves" ON public.proof_likes
      FOR DELETE USING (user_id = auth.uid());
  END IF;
END $$;


-- ── 5. Policies: comments ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
     AND tablename='proof_comments' AND policyname='Comments visible with the proof') THEN
    CREATE POLICY "Comments visible with the proof" ON public.proof_comments
      FOR SELECT USING (public.can_see_proof(proof_id, auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
     AND tablename='proof_comments' AND policyname='Users comment as themselves') THEN
    CREATE POLICY "Users comment as themselves" ON public.proof_comments
      FOR INSERT WITH CHECK (
        user_id = auth.uid() AND public.can_see_proof(proof_id, auth.uid())
      );
  END IF;

  -- Editing your own wording is fine; moving a comment to another proof or
  -- another author is not, so those columns are pinned by the WITH CHECK.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
     AND tablename='proof_comments' AND policyname='Users edit their own comment') THEN
    CREATE POLICY "Users edit their own comment" ON public.proof_comments
      FOR UPDATE USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  -- The comment's author can delete it, and so can the owner of the proof it
  -- sits under — without that, someone can graffiti your proof and you have no
  -- way to clear it.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
     AND tablename='proof_comments' AND policyname='Author or proof owner deletes a comment') THEN
    CREATE POLICY "Author or proof owner deletes a comment" ON public.proof_comments
      FOR DELETE USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.proof_submissions ps
           WHERE ps.id = proof_comments.proof_id AND ps.user_id = auth.uid()
        )
      );
  END IF;
END $$;


-- ── 6. Notifications ────────────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'new_follower','proof_approved','proof_rejected','challenge_joined',
    'proof_removed','business_verification_approved',
    'business_verification_rejected','business_bill_code_generated',
    'quest_joined','quest_task_approved','quest_task_rejected',
    'quest_completed','quest_reward_earned','quest_reward_fulfilled',
    'follow_request','follow_accepted','challenge_completed',
    'proof_liked','proof_commented'
  ]));

-- Trigger-driven per the project rule that notifications are never written from
-- the client. Liking or commenting on your own proof notifies nobody.
CREATE OR REPLACE FUNCTION public.notify_proof_liked()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_owner uuid; v_name text;
BEGIN
  SELECT user_id INTO v_owner FROM public.proof_submissions WHERE id = NEW.proof_id;
  IF v_owner IS NULL OR v_owner = NEW.user_id THEN RETURN NEW; END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications
    (user_id, type, title, message, related_user_id, related_submission_id)
  VALUES (v_owner, 'proof_liked', 'New like',
          COALESCE(v_name,'Someone') || ' liked your proof.',
          NEW.user_id, NEW.proof_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_proof_liked ON public.proof_likes;
CREATE TRIGGER on_proof_liked
  AFTER INSERT ON public.proof_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_proof_liked();


CREATE OR REPLACE FUNCTION public.notify_proof_commented()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_owner uuid; v_name text;
BEGIN
  SELECT user_id INTO v_owner FROM public.proof_submissions WHERE id = NEW.proof_id;
  IF v_owner IS NULL OR v_owner = NEW.user_id THEN RETURN NEW; END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications
    (user_id, type, title, message, related_user_id, related_submission_id)
  VALUES (v_owner, 'proof_commented', 'New comment',
          COALESCE(v_name,'Someone') || ' commented: "' ||
            left(btrim(NEW.body), 80) ||
            CASE WHEN char_length(btrim(NEW.body)) > 80 THEN '…' ELSE '' END || '"',
          NEW.user_id, NEW.proof_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_proof_commented ON public.proof_comments;
CREATE TRIGGER on_proof_commented
  AFTER INSERT ON public.proof_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_proof_commented();

REVOKE ALL ON FUNCTION public.notify_proof_liked()     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_proof_commented() FROM PUBLIC, anon, authenticated;
