-- ══════════════════════════════════════════════════════════════════════
-- Notification Triggers — fire-and-forget, never block main operation
-- Project: cxujipeulvhreiryaptr
-- ══════════════════════════════════════════════════════════════════════

-- ── Helper: create_notification ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type    text,
  p_title   text,
  p_message text DEFAULT NULL,
  p_related_challenge_id uuid DEFAULT NULL,
  p_related_user_id      uuid DEFAULT NULL,
  p_related_quest_id     uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.notifications
    (user_id, type, title, message, is_read,
     related_challenge_id, related_user_id, related_quest_id)
  VALUES
    (p_user_id, p_type, p_title, p_message, false,
     p_related_challenge_id, p_related_user_id, p_related_quest_id);
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- ── Trigger: new follower ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_new_follower()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_name text;
BEGIN
  IF NEW.request_status <> 'accepted' THEN RETURN NEW; END IF;
  SELECT full_name INTO v_name FROM public.profiles WHERE id = NEW.follower_id;
  PERFORM public.create_notification(
    NEW.followed_id, 'new_follower',
    COALESCE(v_name,'Someone') || ' started following you',
    NULL, NULL, NEW.follower_id
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_new_follower ON public.followers;
CREATE TRIGGER trg_notify_new_follower
  AFTER INSERT OR UPDATE OF request_status ON public.followers
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_follower();

-- ── Trigger: quest task proof reviewed ──────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_quest_task_reviewed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_task text; v_quest text;
BEGIN
  IF OLD.verification_status = NEW.verification_status THEN RETURN NEW; END IF;
  SELECT t.title, q.title INTO v_task, v_quest
  FROM public.quest_tasks t JOIN public.quests q ON q.id = t.quest_id
  WHERE t.id = NEW.task_id;
  IF NEW.verification_status = 'approved' THEN
    PERFORM public.create_notification(NEW.user_id,'quest_task_approved',
      '✓ Task approved: '||COALESCE(v_task,'Task'),
      'Your proof for "'||COALESCE(v_quest,'quest')||'" was approved.',
      NULL,NULL,NEW.quest_id);
  ELSIF NEW.verification_status IN ('rejected','resubmission_required') THEN
    PERFORM public.create_notification(NEW.user_id,'quest_task_rejected',
      'Task '||CASE WHEN NEW.verification_status='rejected' THEN 'rejected' ELSE 'needs resubmission' END||': '||COALESCE(v_task,'Task'),
      COALESCE(NEW.rejection_reason,'Please review your submission.'),
      NULL,NULL,NEW.quest_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_quest_task_reviewed ON public.quest_task_submissions;
CREATE TRIGGER trg_notify_quest_task_reviewed
  AFTER UPDATE OF verification_status ON public.quest_task_submissions
  FOR EACH ROW EXECUTE FUNCTION public.notify_quest_task_reviewed();

-- ── Trigger: proof_submissions reviewed ─────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_proof_reviewed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_title text;
BEGIN
  IF OLD.verification_status = NEW.verification_status THEN RETURN NEW; END IF;
  SELECT title INTO v_title FROM public.challenges WHERE id = NEW.challenge_id;
  IF NEW.verification_status = 'approved' THEN
    PERFORM public.create_notification(NEW.user_id,'proof_approved',
      '✓ Proof approved',
      'Your proof for "'||COALESCE(v_title,'challenge')||'" was approved.',
      NEW.challenge_id,NULL,NULL);
  ELSIF NEW.verification_status = 'rejected' THEN
    PERFORM public.create_notification(NEW.user_id,'proof_rejected',
      'Proof rejected',
      'Your proof for "'||COALESCE(v_title,'challenge')||'" was rejected.',
      NEW.challenge_id,NULL,NULL);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_proof_reviewed ON public.proof_submissions;
CREATE TRIGGER trg_notify_proof_reviewed
  AFTER UPDATE OF verification_status ON public.proof_submissions
  FOR EACH ROW EXECUTE FUNCTION public.notify_proof_reviewed();

-- ── Trigger: business verification status changed ────────────────────
CREATE OR REPLACE FUNCTION public.notify_business_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.verification_status = NEW.verification_status THEN RETURN NEW; END IF;
  IF NEW.verification_status = 'verified' THEN
    PERFORM public.create_notification(NEW.id,'business_verification_approved',
      '✓ Business Verified on STRIVUP!',
      'Your business is now verified. You can publish Quests.');
  ELSIF NEW.verification_status = 'rejected' THEN
    PERFORM public.create_notification(NEW.id,'business_verification_rejected',
      'Business Verification Rejected',
      COALESCE(NEW.rejection_reason,'Please resubmit with correct details.'));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_business_verification ON public.business_profiles;
CREATE TRIGGER trg_notify_business_verification
  AFTER UPDATE OF verification_status ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.notify_business_verification();
