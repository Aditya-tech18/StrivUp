-- ════════════════════════════════════════════════════════════════════════════
-- Quest visit OTP loop + self-review guards
--
-- 1. Bill OTP verification for business quests:
--      business issues a one-time 6-digit code (printed/written on the bill)
--      → participant enters it in the app → visit recorded → progress N/M
--      → when all requirements are met the quest completes and rewards unlock.
-- 2. Completion is evaluated server-side (visits + required approved tasks).
-- 3. Guards so participants cannot approve their own proof / completion via
--    direct API writes (RLS allowed owners to update any column).
--
-- Additive only: no tables/columns dropped. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Schema ───────────────────────────────────────────────────────────────

-- 0 = quest does not use bill-OTP visits; N > 0 = N verified visits required.
ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS required_visits integer NOT NULL DEFAULT 0
  CHECK (required_visits >= 0 AND required_visits <= 100);

ALTER TABLE public.quest_events DROP CONSTRAINT IF EXISTS quest_events_event_type_check;
ALTER TABLE public.quest_events ADD CONSTRAINT quest_events_event_type_check CHECK (event_type = ANY (ARRAY[
  'view', 'open', 'join', 'task_submit', 'task_approve', 'task_reject', 'complete', 'reward_earn', 'share',
  'otp_issued', 'otp_failed', 'visit_verified'
]));

CREATE TABLE IF NOT EXISTS public.quest_visit_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id     uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  code         text NOT NULL CHECK (code ~ '^[0-9]{6}$'),
  issued_by    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,
  redeemed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- An unredeemed code is unique within its quest.
CREATE UNIQUE INDEX IF NOT EXISTS quest_visit_codes_open_uniq
  ON public.quest_visit_codes (quest_id, code) WHERE redeemed_at IS NULL;
CREATE INDEX IF NOT EXISTS quest_visit_codes_quest_idx
  ON public.quest_visit_codes (quest_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.quest_visits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id     uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_id      uuid NOT NULL UNIQUE REFERENCES public.quest_visit_codes(id) ON DELETE CASCADE,
  verified_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quest_visits_quest_user_idx
  ON public.quest_visits (quest_id, user_id);

ALTER TABLE public.quest_visit_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_visits      ENABLE ROW LEVEL SECURITY;

-- Codes: only the quest owner can read them. Writes happen via RPCs only.
DROP POLICY IF EXISTS qvc_owner_read ON public.quest_visit_codes;
CREATE POLICY qvc_owner_read ON public.quest_visit_codes
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.quests q WHERE q.id = quest_visit_codes.quest_id AND q.creator_id = auth.uid()
  ));

-- Visits: participant sees own, quest owner sees all for their quest.
DROP POLICY IF EXISTS qv_read ON public.quest_visits;
CREATE POLICY qv_read ON public.quest_visits
  FOR SELECT USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.quests q WHERE q.id = quest_visits.quest_id AND q.creator_id = auth.uid()
    )
  );

-- ── 2. Helpers ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_platform_reviewer(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = p_user AND (p.is_admin = true OR coalesce(p.moderator_role, 'none') <> 'none')
  );
$$;

-- Marks a participant complete when every requirement is met; unlocks rewards.
-- Returns true if the participant is (now or already) complete.
CREATE OR REPLACE FUNCTION public.evaluate_quest_completion(p_quest_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_quest     quests%ROWTYPE;
  v_part      quest_participants%ROWTYPE;
  v_has_tasks boolean;
  v_tasks_ok  boolean;
  v_visits    integer;
BEGIN
  SELECT * INTO v_quest FROM quests WHERE id = p_quest_id;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO v_part FROM quest_participants
   WHERE quest_id = p_quest_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_part.completed_at IS NOT NULL THEN RETURN true; END IF;

  v_has_tasks := EXISTS (SELECT 1 FROM quest_tasks WHERE quest_id = p_quest_id);
  -- Nothing measurable to complete → leave to manual review.
  IF NOT v_has_tasks AND v_quest.required_visits = 0 THEN RETURN false; END IF;

  v_tasks_ok := NOT EXISTS (
    SELECT 1 FROM quest_tasks t
     WHERE t.quest_id = p_quest_id AND t.is_required
       AND NOT EXISTS (
         SELECT 1 FROM quest_task_submissions s
          WHERE s.task_id = t.id AND s.user_id = p_user_id AND s.verification_status = 'approved'
       )
  );
  SELECT count(*) INTO v_visits FROM quest_visits WHERE quest_id = p_quest_id AND user_id = p_user_id;

  IF NOT v_tasks_ok OR v_visits < v_quest.required_visits THEN RETURN false; END IF;

  UPDATE quest_participants
     SET verification_status = 'approved', completed_at = now(), reviewed_at = now()
   WHERE id = v_part.id;

  UPDATE quests SET completion_count = coalesce(completion_count, 0) + 1 WHERE id = p_quest_id;

  -- Unlock every non-leaderboard reward for this participant.
  INSERT INTO quest_reward_claims (quest_id, reward_id, user_id, status)
  SELECT r.quest_id, r.id, p_user_id, 'eligible'
    FROM quest_rewards r
   WHERE r.quest_id = p_quest_id AND coalesce(r.is_leaderboard, false) = false
     AND NOT EXISTS (
       SELECT 1 FROM quest_reward_claims c WHERE c.reward_id = r.id AND c.user_id = p_user_id
     );

  INSERT INTO quest_events (quest_id, user_id, event_type) VALUES (p_quest_id, p_user_id, 'complete');
  RETURN true;
END;
$$;

-- ── 3. RPC: business issues a bill OTP ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.issue_quest_visit_code(p_quest_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_quest   quests%ROWTYPE;
  v_code    text;
  v_expires timestamptz := now() + interval '6 hours';
  v_try     integer := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;

  SELECT * INTO v_quest FROM quests WHERE id = p_quest_id;
  IF NOT FOUND OR v_quest.creator_id <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_quest_owner');
  END IF;
  IF v_quest.quest_status NOT IN ('active', 'published') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'quest_not_active');
  END IF;

  LOOP
    v_try := v_try + 1;
    -- gen_random_uuid() is backed by a CSPRNG; take 32 random bits → 6 digits.
    v_code := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');
    BEGIN
      INSERT INTO quest_visit_codes (quest_id, code, issued_by, expires_at)
      VALUES (p_quest_id, v_code, v_uid, v_expires);
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_try >= 10 THEN RETURN jsonb_build_object('ok', false, 'error', 'try_again'); END IF;
    END;
  END LOOP;

  -- user_id left NULL: quest_events.user_id references profiles, which business accounts may lack.
  INSERT INTO quest_events (quest_id, user_id, event_type) VALUES (p_quest_id, NULL, 'otp_issued');
  RETURN jsonb_build_object('ok', true, 'code', v_code, 'expires_at', v_expires);
END;
$$;

-- ── 4. RPC: participant redeems a bill OTP ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.redeem_quest_visit_code(p_quest_id uuid, p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_quest     quests%ROWTYPE;
  v_code_row  quest_visit_codes%ROWTYPE;
  v_fails     integer;
  v_visits    integer;
  v_completed boolean;
  v_code      text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;

  SELECT * INTO v_quest FROM quests WHERE id = p_quest_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'quest_not_found'); END IF;
  IF v_quest.creator_id = v_uid THEN RETURN jsonb_build_object('ok', false, 'error', 'own_quest'); END IF;
  IF v_quest.quest_status NOT IN ('active', 'published')
     OR (v_quest.start_date IS NOT NULL AND now() < v_quest.start_date)
     OR (v_quest.end_date   IS NOT NULL AND now() > v_quest.end_date) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'quest_not_active');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM quest_participants WHERE quest_id = p_quest_id AND user_id = v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_joined');
  END IF;

  -- Brute-force protection: max 5 wrong codes per user per hour.
  SELECT count(*) INTO v_fails FROM quest_events
   WHERE user_id = v_uid AND event_type = 'otp_failed' AND created_at > now() - interval '1 hour';
  IF v_fails >= 5 THEN RETURN jsonb_build_object('ok', false, 'error', 'too_many_attempts'); END IF;

  -- One verified visit per quest per day (IST) so a single bill can't count twice.
  IF EXISTS (
    SELECT 1 FROM quest_visits
     WHERE quest_id = p_quest_id AND user_id = v_uid
       AND (verified_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_verified_today');
  END IF;

  SELECT * INTO v_code_row FROM quest_visit_codes
   WHERE quest_id = p_quest_id AND code = v_code AND redeemed_at IS NULL AND expires_at > now()
   FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    INSERT INTO quest_events (quest_id, user_id, event_type) VALUES (p_quest_id, v_uid, 'otp_failed');
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code', 'attempts_left', greatest(0, 4 - v_fails));
  END IF;

  UPDATE quest_visit_codes SET redeemed_by = v_uid, redeemed_at = now() WHERE id = v_code_row.id;
  INSERT INTO quest_visits (quest_id, user_id, code_id) VALUES (p_quest_id, v_uid, v_code_row.id);
  INSERT INTO quest_events (quest_id, user_id, event_type) VALUES (p_quest_id, v_uid, 'visit_verified');

  SELECT count(*) INTO v_visits FROM quest_visits WHERE quest_id = p_quest_id AND user_id = v_uid;
  v_completed := evaluate_quest_completion(p_quest_id, v_uid);

  RETURN jsonb_build_object(
    'ok', true, 'visits', v_visits, 'required', v_quest.required_visits, 'completed', v_completed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.issue_quest_visit_code(uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.redeem_quest_visit_code(uuid, text)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.evaluate_quest_completion(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_quest_visit_code(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_quest_visit_code(uuid, text) TO authenticated;

-- ── 5. Re-evaluate completion when a reviewer approves a task ───────────────

CREATE OR REPLACE FUNCTION public.trg_quest_task_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.verification_status = 'approved' AND OLD.verification_status IS DISTINCT FROM 'approved' THEN
    PERFORM evaluate_quest_completion(NEW.quest_id, NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quest_task_approved ON public.quest_task_submissions;
CREATE TRIGGER trg_quest_task_approved
  AFTER UPDATE OF verification_status ON public.quest_task_submissions
  FOR EACH ROW EXECUTE FUNCTION public.trg_quest_task_approved();

-- ── 6. Self-review guards ───────────────────────────────────────────────────
-- Apply only to direct API writes (current_user = authenticated/anon). Server
-- code (SECURITY DEFINER functions, service_role edge functions) is unaffected.
-- These must stay SECURITY INVOKER: a definer function would always see the
-- owner role as current_user and the guard would never fire.
-- Non-reviewers may only move status to 'pending' (submit / resubmit).

CREATE OR REPLACE FUNCTION public.guard_quest_participant_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_quest quests%ROWTYPE;
  v_auto  boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  SELECT * INTO v_quest FROM quests WHERE id = coalesce(NEW.quest_id, OLD.quest_id);
  IF v_quest.creator_id = auth.uid() OR is_platform_reviewer(auth.uid()) THEN RETURN NEW; END IF;

  -- Legacy no-proof quests complete on join.
  v_auto := coalesce(v_quest.proof_type = 'none' AND v_quest.required_visits = 0, false)
            AND NOT EXISTS (SELECT 1 FROM quest_tasks WHERE quest_id = v_quest.id);

  IF TG_OP = 'INSERT' THEN
    IF NOT v_auto THEN
      NEW.verification_status := 'pending';
      NEW.completed_at := NULL;
    END IF;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    RETURN NEW;
  END IF;

  NEW.user_id  := OLD.user_id;
  NEW.quest_id := OLD.quest_id;
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NEW.verification_status <> 'pending' THEN
    NEW.verification_status := OLD.verification_status;
  END IF;
  NEW.completed_at := OLD.completed_at;
  NEW.reviewed_by  := CASE WHEN NEW.reviewed_by IS NULL THEN NULL ELSE OLD.reviewed_by END;
  NEW.reviewed_at  := CASE WHEN NEW.reviewed_at IS NULL THEN NULL ELSE OLD.reviewed_at END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_quest_participant_write ON public.quest_participants;
CREATE TRIGGER trg_guard_quest_participant_write
  BEFORE INSERT OR UPDATE ON public.quest_participants
  FOR EACH ROW EXECUTE FUNCTION public.guard_quest_participant_write();

CREATE OR REPLACE FUNCTION public.guard_quest_task_submission_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM quests q WHERE q.id = coalesce(NEW.quest_id, OLD.quest_id) AND q.creator_id = auth.uid())
     OR is_platform_reviewer(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.verification_status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    RETURN NEW;
  END IF;

  NEW.user_id  := OLD.user_id;
  NEW.quest_id := OLD.quest_id;
  NEW.task_id  := OLD.task_id;
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NEW.verification_status <> 'pending' THEN
    NEW.verification_status := OLD.verification_status;
  END IF;
  NEW.reviewed_by := CASE WHEN NEW.reviewed_by IS NULL THEN NULL ELSE OLD.reviewed_by END;
  NEW.reviewed_at := CASE WHEN NEW.reviewed_at IS NULL THEN NULL ELSE OLD.reviewed_at END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_quest_task_submission_write ON public.quest_task_submissions;
CREATE TRIGGER trg_guard_quest_task_submission_write
  BEFORE INSERT OR UPDATE ON public.quest_task_submissions
  FOR EACH ROW EXECUTE FUNCTION public.guard_quest_task_submission_write();

CREATE OR REPLACE FUNCTION public.guard_proof_submission_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM challenges c WHERE c.id = coalesce(NEW.challenge_id, OLD.challenge_id) AND c.creator_id = auth.uid())
     OR is_platform_reviewer(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.verification_status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.ai_reviewed := false;
    NEW.ai_confidence := NULL;
    NEW.ai_classification := NULL;
    NEW.ai_reasoning := NULL;
    NEW.file_hash := NULL;
    NEW.admin_removed := false;
    NEW.admin_removed_by := NULL;
    NEW.admin_removed_at := NULL;
    NEW.admin_removal_reason := NULL;
    RETURN NEW;
  END IF;

  NEW.user_id      := OLD.user_id;
  NEW.challenge_id := OLD.challenge_id;
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NEW.verification_status <> 'pending' THEN
    NEW.verification_status := OLD.verification_status;
  END IF;
  NEW.reviewed_by := CASE WHEN NEW.reviewed_by IS NULL THEN NULL ELSE OLD.reviewed_by END;
  NEW.reviewed_at := CASE WHEN NEW.reviewed_at IS NULL THEN NULL ELSE OLD.reviewed_at END;
  NEW.ai_confidence     := OLD.ai_confidence;
  NEW.ai_classification := OLD.ai_classification;
  NEW.ai_reasoning      := OLD.ai_reasoning;
  NEW.file_hash         := OLD.file_hash;
  NEW.admin_removed        := OLD.admin_removed;
  NEW.admin_removed_by     := OLD.admin_removed_by;
  NEW.admin_removed_at     := OLD.admin_removed_at;
  NEW.admin_removal_reason := OLD.admin_removal_reason;
  -- Resubmission (back to pending) re-queues AI review; otherwise keep AI state.
  NEW.ai_reviewed := CASE
    WHEN NEW.verification_status = 'pending' AND OLD.verification_status <> 'pending' THEN false
    ELSE OLD.ai_reviewed
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_proof_submission_write ON public.proof_submissions;
CREATE TRIGGER trg_guard_proof_submission_write
  BEFORE INSERT OR UPDATE ON public.proof_submissions
  FOR EACH ROW EXECUTE FUNCTION public.guard_proof_submission_write();
