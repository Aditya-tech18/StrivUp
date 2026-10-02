/*
 * 20260928_physical_activity_rls.sql — RLS for the physical activity system
 *
 * Privacy model (spec sections 21, 41, 42):
 *
 *   user      -> full access to their OWN activity records
 *   business  -> quest-scoped PROGRESS only, for quests they created.
 *                Never raw activity_records. A restaurant learns
 *                "4,821 / 5,000 on this task", not a health history.
 *   admin     -> read across activity for moderation, via profiles.is_admin
 *   tokens    -> nobody. activity_connection_secrets has RLS on and no
 *                policies, so only the service role can read it.
 *
 * Writes to activity_records and quest_activity_progress are deliberately NOT
 * granted to clients. They happen only inside SECURITY DEFINER functions, so
 * a browser can never assert "steps = 5000" (spec section 42).
 *
 * Every policy is guarded so this file can be re-run safely.
 */

ALTER TABLE public.activity_connections           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_connection_secrets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_records               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_task_activity_config     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_activity_progress        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_sync_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_verification_events   ENABLE ROW LEVEL SECURITY;

/* activity_connection_secrets: intentionally no policies. Do not add any. */

/* -- activity_connections -------------------------------------------------- */

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='activity_connections' AND policyname='ac_owner') THEN
    CREATE POLICY ac_owner ON public.activity_connections
      FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='activity_connections' AND policyname='ac_admin_read') THEN
    CREATE POLICY ac_admin_read ON public.activity_connections
      FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
      ));
  END IF;
END $$;

/* -- activity_records ------------------------------------------------------ */

DO $$
BEGIN
  /* Read-only for the owner. Inserts/updates come from SECURITY DEFINER code. */
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='activity_records' AND policyname='ar_owner_read') THEN
    CREATE POLICY ar_owner_read ON public.activity_records
      FOR SELECT USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='activity_records' AND policyname='ar_admin_read') THEN
    CREATE POLICY ar_admin_read ON public.activity_records
      FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
      ));
  END IF;

  /* Admin moderation of a flagged record. */
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='activity_records' AND policyname='ar_admin_update') THEN
    CREATE POLICY ar_admin_update ON public.activity_records
      FOR UPDATE USING (EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
      ));
  END IF;
END $$;

/* -- quest_task_activity_config -------------------------------------------- */

DO $$
BEGIN
  /* Mirrors qt_public_read on quest_tasks: participants must be able to read
     the target in order to see their own progress bar. */
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='quest_task_activity_config' AND policyname='qtac_public_read') THEN
    CREATE POLICY qtac_public_read ON public.quest_task_activity_config
      FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.quests q
        WHERE q.id = quest_task_activity_config.quest_id
          AND q.quest_status = ANY (ARRAY['published','active','completed'])
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='quest_task_activity_config' AND policyname='qtac_business_owner') THEN
    CREATE POLICY qtac_business_owner ON public.quest_task_activity_config
      FOR ALL USING (EXISTS (
        SELECT 1 FROM public.quests q
        WHERE q.id = quest_task_activity_config.quest_id AND q.creator_id = auth.uid()
      ));
  END IF;
END $$;

/* -- quest_activity_progress ----------------------------------------------- */

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='quest_activity_progress' AND policyname='qap_owner_read') THEN
    CREATE POLICY qap_owner_read ON public.quest_activity_progress
      FOR SELECT USING (user_id = auth.uid());
  END IF;

  /* Quest-scoped business visibility — progress toward THEIR quest only. */
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='quest_activity_progress' AND policyname='qap_business_read') THEN
    CREATE POLICY qap_business_read ON public.quest_activity_progress
      FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.quests q
        WHERE q.id = quest_activity_progress.quest_id AND q.creator_id = auth.uid()
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='quest_activity_progress' AND policyname='qap_admin_read') THEN
    CREATE POLICY qap_admin_read ON public.quest_activity_progress
      FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
      ));
  END IF;
END $$;

/* -- activity_sync_logs ---------------------------------------------------- */

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='activity_sync_logs' AND policyname='asl_owner_read') THEN
    CREATE POLICY asl_owner_read ON public.activity_sync_logs
      FOR SELECT USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='activity_sync_logs' AND policyname='asl_admin_read') THEN
    CREATE POLICY asl_admin_read ON public.activity_sync_logs
      FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
      ));
  END IF;
END $$;

/* -- activity_verification_events ------------------------------------------ */

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='activity_verification_events' AND policyname='ave_owner_read') THEN
    CREATE POLICY ave_owner_read ON public.activity_verification_events
      FOR SELECT USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='activity_verification_events' AND policyname='ave_business_read') THEN
    CREATE POLICY ave_business_read ON public.activity_verification_events
      FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.quests q
        WHERE q.id = activity_verification_events.quest_id AND q.creator_id = auth.uid()
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='activity_verification_events' AND policyname='ave_admin_read') THEN
    CREATE POLICY ave_admin_read ON public.activity_verification_events
      FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
      ));
  END IF;
END $$;

/* -- Column-level hardening ------------------------------------------------ */

/* Even though activity_connection_secrets has no policies, revoke table
   privileges outright so an accidental future policy cannot leak tokens. */
REVOKE ALL ON public.activity_connection_secrets FROM anon, authenticated;
