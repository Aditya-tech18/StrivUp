/*
 * supabase/tests/rewards_security_test.sql
 *
 * The rewards system is the part of STRIVUP that decides who gets money, so
 * these are the assertions that matter most. They check the two things that
 * cannot be allowed to regress: the compliance gate on cash, and the fact
 * that an ordinary signed-in user cannot write to any table that decides
 * what they are owed.
 *
 * HOW TO RUN
 *   psql "$DATABASE_URL" -f supabase/tests/rewards_security_test.sql
 *
 * As with the other suites here, the block ends by raising
 * ALL_TESTS_PASSED_ROLLBACK on purpose — that error IS the pass signal, and
 * it rolls back every row the test created, so this is safe to run against a
 * real database. Anything starting FAILURES: is a real failure.
 */
DO $test$
DECLARE
  v_me      uuid := (SELECT id FROM profiles ORDER BY created_at LIMIT 1);
  v_other   uuid := (SELECT id FROM profiles ORDER BY created_at DESC LIMIT 1);
  v_quest   uuid := (SELECT id FROM quests LIMIT 1);
  v_camp    uuid;
  v_alloc   uuid;
  v_def     uuid := (SELECT id FROM quest_rewards LIMIT 1);
  v_claim   uuid;
  v_cnt     integer;
  v_fail    text[] := ARRAY[]::text[];
BEGIN
  IF v_me IS NULL OR v_other IS NULL OR v_me = v_other THEN
    RAISE EXCEPTION 'need at least two profiles to run these tests';
  END IF;
  IF v_quest IS NULL THEN
    RAISE EXCEPTION 'need at least one quest to run these tests';
  END IF;

  /* ── 1. The compliance gate ──────────────────────────────────────────
     Cash must not be enableable without an approved campaign AND a named
     reviewer. This is the control that stops an unreviewed prize contest
     from paying out. */
  INSERT INTO reward_campaigns (name) VALUES ('TEST gate') RETURNING id INTO v_camp;

  BEGIN
    UPDATE reward_campaigns SET cash_enabled = true WHERE id = v_camp;
    v_fail := v_fail || 'cash was enabled on a draft campaign';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    UPDATE reward_campaigns SET status = 'approved', cash_enabled = true WHERE id = v_camp;
    v_fail := v_fail || 'cash was enabled with no reviewer recorded';
  EXCEPTION WHEN check_violation THEN NULL; END;

  /* The one path that should work. */
  UPDATE reward_campaigns
     SET status = 'approved', compliance_reviewed_by = v_me,
         compliance_reviewed_at = now(), cash_enabled = true
   WHERE id = v_camp;
  IF NOT (SELECT cash_enabled FROM reward_campaigns WHERE id = v_camp) THEN
    v_fail := v_fail || 'a reviewed, approved campaign could not enable cash';
  END IF;

  /* ── 2. Duplicate allocation ────────────────────────────────────────
     One person must not collect the same reward definition twice, however
     many times the allocator runs. */
  INSERT INTO reward_allocations (user_id, campaign_id, type, source_quest_id, amount_minor)
  VALUES (v_other, v_camp, 'cash', v_quest, 10000) RETURNING id INTO v_alloc;

  IF v_def IS NOT NULL THEN
    INSERT INTO reward_allocations (user_id, campaign_id, type, source_quest_id, amount_minor, quest_reward_id)
    VALUES (v_other, v_camp, 'cash', v_quest, 10000, v_def);
    BEGIN
      INSERT INTO reward_allocations (user_id, campaign_id, type, source_quest_id, amount_minor, quest_reward_id)
      VALUES (v_other, v_camp, 'cash', v_quest, 10000, v_def);
      v_fail := v_fail || 'the same reward definition was allocated twice to one user';
    EXCEPTION WHEN unique_violation THEN NULL; END;
  END IF;

  /* ── 3. "Paid" needs evidence, and only one payout may be live ──────── */
  INSERT INTO reward_claims (allocation_id, user_id) VALUES (v_alloc, v_other) RETURNING id INTO v_claim;

  BEGIN
    INSERT INTO payouts (claim_id, user_id, amount_minor, idempotency_key, status)
    VALUES (v_claim, v_other, 10000, 'test-evidence', 'succeeded');
    v_fail := v_fail || 'a payout was marked succeeded with no reference or confirmer';
  EXCEPTION WHEN check_violation THEN NULL; END;

  INSERT INTO payouts (claim_id, user_id, amount_minor, idempotency_key)
  VALUES (v_claim, v_other, 10000, 'test-live-1');
  BEGIN
    INSERT INTO payouts (claim_id, user_id, amount_minor, idempotency_key)
    VALUES (v_claim, v_other, 10000, 'test-live-2');
    v_fail := v_fail || 'two live payouts were created for one claim';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  /* ── 4. What an ordinary signed-in user can do ───────────────────────
     Everything below runs as `authenticated` with a real uid, which is the
     role the browser actually uses. */
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_me, 'role', 'authenticated')::text, true);

  BEGIN
    INSERT INTO reward_allocations (user_id, campaign_id, type, source_quest_id, amount_minor)
    VALUES (v_me, v_camp, 'cash', v_quest, 999999);
    v_fail := v_fail || 'a user allocated themselves a reward';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;

  BEGIN
    UPDATE reward_allocations SET amount_minor = 999999 WHERE user_id = v_other;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    IF v_cnt > 0 THEN v_fail := v_fail || 'a user changed another users reward amount'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  SELECT count(*) INTO v_cnt FROM reward_allocations WHERE user_id = v_other;
  IF v_cnt > 0 THEN v_fail := v_fail || 'a user read another users rewards'; END IF;

  SELECT count(*) INTO v_cnt FROM payout_destinations WHERE user_id = v_other;
  IF v_cnt > 0 THEN v_fail := v_fail || 'a user read another users payout destination'; END IF;

  BEGIN
    INSERT INTO payouts (claim_id, user_id, amount_minor, idempotency_key)
    VALUES (gen_random_uuid(), v_me, 50000, 'test-user-payout');
    v_fail := v_fail || 'a user created a payout';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RESET ROLE;

  IF array_length(v_fail, 1) IS NULL THEN
    RAISE EXCEPTION 'ALL_TESTS_PASSED_ROLLBACK';
  ELSE
    RAISE EXCEPTION 'FAILURES: %', array_to_string(v_fail, ' | ');
  END IF;
END $test$;
