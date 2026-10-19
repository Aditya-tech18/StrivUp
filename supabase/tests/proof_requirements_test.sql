/*
 * supabase/tests/proof_requirements_test.sql
 *
 * Guards the constraints that keep a proof spec meaningful.
 *
 * HOW TO RUN
 *   psql "$DATABASE_URL" -f supabase/tests/proof_requirements_test.sql
 *
 * As with the activity suite, the block ends by raising
 * ALL_TESTS_PASSED_ROLLBACK on purpose — that error IS the pass signal, and it
 * rolls back every row the test created, so this is safe against a real
 * database. Anything starting FAILURES: is a real failure.
 */
DO $test$
DECLARE
  v_user uuid := (SELECT id FROM profiles ORDER BY created_at LIMIT 1);
  v_ch uuid; v_ct uuid; v_q uuid; v_qt uuid; v_cnt integer;
  v_fail text[] := ARRAY[]::text[];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'no profiles exist — seed a user before running these tests';
  END IF;

  INSERT INTO challenges (creator_id,title,duration_days,visibility)
  VALUES (v_user,'TEST proof req challenge',7,'public') RETURNING id INTO v_ch;
  INSERT INTO challenge_tasks (challenge_id,title,proof_type,is_required,sort_order)
  VALUES (v_ch,'Run 5 KM','photo',true,0) RETURNING id INTO v_ct;

  INSERT INTO quests (creator_id,title,quest_status,status,proof_type)
  VALUES (v_user,'TEST q','active','active','photo') RETURNING id INTO v_q;
  INSERT INTO quest_tasks (quest_id,title,proof_type,is_required,sort_order)
  VALUES (v_q,'Buy meal','photo',true,0) RETURNING id INTO v_qt;

  /* A running spec on a challenge task. */
  INSERT INTO proof_requirements
    (challenge_task_id, activity_category, activity_label, required_elements,
     optional_elements, reject_if, participant_hint, generated_by, created_by)
  VALUES (v_ct,'running','Running',
     ARRAY['a running tracker screen','the distance with its unit'],
     ARRAY['duration or pace'],
     ARRAY['a selfie in sportswear'],
     'Upload your running app showing the distance.','template', v_user);

  SELECT count(*) INTO v_cnt FROM proof_requirements WHERE challenge_task_id = v_ct;
  IF v_cnt <> 1 THEN v_fail := v_fail || format('challenge req rows = %s', v_cnt); END IF;

  /* The same table serves quest tasks. */
  INSERT INTO proof_requirements
    (quest_task_id, activity_category, activity_label, required_elements, generated_by)
  VALUES (v_qt,'purchase','Purchase / Receipt', ARRAY['a receipt with merchant name'],'template');

  /* One task, one spec — the upsert target depends on it. */
  BEGIN
    INSERT INTO proof_requirements
      (challenge_task_id, activity_category, activity_label, required_elements)
    VALUES (v_ct,'gym','Gym', ARRAY['equipment']);
    v_fail := v_fail || 'duplicate spec for the same task was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  /* A row may not belong to both domains. */
  BEGIN
    INSERT INTO proof_requirements
      (challenge_task_id, quest_task_id, activity_category, activity_label, required_elements)
    VALUES (v_ct, v_qt, 'gym','Gym', ARRAY['equipment']);
    v_fail := v_fail || 'mixed-domain spec was accepted';
  EXCEPTION WHEN check_violation THEN NULL; WHEN unique_violation THEN NULL;
  END;

  /* Nothing required = everything accepted, which defeats the feature. */
  BEGIN
    INSERT INTO proof_requirements
      (quest_task_id, activity_category, activity_label, required_elements)
    VALUES (v_qt,'gym','Gym', ARRAY[]::text[]);
    v_fail := v_fail || 'empty required_elements was accepted';
  EXCEPTION WHEN check_violation THEN NULL; WHEN unique_violation THEN NULL;
  END;

  /* "other" must keep the free text it was derived from. */
  BEGIN
    INSERT INTO proof_requirements
      (challenge_task_id, activity_category, activity_label, required_elements)
    VALUES (gen_random_uuid(),'other','Something', ARRAY['x']);
    v_fail := v_fail || 'other without custom_activity was accepted';
  EXCEPTION WHEN check_violation THEN NULL; WHEN foreign_key_violation THEN NULL;
  END;

  IF array_length(v_fail,1) > 0 THEN
    RAISE EXCEPTION 'FAILURES: %', array_to_string(v_fail,' | ');
  END IF;
  RAISE EXCEPTION 'ALL_TESTS_PASSED_ROLLBACK';
END $test$;
