/*
 * 20260928_physical_activity_functions.sql — the progress + sync engine
 *
 * Everything trusted lives here, as SECURITY DEFINER functions, matching the
 * existing issue_quest_order_code / complete_task_with_bill_code pattern.
 *
 * The rule that makes spec section 9 work: activity_records is never debited.
 * progress is recomputed as a SUM over it, per quest, per period. Two quests
 * reading the same 10,500 steps is therefore correct, not double counting —
 * they are two independent projections of one immutable fact.
 */

/* -- Touch triggers -------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.strivup_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS activity_connections_touch ON public.activity_connections;
CREATE TRIGGER activity_connections_touch BEFORE UPDATE ON public.activity_connections
  FOR EACH ROW EXECUTE FUNCTION public.strivup_touch_updated_at();

DROP TRIGGER IF EXISTS activity_records_touch ON public.activity_records;
CREATE TRIGGER activity_records_touch BEFORE UPDATE ON public.activity_records
  FOR EACH ROW EXECUTE FUNCTION public.strivup_touch_updated_at();

DROP TRIGGER IF EXISTS qtac_touch ON public.quest_task_activity_config;
CREATE TRIGGER qtac_touch BEFORE UPDATE ON public.quest_task_activity_config
  FOR EACH ROW EXECUTE FUNCTION public.strivup_touch_updated_at();

/* -- Metric extraction ------------------------------------------------------
 *
 * Converts raw activity rows into the unit the task is configured in, and
 * applies the TRUST GATE:
 *
 *   tracking_mode = 'device_verified' -> only VERIFIED rows count
 *   tracking_mode = 'self_reported'   -> VERIFIED or SELF_REPORTED count
 *
 * Rows that are not VALID (suspicious / rejected / under review) never count,
 * in either mode. This is the single place that decides what "counts", so a
 * change here cannot be bypassed by any caller.
 */
CREATE OR REPLACE FUNCTION public.physical_activity_value(
  p_user_id       uuid,
  p_activity_type text,
  p_unit          text,
  p_tracking_mode text,
  p_from          date,
  p_to            date
) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(
    CASE lower(p_unit)
      WHEN 'steps'    THEN ar.steps::numeric
      WHEN 'm'        THEN ar.distance_m
      WHEN 'meters'   THEN ar.distance_m
      WHEN 'km'       THEN ar.distance_m / 1000.0
      WHEN 'min'      THEN ar.duration_s / 60.0
      WHEN 'minutes'  THEN ar.duration_s / 60.0
      WHEN 's'        THEN ar.duration_s::numeric
      WHEN 'seconds'  THEN ar.duration_s::numeric
      WHEN 'kcal'     THEN ar.calories
      WHEN 'calories' THEN ar.calories
      ELSE ar.steps::numeric
    END
  ), 0)
  FROM public.activity_records ar
  WHERE ar.user_id = p_user_id
    AND ar.activity_type = p_activity_type
    AND ar.activity_status = 'VALID'
    AND ar.local_date BETWEEN p_from AND p_to
    AND (
      ar.verification_status = 'VERIFIED'
      OR (p_tracking_mode = 'self_reported' AND ar.verification_status = 'SELF_REPORTED')
    );
$$;

/* -- Quest completion + reward eligibility ----------------------------------
 *
 * Called after a physical task completes. Respects the existing reward state
 * machine (spec section 32): claims are created as 'eligible', never
 * 'fulfilled'. Leaderboard rewards are left alone — ranking is decided when
 * the quest ends, not per participant.
 */
CREATE OR REPLACE FUNCTION public.evaluate_quest_completion(
  p_quest_id uuid,
  p_user_id  uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_required   integer;
  v_approved   integer;
  v_reward     record;
BEGIN
  SELECT count(*) INTO v_required
  FROM quest_tasks t WHERE t.quest_id = p_quest_id AND t.is_required = true;

  SELECT count(DISTINCT s.task_id) INTO v_approved
  FROM quest_task_submissions s
  JOIN quest_tasks t ON t.id = s.task_id AND t.is_required = true
  WHERE s.quest_id = p_quest_id AND s.user_id = p_user_id
    AND s.verification_status = 'approved';

  IF v_required = 0 OR v_approved < v_required THEN
    RETURN false;
  END IF;

  UPDATE quest_participants
     SET completed_at = coalesce(completed_at, now()),
         verification_status = 'approved'
   WHERE quest_id = p_quest_id AND user_id = p_user_id;

  FOR v_reward IN
    SELECT r.id FROM quest_rewards r
    WHERE r.quest_id = p_quest_id AND r.is_leaderboard = false
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM quest_reward_claims c
      WHERE c.reward_id = v_reward.id AND c.user_id = p_user_id
    ) THEN
      INSERT INTO quest_reward_claims (quest_id, reward_id, user_id, status)
      VALUES (p_quest_id, v_reward.id, p_user_id, 'eligible');

      INSERT INTO activity_verification_events (user_id, quest_id, event_type, metadata)
      VALUES (p_user_id, p_quest_id, 'REWARD_UNLOCKED',
              jsonb_build_object('reward_id', v_reward.id));
    END IF;
  END LOOP;

  RETURN true;
END $$;

/* -- Progress recalculation -------------------------------------------------
 *
 * Recomputes every period bucket for one (user, physical task) pair and
 * returns the number of progress rows written. Safe to call repeatedly:
 * it is a pure recomputation, and completion side effects are guarded so
 * they fire exactly once.
 */
CREATE OR REPLACE FUNCTION public.recalc_physical_task_progress(
  p_user_id uuid,
  p_task_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c          quest_task_activity_config%ROWTYPE;
  v_qstart   date;
  v_qend     date;
  v_today    date;
  v_tz       text;
  v_periods  date[];
  v_period   date;
  v_from     date;
  v_to       date;
  v_value    numeric;
  v_pct      numeric;
  v_status   text;
  v_prev     text;
  v_rows     integer := 0;
  v_title    text;
  v_qtitle   text;
BEGIN
  SELECT * INTO c FROM quest_task_activity_config WHERE task_id = p_task_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_tz    := coalesce(c.timezone, 'Asia/Kolkata');
  v_today := (now() AT TIME ZONE v_tz)::date;

  SELECT
    (coalesce(q.start_date, q.starts_at, q.created_at) AT TIME ZONE v_tz)::date,
    (coalesce(q.end_date,   q.ends_at,   now())        AT TIME ZONE v_tz)::date,
    q.title
  INTO v_qstart, v_qend, v_qtitle
  FROM quests q WHERE q.id = c.quest_id;

  IF v_qstart IS NULL THEN RETURN 0; END IF;

  /* Activity outside the quest window never counts (spec section 34). */
  v_qend := least(v_qend, v_today);
  IF v_qend < v_qstart THEN RETURN 0; END IF;

  /* Bound the loop. A quest running longer than a year still only
     recomputes the most recent 366 buckets. */
  v_qstart := greatest(v_qstart, v_qend - 366);

  IF c.frequency = 'daily' THEN
    SELECT array_agg(d::date) INTO v_periods
    FROM generate_series(v_qstart, v_qend, interval '1 day') d;
  ELSIF c.frequency = 'specific_date' THEN
    IF c.specific_date BETWEEN v_qstart AND v_qend THEN
      v_periods := ARRAY[c.specific_date];
    ELSE
      v_periods := ARRAY[]::date[];
    END IF;
  ELSE /* 'total' — one bucket keyed by the quest start */
    v_periods := ARRAY[v_qstart];
  END IF;

  SELECT title INTO v_title FROM quest_tasks WHERE id = p_task_id;

  FOREACH v_period IN ARRAY coalesce(v_periods, ARRAY[]::date[])
  LOOP
    IF c.frequency = 'total' THEN
      v_from := v_qstart; v_to := v_qend;
    ELSE
      v_from := v_period; v_to := v_period;
    END IF;

    v_value := public.physical_activity_value(
      p_user_id, c.activity_type, c.unit, c.tracking_mode, v_from, v_to
    );

    v_pct := least(100, round((v_value / NULLIF(c.target_value, 0)) * 100, 2));
    v_status := CASE
      WHEN v_value >= c.target_value THEN 'COMPLETED'
      WHEN v_value > 0               THEN 'IN_PROGRESS'
      ELSE 'NOT_STARTED'
    END;

    SELECT status INTO v_prev FROM quest_activity_progress
     WHERE task_id = p_task_id AND user_id = p_user_id AND period_date = v_period;

    INSERT INTO quest_activity_progress (
      quest_id, task_id, user_id, period_date,
      current_value, target_value, percentage, status,
      completed_at, last_calculated_at
    ) VALUES (
      c.quest_id, p_task_id, p_user_id, v_period,
      v_value, c.target_value, coalesce(v_pct, 0), v_status,
      CASE WHEN v_status = 'COMPLETED' THEN now() ELSE NULL END, now()
    )
    ON CONFLICT (task_id, user_id, period_date) DO UPDATE SET
      current_value      = EXCLUDED.current_value,
      target_value       = EXCLUDED.target_value,
      percentage         = EXCLUDED.percentage,
      status             = EXCLUDED.status,
      /* never clear an earned completion timestamp */
      completed_at       = coalesce(quest_activity_progress.completed_at, EXCLUDED.completed_at),
      last_calculated_at = now();

    v_rows := v_rows + 1;

    /* Completion side effects fire exactly once, on the transition. */
    IF v_status = 'COMPLETED' AND coalesce(v_prev, 'NOT_STARTED') <> 'COMPLETED' THEN

      IF NOT EXISTS (
        SELECT 1 FROM quest_task_submissions
        WHERE quest_id = c.quest_id AND task_id = p_task_id AND user_id = p_user_id
          AND verification_status = 'approved'
      ) THEN
        INSERT INTO quest_task_submissions (
          quest_id, task_id, user_id, caption, verification_status, reviewed_at
        ) VALUES (
          c.quest_id, p_task_id, p_user_id,
          format('Verified by device activity: %s / %s %s on %s',
                 round(v_value), round(c.target_value), c.unit, v_period),
          'approved', now()
        );
      END IF;

      INSERT INTO activity_verification_events (user_id, quest_id, task_id, event_type, metadata)
      VALUES (p_user_id, c.quest_id, p_task_id, 'PHYSICAL_TASK_COMPLETED',
              jsonb_build_object('period', v_period, 'value', v_value,
                                 'target', c.target_value, 'unit', c.unit));

      /* Reuse the existing quest_events vocabulary rather than widening its
         CHECK constraint: an auto-verified physical task IS a task approval,
         and reusing 'task_approve' means getQuestAnalytics() counts it without
         any change. The activity-specific detail lives in
         activity_verification_events instead. */
      INSERT INTO quest_events (quest_id, user_id, event_type, metadata)
      VALUES (c.quest_id, p_user_id, 'task_approve',
              jsonb_build_object('task_id', p_task_id, 'period', v_period,
                                 'source', 'physical_activity'));

      PERFORM create_notification(
        p_user_id, 'activity_task_completed',
        'Task complete',
        format('You completed "%s" — %s / %s %s.',
               coalesce(v_title, 'your activity task'),
               round(v_value), round(c.target_value), c.unit),
        NULL, NULL, c.quest_id
      );

      PERFORM public.evaluate_quest_completion(c.quest_id, p_user_id);

    /* Nudge at 80%+ on today's bucket only, and only once per period. */
    ELSIF v_status = 'IN_PROGRESS' AND v_pct >= 80
          AND v_period = v_today
          AND coalesce(v_prev, 'NOT_STARTED') = 'NOT_STARTED' THEN
      PERFORM create_notification(
        p_user_id, 'activity_goal_near',
        'Almost there',
        format('%s %s to go on "%s".',
               round(c.target_value - v_value), c.unit,
               coalesce(v_title, 'your activity task')),
        NULL, NULL, c.quest_id
      );
    END IF;
  END LOOP;

  INSERT INTO activity_verification_events (user_id, quest_id, task_id, event_type, metadata)
  VALUES (p_user_id, c.quest_id, p_task_id, 'QUEST_PROGRESS_UPDATED',
          jsonb_build_object('periods', v_rows));

  RETURN v_rows;
END $$;

/* -- Recalculate every physical task a user is enrolled in ------------------ */

CREATE OR REPLACE FUNCTION public.recalc_user_physical_progress(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_task  record;
  v_total integer := 0;
BEGIN
  FOR v_task IN
    SELECT c.task_id
    FROM quest_task_activity_config c
    JOIN quest_participants p ON p.quest_id = c.quest_id AND p.user_id = p_user_id
    JOIN quests q ON q.id = c.quest_id
    WHERE q.quest_status = ANY (ARRAY['published','active','completed'])
  LOOP
    v_total := v_total + public.recalc_physical_task_progress(p_user_id, v_task.task_id);
  END LOOP;
  RETURN v_total;
END $$;

/* -- Fraud heuristics (spec section 29) -------------------------------------
 *
 * Deliberately conservative. A single odd reading marks the record
 * SUSPICIOUS so it stops counting and lands in the admin queue — it never
 * bans anyone, and never rejects outright. Admin decides.
 */
CREATE OR REPLACE FUNCTION public.classify_activity_record(
  p_steps      integer,
  p_distance_m numeric,
  p_duration_s integer,
  p_granularity text
) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT array_remove(ARRAY[
    /* ~100k steps is roughly 70 km of walking in one day. */
    CASE WHEN p_steps > 100000 THEN 'implausible_daily_volume' END,
    /* Sustained cadence above 4 steps/sec is not human over a session. */
    CASE WHEN p_granularity = 'session' AND p_duration_s > 60
              AND p_steps::numeric / p_duration_s > 4 THEN 'impossible_cadence' END,
    /* > 45 km/h on a step-tracked activity implies a vehicle. */
    CASE WHEN p_duration_s > 60
              AND (p_distance_m / p_duration_s) * 3.6 > 45 THEN 'impossible_velocity' END
  ], NULL);
$$;

/* -- Ingest ----------------------------------------------------------------
 *
 * The ONLY way activity enters the system. Called with the service role from
 * the sync route. Idempotent by (user_id, provider, dedupe_key): re-running
 * the same payload updates in place and never inserts a duplicate
 * (spec section 28).
 *
 * p_records is a JSON array of:
 *   { dedupe_key, external_id, activity_type, granularity, local_date,
 *     started_at, ended_at, steps, distance_m, duration_s, calories, raw }
 */
CREATE OR REPLACE FUNCTION public.ingest_activity_records(
  p_user_id  uuid,
  p_provider text,
  p_source   text,
  p_records  jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r              jsonb;
  v_conn         uuid;
  v_tz           text;
  v_flags        text[];
  v_status       text;
  v_verif        text;
  v_inserted     integer := 0;
  v_updated      integer := 0;
  v_flagged      integer := 0;
  v_existing     uuid;
  v_log_id       uuid;
  v_progress     integer := 0;
BEGIN
  SELECT id, timezone INTO v_conn, v_tz
  FROM activity_connections
  WHERE user_id = p_user_id AND provider = p_provider;

  v_tz := coalesce(v_tz, 'Asia/Kolkata');

  /* MANUAL can never be VERIFIED — the CHECK enforces it too, but deciding
     it here keeps the intent obvious (spec sections 10, 11). */
  v_verif := CASE WHEN p_source = 'MANUAL' THEN 'SELF_REPORTED'
                  WHEN p_source = 'DEVICE_SENSOR' THEN 'SELF_REPORTED'
                  ELSE 'VERIFIED' END;

  INSERT INTO activity_sync_logs (user_id, connection_id, provider, status)
  VALUES (p_user_id, v_conn, p_provider, 'success')
  RETURNING id INTO v_log_id;

  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_records, '[]'::jsonb))
  LOOP
    v_flags := public.classify_activity_record(
      coalesce((r->>'steps')::integer, 0),
      coalesce((r->>'distance_m')::numeric, 0),
      coalesce((r->>'duration_s')::integer, 0),
      coalesce(r->>'granularity', 'daily')
    );
    v_status := CASE WHEN array_length(v_flags, 1) > 0 THEN 'SUSPICIOUS' ELSE 'VALID' END;
    IF v_status = 'SUSPICIOUS' THEN v_flagged := v_flagged + 1; END IF;

    SELECT id INTO v_existing FROM activity_records
     WHERE user_id = p_user_id AND provider = p_provider
       AND dedupe_key = (r->>'dedupe_key');

    INSERT INTO activity_records (
      user_id, connection_id, provider, source, activity_type, granularity,
      dedupe_key, external_id, local_date, timezone, started_at, ended_at,
      steps, distance_m, duration_s, calories,
      verification_status, activity_status, flagged_reason, raw
    ) VALUES (
      p_user_id, v_conn, p_provider, p_source,
      coalesce(r->>'activity_type', 'steps'),
      coalesce(r->>'granularity', 'daily'),
      r->>'dedupe_key', r->>'external_id',
      (r->>'local_date')::date, v_tz,
      (r->>'started_at')::timestamptz, (r->>'ended_at')::timestamptz,
      coalesce((r->>'steps')::integer, 0),
      coalesce((r->>'distance_m')::numeric, 0),
      coalesce((r->>'duration_s')::integer, 0),
      coalesce((r->>'calories')::numeric, 0),
      v_verif, v_status,
      CASE WHEN v_status = 'SUSPICIOUS' THEN array_to_string(v_flags, ',') END,
      r->'raw'
    )
    ON CONFLICT (user_id, provider, dedupe_key) DO UPDATE SET
      steps               = EXCLUDED.steps,
      distance_m          = EXCLUDED.distance_m,
      duration_s          = EXCLUDED.duration_s,
      calories            = EXCLUDED.calories,
      ended_at            = EXCLUDED.ended_at,
      /* An admin decision (REJECTED / UNDER_REVIEW) survives a resync. */
      activity_status     = CASE
                              WHEN activity_records.activity_status IN ('REJECTED','UNDER_REVIEW')
                                THEN activity_records.activity_status
                              ELSE EXCLUDED.activity_status
                            END,
      flagged_reason      = EXCLUDED.flagged_reason,
      raw                 = EXCLUDED.raw,
      updated_at          = now();

    IF v_existing IS NULL THEN v_inserted := v_inserted + 1;
    ELSE v_updated := v_updated + 1; END IF;

    IF v_status = 'SUSPICIOUS' THEN
      INSERT INTO activity_verification_events (user_id, event_type, metadata)
      VALUES (p_user_id, 'ACTIVITY_MARKED_SUSPICIOUS',
              jsonb_build_object('flags', v_flags, 'dedupe_key', r->>'dedupe_key'));
    END IF;
  END LOOP;

  v_progress := public.recalc_user_physical_progress(p_user_id);

  UPDATE activity_connections
     SET last_synced_at = now(), last_sync_status = 'success', last_sync_error = NULL
   WHERE id = v_conn;

  UPDATE activity_sync_logs
     SET records_fetched = jsonb_array_length(coalesce(p_records, '[]'::jsonb)),
         records_inserted = v_inserted,
         records_updated  = v_updated,
         records_flagged  = v_flagged,
         progress_rows_touched = v_progress,
         finished_at = now()
   WHERE id = v_log_id;

  INSERT INTO activity_verification_events (user_id, event_type, metadata)
  VALUES (p_user_id, 'ACTIVITY_SYNCED',
          jsonb_build_object('provider', p_provider, 'inserted', v_inserted,
                             'updated', v_updated, 'flagged', v_flagged));

  RETURN jsonb_build_object(
    'inserted', v_inserted, 'updated', v_updated,
    'flagged', v_flagged, 'progress_rows', v_progress
  );
END $$;

/* -- Read models ------------------------------------------------------------ */

/* Today + rolling week + streak for the activity dashboard (spec section 14). */
CREATE OR REPLACE FUNCTION public.get_activity_dashboard(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user  uuid := auth.uid();
  v_tz    text := 'Asia/Kolkata';
  v_today date;
  v_days  jsonb;
  v_today_steps integer;
  v_week_steps  integer;
  v_active_days integer;
  v_streak      integer := 0;
  v_d           date;
BEGIN
  IF v_user IS NULL THEN RETURN '{}'::jsonb; END IF;

  SELECT coalesce(timezone, 'Asia/Kolkata') INTO v_tz
  FROM activity_connections WHERE user_id = v_user AND status = 'connected' LIMIT 1;
  v_tz := coalesce(v_tz, 'Asia/Kolkata');
  v_today := (now() AT TIME ZONE v_tz)::date;

  SELECT coalesce(sum(steps), 0)::integer INTO v_today_steps
  FROM activity_records
  WHERE user_id = v_user AND activity_status = 'VALID'
    AND activity_type = 'steps' AND local_date = v_today;

  SELECT coalesce(sum(steps), 0)::integer,
         count(DISTINCT local_date) FILTER (WHERE steps > 0)
    INTO v_week_steps, v_active_days
  FROM activity_records
  WHERE user_id = v_user AND activity_status = 'VALID'
    AND activity_type = 'steps'
    AND local_date > v_today - p_days;

  SELECT jsonb_agg(jsonb_build_object('date', d.day, 'steps', coalesce(s.steps, 0))
                   ORDER BY d.day)
    INTO v_days
  FROM generate_series(v_today - (p_days - 1), v_today, interval '1 day') AS d(day)
  LEFT JOIN (
    SELECT local_date, sum(steps)::integer AS steps
    FROM activity_records
    WHERE user_id = v_user AND activity_status = 'VALID' AND activity_type = 'steps'
    GROUP BY local_date
  ) s ON s.local_date = d.day::date;

  /* Streak: consecutive days with any recorded steps, walking back from today. */
  v_d := v_today;
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM activity_records
      WHERE user_id = v_user AND activity_type = 'steps'
        AND activity_status = 'VALID' AND local_date = v_d AND steps > 0
    );
    v_streak := v_streak + 1;
    v_d := v_d - 1;
    EXIT WHEN v_streak > 365;
  END LOOP;

  RETURN jsonb_build_object(
    'timezone', v_tz,
    'today', v_today,
    'today_steps', v_today_steps,
    'week_steps', v_week_steps,
    'active_days', coalesce(v_active_days, 0),
    'streak', v_streak,
    'days', coalesce(v_days, '[]'::jsonb)
  );
END $$;

/* Aggregated physical analytics for one quest — business facing.
   Returns counts and averages only, never per-user health detail
   (spec sections 20, 21). */
CREATE OR REPLACE FUNCTION public.get_physical_quest_analytics(p_quest_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
  v_out   jsonb;
BEGIN
  SELECT creator_id INTO v_owner FROM quests WHERE id = p_quest_id;
  IF v_owner IS NULL THEN RETURN '{}'::jsonb; END IF;

  /* Business owner or admin only. */
  IF v_owner <> auth.uid()
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'not authorised for quest %', p_quest_id USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'participants',    count(DISTINCT p.user_id),
    'started',         count(DISTINCT p.user_id) FILTER (WHERE p.current_value > 0),
    'completed',       count(DISTINCT p.user_id) FILTER (WHERE p.status = 'COMPLETED'),
    'completion_rate', CASE WHEN count(DISTINCT p.user_id) = 0 THEN 0
                            ELSE round(100.0 * count(DISTINCT p.user_id)
                                 FILTER (WHERE p.status = 'COMPLETED')
                                 / count(DISTINCT p.user_id), 1) END,
    'average_value',   round(coalesce(avg(p.current_value), 0)),
    'suspicious',      (SELECT count(*) FROM activity_verification_events e
                         WHERE e.quest_id = p_quest_id
                           AND e.event_type = 'ACTIVITY_MARKED_SUSPICIOUS')
  ) INTO v_out
  FROM quest_activity_progress p
  WHERE p.quest_id = p_quest_id;

  RETURN coalesce(v_out, '{}'::jsonb);
END $$;

/* -- Admin review ----------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.admin_review_activity_record(
  p_record_id uuid,
  p_action    text,   /* 'approve' | 'reject' | 'review' */
  p_note      text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('approve','reject','review') THEN
    RAISE EXCEPTION 'unknown action %', p_action USING ERRCODE = '22023';
  END IF;

  UPDATE activity_records
     SET activity_status = CASE p_action
                             WHEN 'approve' THEN 'VALID'
                             WHEN 'reject'  THEN 'REJECTED'
                             ELSE 'UNDER_REVIEW' END,
         flagged_reason = coalesce(p_note, flagged_reason)
   WHERE id = p_record_id
  RETURNING user_id INTO v_user;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'activity record % not found', p_record_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO activity_verification_events (user_id, activity_record_id, event_type, metadata)
  VALUES (v_user, p_record_id, 'ADMIN_ACTIVITY_REVIEWED',
          jsonb_build_object('action', p_action, 'note', p_note, 'by', auth.uid()));

  /* An approve/reject changes what counts, so progress must be rebuilt. */
  PERFORM public.recalc_user_physical_progress(v_user);
END $$;

/* -- Grants ---------------------------------------------------------------- *
 * ingest_activity_records is NOT granted to authenticated: only the service
 * role may call it, which is what stops a browser asserting step counts.
 */
REVOKE ALL ON FUNCTION public.ingest_activity_records(uuid, text, text, jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalc_physical_task_progress(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalc_user_physical_progress(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.physical_activity_value(uuid, text, text, text, date, date) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.evaluate_quest_completion(uuid, uuid) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_activity_dashboard(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_physical_quest_analytics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_activity_record(uuid, text, text) TO authenticated;
