-- ════════════════════════════════════════════════════════════════════════════
-- Quest two-stage Order Verification  (NOT YET APPLIED — review, then apply)
--
-- Official STRIVUP Quest verification flow:
--   1. Participant taps "Post Proof" on an Order Verification task
--        → start_order_verification()  → Order code  SV-######  (OTP 1)
--   2. Participant adds OTP 1 to the Zomato/Swiggy order description.
--   3. Business sees the code on the order, searches it in STRIVUP, verifies
--        → business_verify_order()     → Bill code   BV-######  (OTP 2)
--      (or business_reject_order() with a reason)
--   4. Business writes OTP 2 on the bill; participant enters it
--        → redeem_bill_code()          → task completed, progress + leaderboard
--
-- Only step 4 counts toward progress. OTP 1 alone can never complete a task:
-- OTP 2 is bound to the original participant + task and is single-use.
--
-- Supersedes the unapplied 20260927120000_quest_visit_otp_and_review_guards
-- (single bill-code design on branch feat/quest-otp-loop) — do not apply both.
--
-- Additive except: business_verification_requests write policies are replaced
-- by read-only policies (all writes go through the functions below), and two
-- CHECK constraints are widened. Existing rows: 0 at time of writing.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Schema ───────────────────────────────────────────────────────────────

-- Task proof type + where "Order on Zomato / Swiggy" should send people.
ALTER TABLE public.quest_tasks DROP CONSTRAINT IF EXISTS quest_tasks_proof_type_check;
ALTER TABLE public.quest_tasks ADD CONSTRAINT quest_tasks_proof_type_check CHECK (proof_type = ANY (ARRAY[
  'photo', 'video', 'screenshot', 'photo_text', 'qr', 'bill_document', 'location', 'manual', 'none',
  'order_verification'
]));
ALTER TABLE public.quest_tasks ADD COLUMN IF NOT EXISTS order_link_zomato text;
ALTER TABLE public.quest_tasks ADD COLUMN IF NOT EXISTS order_link_swiggy text;

-- Verification requests gain a task, stage timestamps and a terminal state.
ALTER TABLE public.business_verification_requests
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.quest_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS business_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE public.business_verification_requests DROP CONSTRAINT IF EXISTS business_verification_requests_status_check;
ALTER TABLE public.business_verification_requests ADD CONSTRAINT business_verification_requests_status_check
  CHECK (status = ANY (ARRAY['pending', 'approved', 'rejected', 'expired', 'completed']));
-- pending   = OTP 1 issued, waiting for the business
-- approved  = business verified the order, OTP 2 issued, waiting for the participant
-- completed = participant redeemed OTP 2 → task completed
-- rejected  = business rejected the order        expired = OTP window elapsed

ALTER TABLE public.business_verification_requests DROP CONSTRAINT IF EXISTS business_verification_requests_verification_type_check;
ALTER TABLE public.business_verification_requests ADD CONSTRAINT business_verification_requests_verification_type_check
  CHECK (verification_type = ANY (ARRAY['business_visit', 'purchase', 'checkin', 'other', 'order']));

CREATE INDEX IF NOT EXISTS bvr_participant_task_idx
  ON public.business_verification_requests (participant_id, task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bvr_business_status_idx
  ON public.business_verification_requests (business_id, status, created_at DESC);

ALTER TABLE public.quest_events DROP CONSTRAINT IF EXISTS quest_events_event_type_check;
ALTER TABLE public.quest_events ADD CONSTRAINT quest_events_event_type_check CHECK (event_type = ANY (ARRAY[
  'view', 'open', 'join', 'task_submit', 'task_approve', 'task_reject', 'complete', 'reward_earn', 'share',
  'proof_code_generated', 'order_verified', 'order_rejected', 'otp_failed'
]));

-- ── 2. Access: read-only tables, writes only through the functions below ────
-- Previously both policies were FOR ALL with no column limits, so a participant
-- could insert/update their own row as 'approved' with a bill code of their
-- choosing and then redeem it.

DROP POLICY IF EXISTS bvr_participant ON public.business_verification_requests;
DROP POLICY IF EXISTS bvr_business    ON public.business_verification_requests;
DROP POLICY IF EXISTS bvr_participant_read ON public.business_verification_requests;
DROP POLICY IF EXISTS bvr_business_read    ON public.business_verification_requests;
CREATE POLICY bvr_participant_read ON public.business_verification_requests
  FOR SELECT USING (auth.uid() = participant_id);
CREATE POLICY bvr_business_read ON public.business_verification_requests
  FOR SELECT USING (auth.uid() = business_id);

-- ── 3. Code generators: CSPRNG, 6 digits, distinct prefixes ─────────────────
-- Old bill codes were STRIV-#### from random(): only 10,000 values under a
-- permanent UNIQUE constraint, so the generator would loop forever after
-- 10,000 orders. Distinct prefixes stop people typing OTP 1 where OTP 2 goes.

CREATE OR REPLACE FUNCTION public.strivup_random_digits(p_len integer)
RETURNS text LANGUAGE sql VOLATILE AS $$
  -- gen_random_uuid() is backed by a CSPRNG; take 32 random bits.
  SELECT lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint)
               % (10 ^ p_len)::bigint)::text, p_len, '0');
$$;

CREATE OR REPLACE FUNCTION public.generate_sv_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE code text;
BEGIN
  LOOP
    code := 'SV-' || strivup_random_digits(6);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM business_verification_requests WHERE sv_code = code);
  END LOOP;
  RETURN code;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_bill_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE code text;
BEGIN
  LOOP
    code := 'BV-' || strivup_random_digits(6);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM business_verification_requests WHERE bill_code = code);
  END LOOP;
  RETURN code;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_sv_code()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_bill_code() FROM PUBLIC, anon, authenticated;

-- Accepts "sv 123456", "SV123456", "sv-123456" → "SV-123456".
CREATE OR REPLACE FUNCTION public.normalize_strivup_code(p_code text, p_prefix text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN v ~ ('^' || p_prefix || '[0-9]{6}$') THEN p_prefix || '-' || substr(v, length(p_prefix) + 1)
    WHEN v ~ '^[0-9]{6}$' THEN p_prefix || '-' || v
    ELSE v
  END
  FROM (SELECT upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) AS v) s;
$$;

-- ── 4. Completion ───────────────────────────────────────────────────────────

-- Completes the participant when every required task has an approved
-- submission, and unlocks non-leaderboard rewards. Leaderboard rewards are
-- decided by rank at the end of the Quest, not here.
CREATE OR REPLACE FUNCTION public.evaluate_quest_completion(p_quest_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_part quest_participants%ROWTYPE;
BEGIN
  SELECT * INTO v_part FROM quest_participants
   WHERE quest_id = p_quest_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_part.completed_at IS NOT NULL THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM quest_tasks WHERE quest_id = p_quest_id AND is_required) THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1 FROM quest_tasks t
     WHERE t.quest_id = p_quest_id AND t.is_required
       AND NOT EXISTS (
         SELECT 1 FROM quest_task_submissions s
          WHERE s.task_id = t.id AND s.user_id = p_user_id AND s.verification_status = 'approved'
       )
  ) THEN
    RETURN false;
  END IF;

  UPDATE quest_participants
     SET verification_status = 'approved', completed_at = now(), reviewed_at = now()
   WHERE id = v_part.id;
  UPDATE quests SET completion_count = coalesce(completion_count, 0) + 1 WHERE id = p_quest_id;

  INSERT INTO quest_reward_claims (quest_id, reward_id, user_id, status)
  SELECT r.quest_id, r.id, p_user_id, 'eligible'
    FROM quest_rewards r
   WHERE r.quest_id = p_quest_id AND coalesce(r.is_leaderboard, false) = false
     AND NOT EXISTS (SELECT 1 FROM quest_reward_claims c WHERE c.reward_id = r.id AND c.user_id = p_user_id);

  INSERT INTO quest_events (quest_id, user_id, event_type) VALUES (p_quest_id, p_user_id, 'complete');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.evaluate_quest_completion(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Re-evaluate when a business approves a photo/manual task submission.
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

-- ── 5. Stage 1 — participant: Post Proof → OTP 1 ────────────────────────────

CREATE OR REPLACE FUNCTION public.start_order_verification(p_task_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_task  quest_tasks%ROWTYPE;
  v_quest quests%ROWTYPE;
  v_req   business_verification_requests%ROWTYPE;
  v_today integer;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;

  SELECT * INTO v_task FROM quest_tasks WHERE id = p_task_id;
  IF NOT FOUND OR v_task.proof_type <> 'order_verification' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_order_task');
  END IF;
  SELECT * INTO v_quest FROM quests WHERE id = v_task.quest_id;
  IF v_quest.business_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_business'); END IF;
  IF v_quest.creator_id = v_uid THEN RETURN jsonb_build_object('ok', false, 'error', 'own_quest'); END IF;
  IF v_quest.quest_status NOT IN ('active', 'published')
     OR (v_quest.start_date IS NOT NULL AND now() < v_quest.start_date)
     OR (v_quest.end_date   IS NOT NULL AND now() > v_quest.end_date) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'quest_not_active');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM quest_participants WHERE quest_id = v_quest.id AND user_id = v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_joined');
  END IF;
  IF EXISTS (SELECT 1 FROM quest_task_submissions
              WHERE task_id = p_task_id AND user_id = v_uid AND verification_status = 'approved') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_completed');
  END IF;

  -- Idempotent: an open attempt for this task is returned, not duplicated.
  SELECT * INTO v_req FROM business_verification_requests
   WHERE participant_id = v_uid AND task_id = p_task_id
     AND ((status = 'pending'  AND expires_at > now())
       OR (status = 'approved' AND NOT bill_code_used AND bill_code_expires_at > now()))
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'request_id', v_req.id, 'code', v_req.sv_code,
                              'status', v_req.status, 'expires_at', v_req.expires_at);
  END IF;

  -- Don't let one person flood a business with codes.
  SELECT count(*) INTO v_today FROM business_verification_requests
   WHERE participant_id = v_uid AND quest_id = v_quest.id AND created_at > now() - interval '24 hours';
  IF v_today >= 10 THEN RETURN jsonb_build_object('ok', false, 'error', 'too_many_codes'); END IF;

  INSERT INTO business_verification_requests
    (sv_code, participant_id, business_id, quest_id, task_id, verification_type, status, expires_at)
  VALUES
    (generate_sv_code(), v_uid, v_quest.business_id, v_quest.id, p_task_id, 'order', 'pending', now() + interval '24 hours')
  RETURNING * INTO v_req;

  INSERT INTO quest_events (quest_id, user_id, event_type, metadata)
  VALUES (v_quest.id, v_uid, 'proof_code_generated', jsonb_build_object('task_id', p_task_id));

  RETURN jsonb_build_object('ok', true, 'request_id', v_req.id, 'code', v_req.sv_code,
                            'status', v_req.status, 'expires_at', v_req.expires_at);
END;
$$;

-- ── 6. Stage 2 — business: verify (→ OTP 2) or reject ───────────────────────

CREATE OR REPLACE FUNCTION public.business_verify_order(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_code text := normalize_strivup_code(p_code, 'SV');
  v_req  business_verification_requests%ROWTYPE;
  v_bill text;
  v_exp  timestamptz := now() + interval '24 hours';
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;

  SELECT * INTO v_req FROM business_verification_requests
   WHERE sv_code = v_code AND business_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_req.status = 'approved' THEN
    RETURN jsonb_build_object('ok', true, 'bill_code', v_req.bill_code, 'expires_at', v_req.bill_code_expires_at, 'already', true);
  END IF;
  IF v_req.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'error', 'status_' || v_req.status); END IF;
  IF v_req.expires_at < now() THEN
    UPDATE business_verification_requests SET status = 'expired', updated_at = now() WHERE id = v_req.id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  v_bill := generate_bill_code();
  UPDATE business_verification_requests
     SET status = 'approved', business_verified_at = now(), bill_code = v_bill,
         bill_code_expires_at = v_exp, updated_at = now()
   WHERE id = v_req.id;

  IF v_req.quest_id IS NOT NULL THEN
    INSERT INTO quest_events (quest_id, user_id, event_type, metadata)
    VALUES (v_req.quest_id, v_req.participant_id, 'order_verified', jsonb_build_object('task_id', v_req.task_id));
  END IF;

  -- Never include the bill code: the participant must get it from the bill.
  PERFORM create_notification(v_req.participant_id, 'business_bill_code_generated',
    'Order verified ✓', 'Your order was verified. Enter the code written on your bill to complete the task.',
    NULL, NULL, v_req.quest_id);

  RETURN jsonb_build_object('ok', true, 'bill_code', v_bill, 'expires_at', v_exp);
END;
$$;

CREATE OR REPLACE FUNCTION public.business_reject_order(p_request_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req business_verification_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM business_verification_requests
   WHERE id = p_request_id AND business_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_req.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'error', 'status_' || v_req.status); END IF;

  UPDATE business_verification_requests
     SET status = 'rejected', rejection_reason = nullif(trim(p_reason), ''), updated_at = now()
   WHERE id = v_req.id;

  IF v_req.quest_id IS NOT NULL THEN
    INSERT INTO quest_events (quest_id, user_id, event_type, metadata)
    VALUES (v_req.quest_id, v_req.participant_id, 'order_rejected', jsonb_build_object('task_id', v_req.task_id));
  END IF;

  PERFORM create_notification(v_req.participant_id, 'business_verification_rejected',
    'Order could not be verified',
    coalesce('Reason: ' || nullif(trim(p_reason), ''), 'Your order could not be verified for this Quest.'),
    NULL, NULL, v_req.quest_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── 7. Stage 3 — participant: enter OTP 2 → task completed ──────────────────

CREATE OR REPLACE FUNCTION public.redeem_bill_code(p_task_id uuid, p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_code   text := normalize_strivup_code(p_code, 'BV');
  v_req    business_verification_requests%ROWTYPE;
  v_quest  quests%ROWTYPE;
  v_fails  integer;
  v_done   integer;
  v_total  integer;
  v_complete boolean;
  v_found  boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;

  -- Brute-force protection: 5 wrong codes per hour.
  SELECT count(*) INTO v_fails FROM quest_events
   WHERE user_id = v_uid AND event_type = 'otp_failed' AND created_at > now() - interval '1 hour';
  IF v_fails >= 5 THEN RETURN jsonb_build_object('ok', false, 'error', 'too_many_attempts'); END IF;

  SELECT * INTO v_req FROM business_verification_requests WHERE bill_code = v_code FOR UPDATE;
  v_found := FOUND;  -- captured now: the failure INSERT below would reset FOUND

  IF NOT v_found OR v_req.participant_id <> v_uid OR v_req.task_id IS DISTINCT FROM p_task_id THEN
    INSERT INTO quest_events (quest_id, user_id, event_type, metadata)
    SELECT t.quest_id, v_uid, 'otp_failed', jsonb_build_object('task_id', p_task_id)
      FROM quest_tasks t WHERE t.id = p_task_id;
    RETURN jsonb_build_object('ok', false,
      'error', CASE WHEN v_found THEN 'not_your_code' ELSE 'invalid_code' END,
      'attempts_left', greatest(0, 4 - v_fails));
  END IF;

  IF v_req.bill_code_used OR v_req.status = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_used');
  END IF;
  IF v_req.status <> 'approved' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_verified'); END IF;
  IF v_req.bill_code_expires_at < now() THEN
    UPDATE business_verification_requests SET status = 'expired', updated_at = now() WHERE id = v_req.id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  SELECT * INTO v_quest FROM quests WHERE id = v_req.quest_id;
  IF v_quest.quest_status NOT IN ('active', 'published')
     OR (v_quest.end_date IS NOT NULL AND now() > v_quest.end_date) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'quest_not_active');
  END IF;

  UPDATE business_verification_requests
     SET bill_code_used = true, status = 'completed', completed_at = now(), updated_at = now()
   WHERE id = v_req.id;

  INSERT INTO quest_task_submissions
    (quest_id, task_id, user_id, verification_status, caption, reviewed_at, submitted_at)
  VALUES
    (v_req.quest_id, p_task_id, v_uid, 'approved', 'Order verified · ' || v_req.sv_code || ' → ' || v_req.bill_code, now(), now())
  ON CONFLICT (quest_id, task_id, user_id) DO UPDATE
    SET verification_status = 'approved', caption = EXCLUDED.caption,
        rejection_reason = NULL, reviewed_at = now();

  INSERT INTO quest_events (quest_id, user_id, event_type, metadata)
  VALUES (v_req.quest_id, v_uid, 'task_approve', jsonb_build_object('task_id', p_task_id, 'via', 'order_verification'));

  v_complete := evaluate_quest_completion(v_req.quest_id, v_uid);

  SELECT count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM quest_task_submissions s
            WHERE s.task_id = t.id AND s.user_id = v_uid AND s.verification_status = 'approved')),
         count(*)
    INTO v_done, v_total
    FROM quest_tasks t WHERE t.quest_id = v_req.quest_id AND t.is_required;

  RETURN jsonb_build_object('ok', true, 'completed_tasks', v_done, 'total_tasks', v_total,
                            'quest_completed', v_complete);
END;
$$;

-- ── 8. Leaderboard (verified progress only) ─────────────────────────────────
-- Rank: more approved tasks first; ties → earlier latest verification first.
-- The caller's own row is always included, even outside the top p_limit.

CREATE OR REPLACE FUNCTION public.get_quest_leaderboard(p_quest_id uuid, p_limit integer DEFAULT 20)
RETURNS TABLE (rank bigint, user_id uuid, display_name text, avatar_url text,
               completed_tasks bigint, last_verified_at timestamptz, is_me boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH visible AS (
    SELECT id FROM quests
     WHERE id = p_quest_id
       AND (quest_status IN ('active', 'published', 'completed') OR creator_id = auth.uid())
  ),
  scores AS (
    SELECT s.user_id, count(*) AS completed_tasks, max(s.reviewed_at) AS last_verified_at
      FROM quest_task_submissions s
      JOIN quest_tasks t ON t.id = s.task_id
     WHERE s.quest_id IN (SELECT id FROM visible) AND s.verification_status = 'approved'
     GROUP BY s.user_id
  ),
  ranked AS (
    SELECT row_number() OVER (ORDER BY sc.completed_tasks DESC, sc.last_verified_at ASC, sc.user_id) AS rank,
           sc.user_id, coalesce(p.full_name, p.username, 'Participant') AS display_name, p.avatar_url,
           sc.completed_tasks, sc.last_verified_at, sc.user_id = auth.uid() AS is_me
      FROM scores sc LEFT JOIN profiles p ON p.id = sc.user_id
  )
  SELECT * FROM ranked
   WHERE rank <= greatest(1, least(p_limit, 100)) OR is_me
   ORDER BY rank;
$$;

REVOKE ALL ON FUNCTION public.start_order_verification(uuid)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.business_verify_order(text)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.business_reject_order(uuid, text)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.redeem_bill_code(uuid, text)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_quest_leaderboard(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_order_verification(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.business_verify_order(text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.business_reject_order(uuid, text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_bill_code(uuid, text)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quest_leaderboard(uuid, integer) TO authenticated;

-- ── 9. Self-approval guards ─────────────────────────────────────────────────
-- Participants could previously write verification_status = 'approved' on
-- their own quest completion, task submissions and challenge proofs, which
-- would bypass every verification above. These only restrict direct API
-- writes (current_user authenticated/anon); SECURITY DEFINER functions and
-- service-role edge functions are unaffected. They must stay SECURITY INVOKER,
-- otherwise current_user is always the owner and the guard never fires.

CREATE OR REPLACE FUNCTION public.is_platform_reviewer(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p
                  WHERE p.id = p_user AND (p.is_admin = true OR coalesce(p.moderator_role, 'none') <> 'none'));
$$;

CREATE OR REPLACE FUNCTION public.guard_quest_participant_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_quest quests%ROWTYPE; v_auto boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  SELECT * INTO v_quest FROM quests WHERE id = coalesce(NEW.quest_id, OLD.quest_id);
  IF v_quest.creator_id = auth.uid() OR is_platform_reviewer(auth.uid()) THEN RETURN NEW; END IF;

  -- Legacy single-step quests with no proof and no tasks complete on join.
  v_auto := coalesce(v_quest.proof_type = 'none', false)
            AND NOT EXISTS (SELECT 1 FROM quest_tasks WHERE quest_id = v_quest.id);

  IF TG_OP = 'INSERT' THEN
    IF NOT v_auto THEN NEW.verification_status := 'pending'; NEW.completed_at := NULL; END IF;
    NEW.reviewed_by := NULL; NEW.reviewed_at := NULL;
    RETURN NEW;
  END IF;

  NEW.user_id := OLD.user_id; NEW.quest_id := OLD.quest_id;
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
CREATE TRIGGER trg_guard_quest_participant_write BEFORE INSERT OR UPDATE ON public.quest_participants
  FOR EACH ROW EXECUTE FUNCTION public.guard_quest_participant_write();

CREATE OR REPLACE FUNCTION public.guard_quest_task_submission_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_proof text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM quests q WHERE q.id = coalesce(NEW.quest_id, OLD.quest_id) AND q.creator_id = auth.uid())
     OR is_platform_reviewer(auth.uid()) THEN
    RETURN NEW;
  END IF;
  SELECT proof_type INTO v_proof FROM quest_tasks WHERE id = coalesce(NEW.task_id, OLD.task_id);

  IF TG_OP = 'INSERT' THEN
    -- "No proof required" tasks may be self-completed; everything else waits for review.
    IF coalesce(v_proof, '') <> 'none' OR NEW.verification_status <> 'approved' THEN
      NEW.verification_status := 'pending';
    END IF;
    NEW.reviewed_by := NULL; NEW.reviewed_at := NULL;
    RETURN NEW;
  END IF;

  NEW.user_id := OLD.user_id; NEW.quest_id := OLD.quest_id; NEW.task_id := OLD.task_id;
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NEW.verification_status <> 'pending'
     AND NOT (coalesce(v_proof, '') = 'none' AND NEW.verification_status = 'approved') THEN
    NEW.verification_status := OLD.verification_status;
  END IF;
  NEW.reviewed_by := CASE WHEN NEW.reviewed_by IS NULL THEN NULL ELSE OLD.reviewed_by END;
  NEW.reviewed_at := CASE WHEN NEW.reviewed_at IS NULL THEN NULL ELSE OLD.reviewed_at END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_quest_task_submission_write ON public.quest_task_submissions;
CREATE TRIGGER trg_guard_quest_task_submission_write BEFORE INSERT OR UPDATE ON public.quest_task_submissions
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
    NEW.verification_status := 'pending'; NEW.reviewed_by := NULL; NEW.reviewed_at := NULL;
    NEW.ai_reviewed := false; NEW.ai_confidence := NULL; NEW.ai_classification := NULL; NEW.ai_reasoning := NULL;
    NEW.file_hash := NULL;
    NEW.admin_removed := false; NEW.admin_removed_by := NULL; NEW.admin_removed_at := NULL; NEW.admin_removal_reason := NULL;
    RETURN NEW;
  END IF;

  NEW.user_id := OLD.user_id; NEW.challenge_id := OLD.challenge_id;
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NEW.verification_status <> 'pending' THEN
    NEW.verification_status := OLD.verification_status;
  END IF;
  NEW.reviewed_by := CASE WHEN NEW.reviewed_by IS NULL THEN NULL ELSE OLD.reviewed_by END;
  NEW.reviewed_at := CASE WHEN NEW.reviewed_at IS NULL THEN NULL ELSE OLD.reviewed_at END;
  NEW.ai_confidence := OLD.ai_confidence; NEW.ai_classification := OLD.ai_classification;
  NEW.ai_reasoning := OLD.ai_reasoning;   NEW.file_hash := OLD.file_hash;
  NEW.admin_removed := OLD.admin_removed; NEW.admin_removed_by := OLD.admin_removed_by;
  NEW.admin_removed_at := OLD.admin_removed_at; NEW.admin_removal_reason := OLD.admin_removal_reason;
  -- Resubmission (back to pending) re-queues AI review.
  NEW.ai_reviewed := CASE WHEN NEW.verification_status = 'pending' AND OLD.verification_status <> 'pending'
                          THEN false ELSE OLD.ai_reviewed END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_proof_submission_write ON public.proof_submissions;
CREATE TRIGGER trg_guard_proof_submission_write BEFORE INSERT OR UPDATE ON public.proof_submissions
  FOR EACH ROW EXECUTE FUNCTION public.guard_proof_submission_write();
