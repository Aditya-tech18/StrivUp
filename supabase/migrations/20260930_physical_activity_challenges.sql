/*
 * 20260930_physical_activity_challenges.sql
 *
 * Extends physical activity from quests to challenges (Option B: one engine,
 * two domains — rather than a parallel set of challenge-only tables).
 *
 * WHY THE TABLE NAMES STILL SAY "quest"
 * -------------------------------------
 * quest_task_activity_config and quest_activity_progress now hold rows for
 * both domains. Renaming them would mean rewriting every policy, function and
 * TypeScript reference on a feature that is already live and tested, for a
 * cosmetic gain. The columns make the domain explicit instead, and a CHECK
 * guarantees a row belongs to exactly one.
 *
 * HOW THE TWO DOMAINS DIFFER
 *   quest      window is global:         quests.start_date .. end_date
 *   challenge  window is per-participant: joined_at .. joined_at + duration_days
 *
 *   quest      completion writes quest_task_submissions, then creates an
 *              'eligible' quest_reward_claim
 *   challenge  completion writes proof_submissions (which needs a day_number),
 *              then calls settle_challenge_completions — challenges reward with
 *              streaks and completion status, not coupons
 *
 * What is shared, and why this was worth doing: activity_records,
 * ingest_activity_records, the fraud heuristics, physical_activity_value and
 * the whole in-app pedometer. A user who walks 6,000 steps satisfies their
 * business quest AND their personal challenge from the same walk, because
 * progress is a projection over one immutable activity record.
 */

/* -- 1. Allow the proof type on challenge tasks --------------------------- */

ALTER TABLE public.challenge_tasks DROP CONSTRAINT IF EXISTS challenge_tasks_proof_type_check;
ALTER TABLE public.challenge_tasks ADD CONSTRAINT challenge_tasks_proof_type_check
  CHECK (proof_type IS NULL OR proof_type = ANY (ARRAY[
    'photo','video','text','link','none','physical_activity'
  ]));

/* -- 2. Make the config table polymorphic --------------------------------- */

ALTER TABLE public.quest_task_activity_config
  ADD COLUMN IF NOT EXISTS challenge_task_id uuid REFERENCES public.challenge_tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS challenge_id      uuid REFERENCES public.challenges(id) ON DELETE CASCADE;

ALTER TABLE public.quest_task_activity_config ALTER COLUMN task_id  DROP NOT NULL;
ALTER TABLE public.quest_task_activity_config ALTER COLUMN quest_id DROP NOT NULL;

/* Exactly one domain per row — never both, never neither. */
ALTER TABLE public.quest_task_activity_config DROP CONSTRAINT IF EXISTS qtac_one_domain_check;
ALTER TABLE public.quest_task_activity_config ADD CONSTRAINT qtac_one_domain_check CHECK (
  (task_id IS NOT NULL AND quest_id IS NOT NULL
     AND challenge_task_id IS NULL AND challenge_id IS NULL)
  OR
  (challenge_task_id IS NOT NULL AND challenge_id IS NOT NULL
     AND task_id IS NULL AND quest_id IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS qtac_challenge_task_uidx
  ON public.quest_task_activity_config (challenge_task_id)
  WHERE challenge_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS qtac_challenge_idx
  ON public.quest_task_activity_config (challenge_id);

/* -- 3. Make the progress table polymorphic ------------------------------- */

ALTER TABLE public.quest_activity_progress
  ADD COLUMN IF NOT EXISTS challenge_task_id uuid REFERENCES public.challenge_tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS challenge_id      uuid REFERENCES public.challenges(id) ON DELETE CASCADE;

ALTER TABLE public.quest_activity_progress ALTER COLUMN task_id  DROP NOT NULL;
ALTER TABLE public.quest_activity_progress ALTER COLUMN quest_id DROP NOT NULL;

ALTER TABLE public.quest_activity_progress DROP CONSTRAINT IF EXISTS qap_one_domain_check;
ALTER TABLE public.quest_activity_progress ADD CONSTRAINT qap_one_domain_check CHECK (
  (task_id IS NOT NULL AND quest_id IS NOT NULL
     AND challenge_task_id IS NULL AND challenge_id IS NULL)
  OR
  (challenge_task_id IS NOT NULL AND challenge_id IS NOT NULL
     AND task_id IS NULL AND quest_id IS NULL)
);

/* The quest-side unique index allows many NULL task_id rows, so the challenge
   side needs its own or a resync would duplicate buckets. */
CREATE UNIQUE INDEX IF NOT EXISTS qap_challenge_task_user_period_uidx
  ON public.quest_activity_progress (challenge_task_id, user_id, period_date)
  WHERE challenge_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS qap_challenge_user_idx
  ON public.quest_activity_progress (challenge_id, user_id);

/* -- 4. RLS for the challenge side ---------------------------------------- */

DO $$
BEGIN
  /* Participants must read the target to see their own progress bar. */
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='quest_task_activity_config' AND policyname='qtac_challenge_read') THEN
    CREATE POLICY qtac_challenge_read ON public.quest_task_activity_config
      FOR SELECT USING (
        challenge_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.challenges c WHERE c.id = quest_task_activity_config.challenge_id
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='quest_task_activity_config' AND policyname='qtac_challenge_owner') THEN
    CREATE POLICY qtac_challenge_owner ON public.quest_task_activity_config
      FOR ALL USING (
        challenge_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.challenges c
          WHERE c.id = quest_task_activity_config.challenge_id AND c.creator_id = auth.uid()
        )
      );
  END IF;

  /* A challenge creator sees progress toward their own challenge, mirroring
     what a business sees for its quest — progress only, never raw activity. */
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='quest_activity_progress' AND policyname='qap_challenge_creator_read') THEN
    CREATE POLICY qap_challenge_creator_read ON public.quest_activity_progress
      FOR SELECT USING (
        challenge_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.challenges c
          WHERE c.id = quest_activity_progress.challenge_id AND c.creator_id = auth.uid()
        )
      );
  END IF;
END $$;
