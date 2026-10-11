/*
 * 20261011_business_favorites.sql — follow a business for its future quests.
 *
 * Distinct from saving a single quest: this follows the BUSINESS, so when they
 * publish anything new every follower is notified.
 *
 * Also repairs notifications_type_check. A branch merge replaced it with a list
 * that added 'proof_liked'/'proof_commented' but dropped the four activity_*
 * types, which would have made every physical-task completion notification
 * fail at runtime. The list below is the union of both plus the new type.
 */

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'new_follower','proof_approved','proof_rejected','challenge_joined',
    'proof_removed','business_verification_approved','business_verification_rejected',
    'business_bill_code_generated','quest_joined','quest_task_approved',
    'quest_task_rejected','quest_completed','quest_reward_earned',
    'quest_reward_fulfilled','follow_request','follow_accepted','challenge_completed',
    'proof_liked','proof_commented',
    'activity_synced','activity_goal_near','activity_task_completed','activity_flagged',
    'business_new_quest'
  ]));

CREATE TABLE IF NOT EXISTS public.business_favorites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS business_favorites_user_biz_uidx
  ON public.business_favorites (user_id, business_id);
CREATE INDEX IF NOT EXISTS business_favorites_biz_idx
  ON public.business_favorites (business_id);

ALTER TABLE public.business_favorites ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='business_favorites' AND policyname='biz_fav_owner') THEN
    CREATE POLICY biz_fav_owner ON public.business_favorites
      FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

/*
 * Fires once, on the transition INTO a publicly visible state — not on every
 * later edit of an already-published quest, which would spam followers.
 */
CREATE OR REPLACE FUNCTION public.notify_business_favorites_new_quest()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_fav record;
  v_name text;
BEGIN
  IF NEW.business_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.quest_status NOT IN ('published','active') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.quest_status IN ('published','active') THEN RETURN NEW; END IF;

  SELECT coalesce(NEW.business_name, b.business_name, 'A business')
    INTO v_name FROM business_profiles b WHERE b.id = NEW.business_id;

  FOR v_fav IN
    SELECT user_id FROM business_favorites WHERE business_id = NEW.business_id
  LOOP
    /* Never notify the creator about their own quest. */
    IF v_fav.user_id = NEW.creator_id THEN CONTINUE; END IF;
    PERFORM create_notification(
      v_fav.user_id, 'business_new_quest',
      format('New quest from %s', coalesce(v_name,'a business')),
      format('"%s" is now live.', NEW.title),
      NULL, NULL, NEW.id);
  END LOOP;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS quests_notify_favorites ON public.quests;
CREATE TRIGGER quests_notify_favorites
  AFTER INSERT OR UPDATE OF quest_status ON public.quests
  FOR EACH ROW EXECUTE FUNCTION public.notify_business_favorites_new_quest();
