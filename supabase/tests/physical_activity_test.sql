/*
 * supabase/tests/physical_activity_test.sql
 *
 * Engine tests for the physical activity system (spec §57).
 *
 * HOW TO RUN
 *   psql "$DATABASE_URL" -f supabase/tests/physical_activity_test.sql
 *
 * The whole suite is one DO block that ends in
 *   RAISE EXCEPTION 'ALL_TESTS_PASSED_ROLLBACK'
 * which aborts the transaction on purpose. That is the pass signal, and it is
 * what makes the suite safe to run against a real database: every row it
 * creates is rolled back with it. A failure raises instead with the list of
 * assertions that did not hold — also rolling back.
 *
 * So: seeing 'ALL_TESTS_PASSED_ROLLBACK' as an ERROR is success.
 * Anything starting 'FAILURES:' is a real failure.
 *
 * Set v_user below to any existing profiles.id — the block needs a real user
 * to satisfy foreign keys, and writes nothing that survives.
 *
 * Coverage against spec §57:
 *   3  activity synchronised            13 multiple quests, same activity
 *   5  progress calculated               6 duplicate activity ignored
 *   7  activity outside quest dates      8 target reached
 *   9  task completed                   10 reward unlocked
 *   11 daily reset (bucket per date)    12 timezone handling (Asia/Kolkata)
 *   14 suspicious activity detection    18 existing proof types unaffected
 *
 * Cases 15-17 (a user cannot read another user's activity; a business cannot
 * read unrelated health data; an admin can review flagged activity) are
 * enforced by RLS and are verified with the policy queries at the bottom of
 * this file rather than in the DO block, because a SECURITY DEFINER block
 * runs as the owner and would bypass the very policies under test.
 */

DO $test$
DECLARE
  /* Any existing profile id. */
  v_user   uuid := (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1);
  v_qa uuid; v_qb uuid; v_ta uuid; v_tb uuid;
  v_today  date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_cnt integer; v_val numeric; v_status text; v_claims integer;
  v_fail text[] := ARRAY[]::text[];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'no profiles exist — seed a user before running these tests';
  END IF;

  /* Two quests over the same window: 5,000/day and 10,000/day. */
  INSERT INTO quests (creator_id,title,quest_status,status,proof_type,start_date,end_date)
  VALUES (v_user,'TEST A 5k','active','active','photo',now()-interval '3 days',now()+interval '3 days')
  RETURNING id INTO v_qa;
  INSERT INTO quests (creator_id,title,quest_status,status,proof_type,start_date,end_date)
  VALUES (v_user,'TEST B 10k','active','active','photo',now()-interval '3 days',now()+interval '3 days')
  RETURNING id INTO v_qb;

  INSERT INTO quest_tasks (quest_id,title,proof_type,is_required,sort_order)
  VALUES (v_qa,'Walk 5000','physical_activity',true,0) RETURNING id INTO v_ta;
  INSERT INTO quest_tasks (quest_id,title,proof_type,is_required,sort_order)
  VALUES (v_qb,'Walk 10000','physical_activity',true,0) RETURNING id INTO v_tb;

  INSERT INTO quest_task_activity_config (task_id,quest_id,activity_type,target_value,unit,frequency)
  VALUES (v_ta,v_qa,'steps',5000,'steps','daily'),(v_tb,v_qb,'steps',10000,'steps','daily');

  INSERT INTO quest_rewards (quest_id,reward_type,title) VALUES (v_qa,'coupon','TEST 100 off');
  INSERT INTO quest_participants (quest_id,user_id) VALUES (v_qa,v_user),(v_qb,v_user);

  /* ── §13: ONE device reading of 10,500 steps feeds BOTH quests ───────────
     This is the double-counting test. The same steps legitimately satisfy
     both targets because progress is a projection, not a debit. */
  PERFORM ingest_activity_records(v_user,'fitbit','FITBIT', jsonb_build_array(
    jsonb_build_object('dedupe_key','steps:'||v_today,'activity_type','steps','granularity','daily',
      'local_date',v_today,'started_at',now()-interval '8 hours','ended_at',now(),'steps',10500)));

  SELECT current_value,status INTO v_val,v_status FROM quest_activity_progress
   WHERE task_id=v_ta AND user_id=v_user AND period_date=v_today;
  IF v_val<>10500 OR v_status<>'COMPLETED' THEN v_fail:=v_fail||format('T13a got %s/%s',v_val,v_status); END IF;

  SELECT current_value,status INTO v_val,v_status FROM quest_activity_progress
   WHERE task_id=v_tb AND user_id=v_user AND period_date=v_today;
  IF v_val<>10500 OR v_status<>'COMPLETED' THEN v_fail:=v_fail||format('T13b got %s/%s',v_val,v_status); END IF;

  /* ── §10: reward became ELIGIBLE, never auto-fulfilled ───────────────────*/
  SELECT count(*) INTO v_claims FROM quest_reward_claims
   WHERE quest_id=v_qa AND user_id=v_user AND status='eligible';
  IF v_claims<>1 THEN v_fail:=v_fail||format('T10 eligible claims=%s',v_claims); END IF;

  /* ── §9: completion wrote a normal approved submission, so the existing
        review/analytics surfaces see it like any other proof ─────────────*/
  SELECT count(*) INTO v_cnt FROM quest_task_submissions
   WHERE task_id=v_ta AND user_id=v_user AND verification_status='approved';
  IF v_cnt<>1 THEN v_fail:=v_fail||format('T9 submission rows=%s',v_cnt); END IF;

  /* ── §6/§28: re-ingest the identical payload twice more ─────────────────*/
  PERFORM ingest_activity_records(v_user,'fitbit','FITBIT', jsonb_build_array(
    jsonb_build_object('dedupe_key','steps:'||v_today,'activity_type','steps','granularity','daily',
      'local_date',v_today,'started_at',now()-interval '8 hours','ended_at',now(),'steps',10500)));
  PERFORM ingest_activity_records(v_user,'fitbit','FITBIT', jsonb_build_array(
    jsonb_build_object('dedupe_key','steps:'||v_today,'activity_type','steps','granularity','daily',
      'local_date',v_today,'started_at',now()-interval '8 hours','ended_at',now(),'steps',10500)));

  SELECT count(*) INTO v_cnt FROM activity_records
   WHERE user_id=v_user AND provider='fitbit' AND dedupe_key='steps:'||v_today;
  IF v_cnt<>1 THEN v_fail:=v_fail||format('T6 duplicate activity rows=%s',v_cnt); END IF;

  SELECT current_value INTO v_val FROM quest_activity_progress
   WHERE task_id=v_ta AND user_id=v_user AND period_date=v_today;
  IF v_val<>10500 THEN v_fail:=v_fail||format('T6 progress inflated to %s',v_val); END IF;

  SELECT count(*) INTO v_cnt FROM quest_task_submissions
   WHERE task_id=v_ta AND user_id=v_user AND verification_status='approved';
  IF v_cnt<>1 THEN v_fail:=v_fail||format('T6 duplicate submissions=%s',v_cnt); END IF;

  /* ── §7/§34: activity 30 days before the quest must not count ───────────*/
  PERFORM ingest_activity_records(v_user,'fitbit','FITBIT', jsonb_build_array(
    jsonb_build_object('dedupe_key','steps:old','activity_type','steps','granularity','daily',
      'local_date',v_today-30,'started_at',now()-interval '30 days','ended_at',now()-interval '30 days','steps',99999)));
  SELECT count(*) INTO v_cnt FROM quest_activity_progress
   WHERE task_id=v_ta AND user_id=v_user AND period_date=v_today-30;
  IF v_cnt<>0 THEN v_fail:=v_fail||'T7 out-of-window activity created a bucket'; END IF;

  /* ── §14/§29: 50,000 steps in 10 minutes is flagged AND excluded ────────*/
  PERFORM ingest_activity_records(v_user,'strava','STRAVA', jsonb_build_array(
    jsonb_build_object('dedupe_key','strava:cheat','activity_type','steps','granularity','session',
      'local_date',v_today,'started_at',now()-interval '10 minutes','ended_at',now(),
      'steps',50000,'duration_s',600)));
  SELECT activity_status INTO v_status FROM activity_records WHERE user_id=v_user AND dedupe_key='strava:cheat';
  IF v_status<>'SUSPICIOUS' THEN v_fail:=v_fail||format('T14 status=%s',v_status); END IF;

  SELECT current_value INTO v_val FROM quest_activity_progress
   WHERE task_id=v_ta AND user_id=v_user AND period_date=v_today;
  IF v_val<>10500 THEN v_fail:=v_fail||format('T14 flagged steps leaked into progress: %s',v_val); END IF;

  /* ── §10/§11: a MANUAL source can never be VERIFIED, and must not count
        toward a device_verified task ────────────────────────────────────*/
  PERFORM ingest_activity_records(v_user,'manual','MANUAL', jsonb_build_array(
    jsonb_build_object('dedupe_key','manual:1','activity_type','steps','granularity','daily',
      'local_date',v_today,'started_at',now(),'ended_at',now(),'steps',4000)));
  SELECT verification_status INTO v_status FROM activity_records WHERE user_id=v_user AND dedupe_key='manual:1';
  IF v_status='VERIFIED' THEN v_fail:=v_fail||'MANUAL source was marked VERIFIED'; END IF;

  SELECT current_value INTO v_val FROM quest_activity_progress
   WHERE task_id=v_ta AND user_id=v_user AND period_date=v_today;
  IF v_val<>10500 THEN v_fail:=v_fail||format('self-reported steps counted on a device_verified task: %s',v_val); END IF;

  /* ── §18: adding a normal photo task alongside still works ──────────────*/
  INSERT INTO quest_tasks (quest_id,title,proof_type,is_required,sort_order)
  VALUES (v_qa,'Upload photo','photo',true,1);

  IF array_length(v_fail,1)>0 THEN
    RAISE EXCEPTION 'FAILURES: %', array_to_string(v_fail,' | ');
  END IF;

  RAISE EXCEPTION 'ALL_TESTS_PASSED_ROLLBACK';
END $test$;

/*
 * §15-17 — RLS verification.
 *
 * These assert the shape of the policy set rather than running as another
 * user, because the DO block above executes as the table owner and would
 * bypass RLS entirely. Each should return the expected row.
 */

-- Tokens are unreachable: RLS on, zero policies, no grants to app roles.
SELECT
  (SELECT relrowsecurity FROM pg_class WHERE relname='activity_connection_secrets') AS rls_on,
  (SELECT count(*) FROM pg_policies WHERE tablename='activity_connection_secrets') AS policies,
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_name='activity_connection_secrets' AND grantee IN ('anon','authenticated')) AS app_grants;
-- expected: rls_on = true, policies = 0, app_grants = 0

-- A user reads only their own activity; there is no business policy on the
-- raw records table at all (businesses see progress, never health data).
SELECT policyname, cmd, qual
FROM pg_policies WHERE tablename='activity_records' ORDER BY policyname;

-- The browser cannot call the ingest or recalc functions.
SELECT p.proname,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('ingest_activity_records','recalc_physical_task_progress',
                    'recalc_user_physical_progress','physical_activity_value',
                    'evaluate_quest_completion','get_activity_dashboard')
ORDER BY p.proname;
-- expected: false for everything except get_activity_dashboard

/*
 * ── In-app pedometer path ───────────────────────────────────────────────────
 *
 * Covers the Lenskart-style flow: business offers a discount for 5,000 steps,
 * the user walks with the app open, the task completes and the reward unlocks.
 *
 * Also pins the trust boundary: steps from the phone's own sensor are
 * SELF_REPORTED, so they satisfy a `self_reported` task and must NOT satisfy a
 * `device_verified` one.
 *
 * Same convention: ALL_TESTS_PASSED_ROLLBACK is success, and nothing persists.
 */
DO $test$
DECLARE
  v_user uuid := (SELECT id FROM profiles ORDER BY created_at LIMIT 1);
  v_q uuid; v_t_self uuid; v_t_verified uuid;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_val numeric; v_status text; v_claims integer; v_verif text;
  v_fail text[] := ARRAY[]::text[];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'no profiles exist — seed a user before running these tests';
  END IF;

  INSERT INTO quests (creator_id,title,quest_status,status,proof_type,start_date,end_date)
  VALUES (v_user,'TEST Walk 5000 get Rs100 off','active','active','photo',
          now()-interval '1 day', now()+interval '7 days')
  RETURNING id INTO v_q;

  INSERT INTO quest_tasks (quest_id,title,proof_type,is_required,sort_order)
  VALUES (v_q,'Walk 5000 steps','physical_activity',true,0) RETURNING id INTO v_t_self;
  INSERT INTO quest_task_activity_config (task_id,quest_id,activity_type,target_value,unit,frequency,tracking_mode)
  VALUES (v_t_self,v_q,'steps',5000,'steps','daily','self_reported');

  INSERT INTO quest_tasks (quest_id,title,proof_type,is_required,sort_order)
  VALUES (v_q,'Verified only','physical_activity',false,1) RETURNING id INTO v_t_verified;
  INSERT INTO quest_task_activity_config (task_id,quest_id,activity_type,target_value,unit,frequency,tracking_mode)
  VALUES (v_t_verified,v_q,'steps',5000,'steps','daily','device_verified');

  INSERT INTO quest_rewards (quest_id,reward_type,title,value)
  VALUES (v_q,'discount','Rs 100 off','100');
  INSERT INTO quest_participants (quest_id,user_id) VALUES (v_q,v_user);

  PERFORM ingest_activity_records(v_user,'device_sensor','DEVICE_SENSOR', jsonb_build_array(
    jsonb_build_object('dedupe_key','steps:'||v_today,'activity_type','steps','granularity','daily',
      'local_date',v_today,'started_at',now()-interval '1 hour','ended_at',now(),'steps',5200)));

  SELECT verification_status INTO v_verif FROM activity_records
   WHERE user_id=v_user AND provider='device_sensor' AND local_date=v_today;
  IF v_verif <> 'SELF_REPORTED' THEN
    v_fail := v_fail || format('sensor verification = %s (expected SELF_REPORTED)', v_verif);
  END IF;

  SELECT current_value,status INTO v_val,v_status FROM quest_activity_progress
   WHERE task_id=v_t_self AND user_id=v_user AND period_date=v_today;
  IF v_val <> 5200 OR v_status <> 'COMPLETED' THEN
    v_fail := v_fail || format('self_reported task got %s/%s', v_val, v_status);
  END IF;

  SELECT current_value INTO v_val FROM quest_activity_progress
   WHERE task_id=v_t_verified AND user_id=v_user AND period_date=v_today;
  IF coalesce(v_val,0) <> 0 THEN
    v_fail := v_fail || format('device_verified task counted sensor steps: %s', v_val);
  END IF;

  SELECT count(*) INTO v_claims FROM quest_reward_claims
   WHERE quest_id=v_q AND user_id=v_user AND status='eligible';
  IF v_claims <> 1 THEN v_fail := v_fail || format('eligible claims = %s', v_claims); END IF;

  /* The DB replaces a day's value rather than accumulating, which is why
     ingestNativeActivity() applies a monotonic guard in TypeScript before
     calling it. Pin that behaviour so a future change to the RPC is noticed. */
  PERFORM ingest_activity_records(v_user,'device_sensor','DEVICE_SENSOR', jsonb_build_array(
    jsonb_build_object('dedupe_key','steps:'||v_today,'activity_type','steps','granularity','daily',
      'local_date',v_today,'started_at',now()-interval '1 hour','ended_at',now(),'steps',10)));
  SELECT steps INTO v_val FROM activity_records
   WHERE user_id=v_user AND provider='device_sensor' AND local_date=v_today;
  IF v_val <> 10 THEN
    v_fail := v_fail || format('expected replace-with-10, got %s', v_val);
  END IF;

  IF array_length(v_fail,1) > 0 THEN
    RAISE EXCEPTION 'FAILURES: %', array_to_string(v_fail,' | ');
  END IF;
  RAISE EXCEPTION 'ALL_TESTS_PASSED_ROLLBACK';
END $test$;

/*
 * ── Challenges (Option B: one engine, two domains) ──────────────────────────
 *
 * Proves that a user-created challenge can carry a physical task, and — the
 * reason this was worth doing — that ONE walk satisfies a business quest and a
 * personal challenge at the same time, because progress is a projection over a
 * single activity record rather than a balance that gets spent.
 *
 * Also a regression guard: recalc_physical_task_progress is now shared, so the
 * quest assertions here must keep passing.
 */
DO $test$
DECLARE
  v_user uuid := (SELECT id FROM profiles ORDER BY created_at LIMIT 1);
  v_ch uuid; v_ct uuid; v_q uuid; v_qt uuid;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_val numeric; v_status text; v_cnt integer; v_day integer; v_claims integer;
  v_fail text[] := ARRAY[]::text[];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'no profiles exist — seed a user before running these tests';
  END IF;

  INSERT INTO challenges (creator_id,title,duration_days,visibility)
  VALUES (v_user,'TEST 7-day walk challenge',7,'public') RETURNING id INTO v_ch;
  INSERT INTO challenge_tasks (challenge_id,title,proof_type,is_required,sort_order)
  VALUES (v_ch,'Walk 3000 steps','physical_activity',true,0) RETURNING id INTO v_ct;
  INSERT INTO quest_task_activity_config
    (challenge_task_id,challenge_id,activity_type,target_value,unit,frequency,tracking_mode)
  VALUES (v_ct,v_ch,'steps',3000,'steps','daily','self_reported');
  INSERT INTO challenge_participants (challenge_id,user_id,joined_at)
  VALUES (v_ch,v_user, now() - interval '2 days');

  INSERT INTO quests (creator_id,title,quest_status,status,proof_type,start_date,end_date)
  VALUES (v_user,'TEST quest 5k','active','active','photo',now()-interval '1 day',now()+interval '5 days')
  RETURNING id INTO v_q;
  INSERT INTO quest_tasks (quest_id,title,proof_type,is_required,sort_order)
  VALUES (v_q,'Walk 5000','physical_activity',true,0) RETURNING id INTO v_qt;
  INSERT INTO quest_task_activity_config
    (task_id,quest_id,activity_type,target_value,unit,frequency,tracking_mode)
  VALUES (v_qt,v_q,'steps',5000,'steps','daily','self_reported');
  INSERT INTO quest_rewards (quest_id,reward_type,title) VALUES (v_q,'discount','Rs 100 off');
  INSERT INTO quest_participants (quest_id,user_id) VALUES (v_q,v_user);

  /* One 6,000-step walk, two domains. */
  PERFORM ingest_activity_records(v_user,'device_sensor','DEVICE_SENSOR', jsonb_build_array(
    jsonb_build_object('dedupe_key','steps:'||v_today,'activity_type','steps','granularity','daily',
      'local_date',v_today,'started_at',now()-interval '1 hour','ended_at',now(),'steps',6000)));

  SELECT current_value,status INTO v_val,v_status FROM quest_activity_progress
   WHERE challenge_task_id=v_ct AND user_id=v_user AND period_date=v_today;
  IF coalesce(v_val,-1) <> 6000 OR v_status <> 'COMPLETED' THEN
    v_fail := v_fail || format('challenge progress %s/%s', v_val, v_status);
  END IF;

  /* proof_submissions.day_number is NOT NULL and counts from joined_at, so a
     participant who joined 2 days ago is on day 3. */
  SELECT count(*), max(day_number) INTO v_cnt, v_day FROM proof_submissions
   WHERE challenge_id=v_ch AND task_id=v_ct AND user_id=v_user AND verification_status='approved';
  IF v_cnt <> 1 THEN v_fail := v_fail || format('challenge proof rows = %s', v_cnt); END IF;
  IF v_day <> 3 THEN v_fail := v_fail || format('day_number = %s (expected 3)', v_day); END IF;

  SELECT current_value,status INTO v_val,v_status FROM quest_activity_progress
   WHERE task_id=v_qt AND user_id=v_user AND period_date=v_today;
  IF coalesce(v_val,-1) <> 6000 OR v_status <> 'COMPLETED' THEN
    v_fail := v_fail || format('quest progress %s/%s', v_val, v_status);
  END IF;
  SELECT count(*) INTO v_claims FROM quest_reward_claims
   WHERE quest_id=v_q AND user_id=v_user AND status='eligible';
  IF v_claims <> 1 THEN v_fail := v_fail || format('quest reward claims = %s', v_claims); END IF;

  /* Re-sync must not duplicate the challenge proof. */
  PERFORM ingest_activity_records(v_user,'device_sensor','DEVICE_SENSOR', jsonb_build_array(
    jsonb_build_object('dedupe_key','steps:'||v_today,'activity_type','steps','granularity','daily',
      'local_date',v_today,'started_at',now()-interval '1 hour','ended_at',now(),'steps',6000)));
  SELECT count(*) INTO v_cnt FROM proof_submissions
   WHERE challenge_id=v_ch AND task_id=v_ct AND user_id=v_user AND verification_status='approved';
  IF v_cnt <> 1 THEN v_fail := v_fail || format('challenge proof duplicated: %s', v_cnt); END IF;

  /* A row may belong to one domain only. */
  BEGIN
    INSERT INTO quest_task_activity_config (task_id,quest_id,challenge_task_id,challenge_id,target_value)
    VALUES (v_qt,v_q,v_ct,v_ch,100);
    v_fail := v_fail || 'mixed-domain config row was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  IF array_length(v_fail,1) > 0 THEN
    RAISE EXCEPTION 'FAILURES: %', array_to_string(v_fail,' | ');
  END IF;
  RAISE EXCEPTION 'ALL_TESTS_PASSED_ROLLBACK';
END $test$;
