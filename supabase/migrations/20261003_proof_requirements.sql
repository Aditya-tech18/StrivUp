/*
 * 20261003_proof_requirements.sql — what a given task's proof must show.
 *
 * WHY
 * ---
 * review-proof judged an image against the task title alone, under an
 * instruction to "be reasonably lenient". So a photo of a closed book passed a
 * "read 20 pages" task, and a gym selfie passed "run 5 km" — the model had
 * nothing concrete to hold the image to.
 *
 * One row here per task carries an explicit specification: what the image must
 * show, what merely helps, and the near-misses to reject. The participant is
 * shown the same list BEFORE uploading, so nobody is rejected for guessing
 * wrong, and review-proof judges against exactly what they were promised.
 *
 * Specs come from a catalog for known activity kinds (src/lib/proof/categories.ts
 * — no model call, same answer every time) and from the model only for
 * "Something else", where the activity is genuinely unknown.
 *
 * Polymorphic over both domains, matching quest_task_activity_config.
 */

CREATE TABLE IF NOT EXISTS public.proof_requirements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_task_id     uuid REFERENCES public.quest_tasks(id) ON DELETE CASCADE,
  challenge_task_id uuid REFERENCES public.challenge_tasks(id) ON DELETE CASCADE,
  activity_category text NOT NULL,
  custom_activity   text,
  activity_label    text NOT NULL,
  required_elements text[] NOT NULL DEFAULT '{}',
  optional_elements text[] NOT NULL DEFAULT '{}',
  reject_if         text[] NOT NULL DEFAULT '{}',
  participant_hint  text,
  generated_by      text NOT NULL DEFAULT 'template',
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT proof_req_one_domain_check CHECK (
    (quest_task_id IS NOT NULL AND challenge_task_id IS NULL)
    OR (challenge_task_id IS NOT NULL AND quest_task_id IS NULL)
  ),
  CONSTRAINT proof_req_generated_by_check CHECK (
    generated_by = ANY (ARRAY['template','ai','creator'])
  ),
  /* "other" is derived from free text — keep the text, or the spec cannot be
     explained or regenerated later. */
  CONSTRAINT proof_req_custom_needs_text CHECK (
    activity_category <> 'other' OR custom_activity IS NOT NULL
  ),
  /* A spec with nothing required would accept any image at all, which is worse
     than having no spec: the UI would promise checks that never happen. */
  CONSTRAINT proof_req_has_requirements CHECK (
    array_length(required_elements, 1) >= 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS proof_req_quest_task_uidx
  ON public.proof_requirements (quest_task_id) WHERE quest_task_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS proof_req_challenge_task_uidx
  ON public.proof_requirements (challenge_task_id) WHERE challenge_task_id IS NOT NULL;

ALTER TABLE public.proof_requirements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  /* Participants must read the spec — it is shown before they upload. It
     contains no personal data, only what a photo should contain. */
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='proof_requirements' AND policyname='proof_req_public_read') THEN
    CREATE POLICY proof_req_public_read ON public.proof_requirements
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='proof_requirements' AND policyname='proof_req_quest_owner') THEN
    CREATE POLICY proof_req_quest_owner ON public.proof_requirements
      FOR ALL USING (
        quest_task_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.quest_tasks t
          JOIN public.quests q ON q.id = t.quest_id
          WHERE t.id = proof_requirements.quest_task_id AND q.creator_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='proof_requirements' AND policyname='proof_req_challenge_owner') THEN
    CREATE POLICY proof_req_challenge_owner ON public.proof_requirements
      FOR ALL USING (
        challenge_task_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.challenge_tasks t
          JOIN public.challenges c ON c.id = t.challenge_id
          WHERE t.id = proof_requirements.challenge_task_id AND c.creator_id = auth.uid()));
  END IF;
END $$;

DROP TRIGGER IF EXISTS proof_requirements_touch ON public.proof_requirements;
CREATE TRIGGER proof_requirements_touch BEFORE UPDATE ON public.proof_requirements
  FOR EACH ROW EXECUTE FUNCTION public.strivup_touch_updated_at();
