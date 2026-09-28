-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260928_strivcoin.sql
-- Project:   cxujipeulvhreiryaptr (striv-mvp)
--
-- Written against the LIVE schema (see AGENTS.md). Idempotent.
--
-- ═══ STRIVCOIN — DESIGN CONTRACT ════════════════════════════════════════════
--
-- StrivCoin is a LOYALTY POINT, not money. Three rules keep it that way, and
-- every one of them is a deliberate business decision, not an implementation
-- detail:
--
--   1. EARNED ONLY, NEVER PURCHASED.
--      The moment money buys coins, this becomes a Prepaid Payment Instrument
--      under RBI rules and needs authorisation. There is deliberately no
--      purchase path anywhere in this schema.
--
--   2. NEVER CASHABLE, NEVER TRANSFERABLE BETWEEN USERS.
--      No user-to-user transfer exists. That keeps StrivUp out of payment-
--      system territory and off the money-laundering surface entirely.
--
--   3. COINS BUY ONLY ZERO-COST GOODS.
--      Streak freezes, cosmetics, challenge boosts — none has a cost of goods.
--      Real-world quest rewards stay funded by the sponsoring business via
--      quest_rewards; StrivUp is the access mechanism, never the payer.
--      Consequence: no balance-sheet liability under Ind AS 115, because
--      StrivUp never owes anything it would have to buy.
--
-- If any of those three ever changes, this stops being a loyalty programme and
-- starts being a financial product. Get advice before changing them.
--
-- ═══ ANTI-FARMING ═══════════════════════════════════════════════════════════
-- The economy is designed against a hostile user, not an honest one:
--   * Idempotency is STRUCTURAL — unique (user_id, reason, dedupe_key) means a
--     given action can physically only ever be credited once. No amount of
--     replaying, double-firing triggers or retrying can mint a second coin.
--   * Daily check-in dedupes on the calendar date, so refreshing earns nothing.
--   * Completing a challenge is the dangerous one: without guards, anyone could
--     create a 1-day private challenge, finish it, and repeat forever. Hence
--     the minimum duration, the consistency floor, and the reduced payout for
--     challenges you created yourself.
--   * A global daily cap backstops every non-completion source.
--
-- All writes go through SECURITY DEFINER functions. There is no INSERT policy
-- on the ledger, so a client holding the anon key cannot mint itself coins —
-- same posture as notifications.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── Economy constants, in one place ─────────────────────────────────────────
-- Anchored so an honest daily user earns ~6/day (1 check-in + 1 approved
-- proof) ≈ 40/week, and a streak freeze costs about a week of real effort.
CREATE OR REPLACE FUNCTION public.striv_coin_rules()
 RETURNS jsonb LANGUAGE sql IMMUTABLE
AS $function$
  SELECT jsonb_build_object(
    'daily_checkin',            1,
    'proof_approved',           5,
    'proof_approved_daily_max', 3,      -- credited proofs per day
    'challenge_joined',         2,
    'challenge_joined_weekly_max', 3,
    'challenge_complete_base',  10,
    'challenge_complete_per_day', 3,
    'challenge_complete_max',   300,
    'challenge_min_duration',   7,      -- shorter challenges earn nothing
    'challenge_min_consistency', 0.5,   -- must actually have done the work
    'self_created_multiplier',  0.25,   -- you can't farm your own challenges
    'quest_joined',             2,
    'quest_completed',          50,     -- business-verified, hardest to fake
    'daily_global_cap',         25      -- excludes completions
  );
$function$;


-- ── 1. The ledger ───────────────────────────────────────────────────────────
-- Append-only. Balance is derived, never stored, so it can always be
-- reconstructed and audited from the events that produced it.
CREATE TABLE IF NOT EXISTS public.striv_coin_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Positive = earned, negative = spent. Never update a row; append a new one.
  delta       integer NOT NULL,
  reason      text NOT NULL,
  -- The idempotency key. Combined with the unique index below, this is what
  -- makes double-crediting impossible rather than merely unlikely.
  dedupe_key  text NOT NULL,
  challenge_id uuid REFERENCES public.challenges(id) ON DELETE SET NULL,
  quest_id     uuid REFERENCES public.quests(id) ON DELETE SET NULL,
  proof_id     uuid REFERENCES public.proof_submissions(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT striv_coin_ledger_reason_check CHECK (reason = ANY (ARRAY[
    'daily_checkin', 'proof_approved', 'challenge_joined', 'challenge_completed',
    'quest_joined', 'quest_completed',
    'spend_streak_freeze', 'spend_cosmetic', 'spend_challenge_boost',
    'adjustment'
  ])),
  CONSTRAINT striv_coin_ledger_delta_check CHECK (delta <> 0)
);

-- Structural idempotency: one credit per (user, reason, key). Ever.
CREATE UNIQUE INDEX IF NOT EXISTS striv_coin_ledger_dedupe_idx
  ON public.striv_coin_ledger (user_id, reason, dedupe_key);

-- Balance and history reads.
CREATE INDEX IF NOT EXISTS striv_coin_ledger_user_created_idx
  ON public.striv_coin_ledger (user_id, created_at DESC);

ALTER TABLE public.striv_coin_ledger ENABLE ROW LEVEL SECURITY;

-- Read your own ledger. No INSERT/UPDATE/DELETE policy exists at all, so RLS
-- itself prevents a client from minting or editing coins.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='striv_coin_ledger'
       AND policyname='Users read their own coin ledger'
  ) THEN
    CREATE POLICY "Users read their own coin ledger"
      ON public.striv_coin_ledger FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;


-- ── 2. Balance ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.striv_coin_balance(p_user_id uuid DEFAULT NULL)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(delta), 0)::int
    FROM public.striv_coin_ledger
   WHERE user_id = COALESCE(p_user_id, auth.uid());
$function$;


-- ── 3. The single award path ────────────────────────────────────────────────
-- Everything that grants coins goes through here. Returns the amount actually
-- credited: 0 when it was a duplicate or hit a cap.
CREATE OR REPLACE FUNCTION public.award_striv_coins(
  p_user_id      uuid,
  p_reason       text,
  p_dedupe_key   text,
  p_amount       integer,
  p_challenge_id uuid DEFAULT NULL,
  p_quest_id     uuid DEFAULT NULL,
  p_proof_id     uuid DEFAULT NULL
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r          jsonb := public.striv_coin_rules();
  v_today    date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_count    integer;
  v_earned   integer;
  v_inserted integer;
BEGIN
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN 0;
  END IF;

  -- Per-reason frequency caps ------------------------------------------------
  IF p_reason = 'proof_approved' THEN
    SELECT count(*) INTO v_count
      FROM public.striv_coin_ledger
     WHERE user_id = p_user_id AND reason = 'proof_approved'
       AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today;
    IF v_count >= (r->>'proof_approved_daily_max')::int THEN
      RETURN 0;
    END IF;

  ELSIF p_reason = 'challenge_joined' THEN
    SELECT count(*) INTO v_count
      FROM public.striv_coin_ledger
     WHERE user_id = p_user_id AND reason = 'challenge_joined'
       AND created_at > now() - interval '7 days';
    IF v_count >= (r->>'challenge_joined_weekly_max')::int THEN
      RETURN 0;
    END IF;
  END IF;

  -- Global daily backstop. Completions are exempt: they are rare, hard-gated,
  -- and are the payoff the whole product is built around.
  IF p_reason NOT IN ('challenge_completed', 'quest_completed') THEN
    SELECT COALESCE(SUM(delta), 0) INTO v_earned
      FROM public.striv_coin_ledger
     WHERE user_id = p_user_id
       AND delta > 0
       AND reason NOT IN ('challenge_completed', 'quest_completed')
       AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today;
    IF v_earned + p_amount > (r->>'daily_global_cap')::int THEN
      RETURN 0;
    END IF;
  END IF;

  INSERT INTO public.striv_coin_ledger
    (user_id, delta, reason, dedupe_key, challenge_id, quest_id, proof_id)
  VALUES
    (p_user_id, p_amount, p_reason, p_dedupe_key, p_challenge_id, p_quest_id, p_proof_id)
  ON CONFLICT (user_id, reason, dedupe_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN CASE WHEN v_inserted > 0 THEN p_amount ELSE 0 END;
END;
$function$;


-- ── 4. Daily check-in ───────────────────────────────────────────────────────
-- Called by the app on load. Dedupes on the IST calendar date, so refreshing,
-- reopening or running two devices earns exactly one coin per day.
CREATE OR REPLACE FUNCTION public.claim_daily_checkin()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  RETURN public.award_striv_coins(
    v_uid,
    'daily_checkin',
    (now() AT TIME ZONE 'Asia/Kolkata')::date::text,
    (public.striv_coin_rules()->>'daily_checkin')::int
  );
END;
$function$;


-- ── 5. Triggers: proof approved ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.award_coins_proof_approved()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.verification_status = 'approved'
     AND OLD.verification_status IS DISTINCT FROM 'approved' THEN
    -- Dedupe on the submission id: a proof rejected then approved on appeal
    -- still only ever pays once.
    PERFORM public.award_striv_coins(
      NEW.user_id, 'proof_approved', NEW.id::text,
      (public.striv_coin_rules()->>'proof_approved')::int,
      NEW.challenge_id, NULL, NEW.id
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_proof_approved_award ON public.proof_submissions;
CREATE TRIGGER on_proof_approved_award
  AFTER UPDATE ON public.proof_submissions
  FOR EACH ROW EXECUTE FUNCTION public.award_coins_proof_approved();


-- ── 6. Triggers: challenge joined + completed ───────────────────────────────
CREATE OR REPLACE FUNCTION public.award_coins_challenge_joined()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- Dedupes on challenge_id, so leaving and rejoining never pays twice.
  PERFORM public.award_striv_coins(
    NEW.user_id, 'challenge_joined', NEW.challenge_id::text,
    (public.striv_coin_rules()->>'challenge_joined')::int,
    NEW.challenge_id
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_challenge_joined_award ON public.challenge_participants;
CREATE TRIGGER on_challenge_joined_award
  AFTER INSERT ON public.challenge_participants
  FOR EACH ROW EXECUTE FUNCTION public.award_coins_challenge_joined();


CREATE OR REPLACE FUNCTION public.award_coins_challenge_completed()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r         jsonb := public.striv_coin_rules();
  v_days    integer;
  v_creator uuid;
  v_proofs  integer;
  v_amount  integer;
BEGIN
  IF NOT (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed') THEN
    RETURN NEW;
  END IF;

  SELECT duration_days, creator_id INTO v_days, v_creator
    FROM public.challenges WHERE id = NEW.challenge_id;

  -- Guard 1: trivially short challenges pay nothing. Without this, a 1-day
  -- private challenge is an infinite coin printer.
  IF v_days IS NULL OR v_days < (r->>'challenge_min_duration')::int THEN
    RETURN NEW;
  END IF;

  -- Guard 2: you must actually have done the work. Completion status only
  -- means "showed up at least once"; coins demand real consistency.
  SELECT count(*) INTO v_proofs
    FROM public.proof_submissions
   WHERE challenge_id = NEW.challenge_id AND user_id = NEW.user_id
     AND verification_status = 'approved';

  IF v_proofs < ceil(v_days * (r->>'challenge_min_consistency')::numeric) THEN
    RETURN NEW;
  END IF;

  v_amount := LEAST(
    (r->>'challenge_complete_base')::int + v_days * (r->>'challenge_complete_per_day')::int,
    (r->>'challenge_complete_max')::int
  );

  -- Guard 3: finishing a challenge you created yourself pays a fraction, so
  -- self-dealing is never the efficient way to earn.
  IF v_creator = NEW.user_id THEN
    v_amount := GREATEST(1, floor(v_amount * (r->>'self_created_multiplier')::numeric)::int);
  END IF;

  PERFORM public.award_striv_coins(
    NEW.user_id, 'challenge_completed', NEW.challenge_id::text,
    v_amount, NEW.challenge_id
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_challenge_completed_award ON public.challenge_participants;
CREATE TRIGGER on_challenge_completed_award
  AFTER UPDATE ON public.challenge_participants
  FOR EACH ROW EXECUTE FUNCTION public.award_coins_challenge_completed();


-- ── 7. Triggers: quest joined + completed ───────────────────────────────────
-- Wired now so the economy is complete the moment the business side switches
-- on. quest_participants has no status column — completion is verification_status
-- reaching 'approved', which a business reviews, making it the hardest action
-- to fake and therefore the best paid.
CREATE OR REPLACE FUNCTION public.award_coins_quest_joined()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.award_striv_coins(
    NEW.user_id, 'quest_joined', NEW.quest_id::text,
    (public.striv_coin_rules()->>'quest_joined')::int,
    NULL, NEW.quest_id
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_quest_joined_award ON public.quest_participants;
CREATE TRIGGER on_quest_joined_award
  AFTER INSERT ON public.quest_participants
  FOR EACH ROW EXECUTE FUNCTION public.award_coins_quest_joined();


CREATE OR REPLACE FUNCTION public.award_coins_quest_completed()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.verification_status = 'approved'
     AND OLD.verification_status IS DISTINCT FROM 'approved' THEN
    PERFORM public.award_striv_coins(
      NEW.user_id, 'quest_completed', NEW.quest_id::text,
      (public.striv_coin_rules()->>'quest_completed')::int,
      NULL, NEW.quest_id
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_quest_completed_award ON public.quest_participants;
CREATE TRIGGER on_quest_completed_award
  AFTER UPDATE ON public.quest_participants
  FOR EACH ROW EXECUTE FUNCTION public.award_coins_quest_completed();


-- ── 8. Grants ───────────────────────────────────────────────────────────────
-- Only the two read paths and the check-in are reachable by a signed-in user.
-- award_striv_coins is NOT granted to anyone: if a client could call it, it
-- could mint arbitrary coins for itself. Triggers run as definer and need no
-- grant.
REVOKE ALL ON FUNCTION public.award_striv_coins(uuid, text, text, integer, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_coins_proof_approved()     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_coins_challenge_joined()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_coins_challenge_completed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_coins_quest_joined()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_coins_quest_completed()    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.claim_daily_checkin()          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.striv_coin_balance(uuid)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.striv_coin_rules()             FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_checkin()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.striv_coin_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.striv_coin_rules()       TO authenticated;
