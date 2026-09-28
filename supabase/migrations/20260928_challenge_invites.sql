-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260928_challenge_invites.sql
-- Project:   cxujipeulvhreiryaptr (striv-mvp)
--
-- Written against the LIVE schema (see AGENTS.md). Idempotent.
--
-- WHY
-- The challenge detail page tells people "This challenge is private. You need an
-- invitation to join." — but no invitation mechanism existed anywhere. Private
-- challenges were therefore unjoinable, which makes the only launch-viable
-- social unit (a creator plus a handful of friends) impossible to form.
--
-- SECURITY HOLE CLOSED HERE
-- challenge_participants' INSERT policy was WITH CHECK (user_id = auth.uid())
-- and nothing else — it never verified the challenge was joinable. Anyone
-- holding a private challenge's UUID could insert themselves as a participant,
-- and `challenges`' SELECT policy grants participants read access, so they would
-- then see the whole private challenge. This migration narrows direct inserts to
-- public challenges (plus the creator's own), and routes private joins through a
-- code-checked SECURITY DEFINER function instead.
--
-- VISIBILITY MODEL
-- No change to the visibility CHECK ('public' | 'private') is needed. The three
-- modes in the designs map onto the existing two values:
--   Social       -> visibility 'public'
--   Friends Only -> visibility 'private' + an issued invite_code
--   Personal     -> visibility 'private', no code ever issued
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. The code column ──────────────────────────────────────────────────────
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS invite_code text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'challenges_invite_code_key'
  ) THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT challenges_invite_code_key UNIQUE (invite_code);
  END IF;
END $$;


-- ── 2. Code generator ───────────────────────────────────────────────────────
-- 8 characters from a Crockford-style alphabet: no I, L, O, U, 0 or 1, so a
-- code read aloud or copied off a screen cannot be mistyped into a different
-- valid code. ~1.1e12 combinations, retried on the (vanishingly rare) clash.
CREATE OR REPLACE FUNCTION public.generate_challenge_invite_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  code text;
  taken boolean;
  i int;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
    END LOOP;

    SELECT EXISTS(SELECT 1 FROM public.challenges WHERE invite_code = code) INTO taken;
    EXIT WHEN NOT taken;
  END LOOP;

  RETURN code;
END;
$function$;


-- ── 3. Issue (or rotate) a challenge's invite code ──────────────────────────
-- Creator-only. Rotating invalidates every link already shared, which is the
-- only way to revoke access for someone who was passed a link.
CREATE OR REPLACE FUNCTION public.ensure_challenge_invite_code(
  p_challenge_id uuid,
  p_rotate boolean DEFAULT false
)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_creator uuid;
  v_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT creator_id, invite_code INTO v_creator, v_code
    FROM public.challenges WHERE id = p_challenge_id;

  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'Challenge not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_creator <> auth.uid() THEN
    RAISE EXCEPTION 'Only the creator can issue an invite link' USING ERRCODE = '42501';
  END IF;

  IF v_code IS NULL OR p_rotate THEN
    v_code := public.generate_challenge_invite_code();
    UPDATE public.challenges SET invite_code = v_code WHERE id = p_challenge_id;
  END IF;

  RETURN v_code;
END;
$function$;


-- ── 4. Join by invite code ──────────────────────────────────────────────────
-- SECURITY DEFINER so the caller does not need SELECT on a private challenge in
-- order to join it. auth.uid() is a session setting, not a role, so it still
-- resolves to the real caller inside this function — the identity is never the
-- definer's.
--
-- Idempotent: joining twice returns the same challenge rather than erroring, so
-- a re-tapped link is harmless.
CREATE OR REPLACE FUNCTION public.join_challenge_by_invite(p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_challenge_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Codes are stored uppercase; accept any casing from the URL.
  SELECT id INTO v_challenge_id
    FROM public.challenges
   WHERE invite_code = upper(btrim(p_code));

  IF v_challenge_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite link' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.challenge_participants (challenge_id, user_id, status)
  VALUES (v_challenge_id, v_uid, 'active')
  ON CONFLICT (challenge_id, user_id) DO NOTHING;

  RETURN v_challenge_id;
END;
$function$;


-- ── 5. Close the direct-insert hole ─────────────────────────────────────────
-- Direct inserts are now limited to challenges the person can legitimately see
-- and join on their own: public ones, and their own. Everything else must come
-- through join_challenge_by_invite above.
--
-- The existing join paths (explore list, challenge detail, create-then-join)
-- only ever insert for public challenges or the creator's own, so none of them
-- break.
DROP POLICY IF EXISTS "Users can join challenges themselves" ON public.challenge_participants;

CREATE POLICY "Users can join public challenges themselves"
  ON public.challenge_participants
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.challenges c
       WHERE c.id = challenge_participants.challenge_id
         AND (c.visibility = 'public' OR c.creator_id = auth.uid())
    )
  );


-- ── 6. Keep these off the anonymous API surface ─────────────────────────────
-- The security advisors already flag every SECURITY DEFINER function that anon
-- can reach via /rest/v1/rpc. Don't add three more.
REVOKE ALL ON FUNCTION public.generate_challenge_invite_code() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ensure_challenge_invite_code(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_challenge_by_invite(text) FROM PUBLIC, anon;

-- The generator is an internal helper — only the other two functions call it.
GRANT EXECUTE ON FUNCTION public.ensure_challenge_invite_code(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_challenge_by_invite(text) TO authenticated;
