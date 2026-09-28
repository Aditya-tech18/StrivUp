-- ════════════════════════════════════════════════════════════════════════════
-- Roles, business verification (blue tick), account status, admin audit log
-- (NOT YET APPLIED — review, then apply)
--
-- Fixes two privilege-escalation holes found in the live schema:
--   • "Users can update their own profile" had no column limits, so any user
--     could set profiles.is_admin / moderator_role on themselves.
--   • "bp_owner_all" let a business set its own verification_status to
--     'verified' (self-granted blue tick) and edit rating/customer counts.
--
-- Roles stay where they already live: profiles.is_admin + profiles.moderator_role
-- (admin), profiles.account_type (user/creator/business). Privileged columns
-- can now only change through SECURITY DEFINER functions that check the
-- caller server-side. The initial admin is granted by email here, in the
-- database — never in frontend code.
--
-- Additive: no tables or columns dropped. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Role helpers ─────────────────────────────────────────────────────────

-- Full admin (business verification, account enforcement, audit log).
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p
                  WHERE p.id = p_user AND (p.is_admin = true OR p.moderator_role = 'super_admin'));
$$;

-- Admin or any moderator (content moderation). Same body as in the
-- order-verification migration, so either can be applied first.
CREATE OR REPLACE FUNCTION public.is_platform_reviewer(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p
                  WHERE p.id = p_user AND (p.is_admin = true OR coalesce(p.moderator_role, 'none') <> 'none'));
$$;

-- ── 2. Account status (admin enforcement) ───────────────────────────────────
-- Separate from profiles.is_deactivated, which is the user's own
-- self-service deactivation (they can reactivate). account_status is set by
-- admins only; users can't lift it themselves.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS account_status_reason text,
  ADD COLUMN IF NOT EXISTS account_status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_status_changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_status_check
  CHECK (account_status IN ('active', 'deactivated', 'suspended', 'banned'));

CREATE OR REPLACE FUNCTION public.is_account_active(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT account_status = 'active' FROM profiles WHERE id = p_user), true);
$$;

-- ── 3. Protect privileged profile columns ───────────────────────────────────
-- SECURITY INVOKER on purpose: inside a definer function current_user would
-- always be the owner and the guard would never fire.

CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_admin := false;
    NEW.moderator_role := 'none';
    NEW.verification_status := 'none';
    NEW.restriction_status := 'none';
    NEW.restriction_until := NULL;
    NEW.moderation_violation_count := 0;
    NEW.account_status := 'active';
    NEW.account_status_reason := NULL;
    NEW.account_status_changed_at := NULL;
    NEW.account_status_changed_by := NULL;
    RETURN NEW;
  END IF;

  NEW.is_admin                   := OLD.is_admin;
  NEW.moderator_role             := OLD.moderator_role;
  NEW.verification_status        := OLD.verification_status;
  NEW.restriction_status         := OLD.restriction_status;
  NEW.restriction_until          := OLD.restriction_until;
  NEW.moderation_violation_count := OLD.moderation_violation_count;
  NEW.account_status             := OLD.account_status;
  NEW.account_status_reason      := OLD.account_status_reason;
  NEW.account_status_changed_at  := OLD.account_status_changed_at;
  NEW.account_status_changed_by  := OLD.account_status_changed_by;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_guard_profile_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_columns();

-- ── 4. Bootstrap the initial admin (database-side, by email) ────────────────
UPDATE public.profiles p
   SET is_admin = true, moderator_role = 'super_admin'
  FROM auth.users u
 WHERE u.id = p.id AND lower(u.email) = 'strivup.officialteam@gmail.com';

-- ── 5. Business verification status (the one canonical blue-tick flag) ──────
-- business_profiles.verification_status stays the single source of truth:
--   draft / incomplete  → not submitted
--   submitted / under_review → pending review
--   needs_more_info     → admin asked for more
--   verified            → blue tick      rejected / suspended

ALTER TABLE public.business_profiles DROP CONSTRAINT IF EXISTS business_profiles_verification_status_check;
ALTER TABLE public.business_profiles ADD CONSTRAINT business_profiles_verification_status_check
  CHECK (verification_status IN ('draft', 'incomplete', 'submitted', 'under_review', 'needs_more_info',
                                 'verified', 'rejected', 'suspended'));

-- Owners may edit their profile, but not their verification state or the
-- platform-computed counters/rating.
CREATE OR REPLACE FUNCTION public.guard_business_profile_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.verification_status NOT IN ('draft', 'incomplete') THEN NEW.verification_status := 'draft'; END IF;
    NEW.rejection_reason := NULL;
    NEW.total_customers := 0; NEW.total_challenges := 0; NEW.total_participants := 0; NEW.rating := 0;
    RETURN NEW;
  END IF;

  -- Only draft ↔ incomplete is owner-controlled; everything else goes through
  -- submit_business_verification() / admin_review_business_verification().
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     AND NOT (OLD.verification_status IN ('draft', 'incomplete') AND NEW.verification_status IN ('draft', 'incomplete')) THEN
    NEW.verification_status := OLD.verification_status;
  END IF;
  NEW.rejection_reason   := OLD.rejection_reason;
  NEW.total_customers    := OLD.total_customers;
  NEW.total_challenges   := OLD.total_challenges;
  NEW.total_participants := OLD.total_participants;
  NEW.rating             := OLD.rating;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_business_profile_write ON public.business_profiles;
CREATE TRIGGER trg_guard_business_profile_write
  BEFORE INSERT OR UPDATE ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_profile_write();

-- ── 6. Verification submissions ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.business_verification_submissions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id          uuid NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  legal_name           text NOT NULL,
  business_type        text,
  representative_name  text NOT NULL,
  representative_role  text,
  phone                text,
  email                text,
  website              text,
  address              text,
  city                 text,
  state                text,
  country              text DEFAULT 'India',
  registration_ids     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- e.g. {"gstin": "...", "fssai": "..."}
  documents            jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ "path": "<uid>/...", "label": "Trade licence" }]
  notes                text,
  status               text NOT NULL DEFAULT 'pending_review'
                       CHECK (status IN ('pending_review', 'approved', 'rejected', 'needs_more_info', 'withdrawn')),
  review_note          text,     -- shown to the business (admins-only notes go to admin_audit_log)
  reviewed_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at          timestamptz,
  submitted_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bvs_business_idx ON public.business_verification_submissions (business_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS bvs_status_idx   ON public.business_verification_submissions (status, submitted_at);

ALTER TABLE public.business_verification_submissions ENABLE ROW LEVEL SECURITY;
-- Read-only to clients; which rows is decided by RLS below.
REVOKE ALL ON public.business_verification_submissions FROM anon, authenticated;
GRANT SELECT ON public.business_verification_submissions TO authenticated;

-- Owner reads own; admin reads all. No write policies: writes go through functions.
DROP POLICY IF EXISTS bvs_owner_read ON public.business_verification_submissions;
CREATE POLICY bvs_owner_read ON public.business_verification_submissions
  FOR SELECT TO authenticated USING (business_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS bvs_admin_read ON public.business_verification_submissions;
CREATE POLICY bvs_admin_read ON public.business_verification_submissions
  FOR SELECT TO authenticated USING ((SELECT public.is_platform_admin(auth.uid())));

-- ── 7. Private storage for verification documents ───────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-verification-docs', 'business-verification-docs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "bvd_owner_insert" ON storage.objects;
CREATE POLICY "bvd_owner_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'business-verification-docs' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "bvd_owner_read" ON storage.objects;
CREATE POLICY "bvd_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'business-verification-docs' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "bvd_admin_read" ON storage.objects;
CREATE POLICY "bvd_admin_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'business-verification-docs' AND (SELECT public.is_platform_admin(auth.uid())));

-- ── 8. Admin audit log ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action       text NOT NULL,
  target_type  text NOT NULL,
  target_id    uuid,
  reason       text,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx  ON public.admin_audit_log (target_type, target_id);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_log FROM anon, authenticated;
GRANT SELECT ON public.admin_audit_log TO authenticated;
DROP POLICY IF EXISTS aal_admin_read ON public.admin_audit_log;
CREATE POLICY aal_admin_read ON public.admin_audit_log
  FOR SELECT TO authenticated USING ((SELECT public.is_platform_admin(auth.uid())));
-- Append-only: no insert/update/delete policies; rows are written by functions.

CREATE OR REPLACE FUNCTION public.log_admin_action(p_action text, p_target_type text, p_target_id uuid,
                                                   p_reason text DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, reason, metadata)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_reason, coalesce(p_metadata, '{}'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.log_admin_action(text, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ── 9. Business: submit for verification ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_business_verification(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bp  business_profiles%ROWTYPE;
  v_id  uuid;
  v_doc jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;
  IF NOT is_account_active(v_uid) THEN RETURN jsonb_build_object('ok', false, 'error', 'account_restricted'); END IF;

  SELECT * INTO v_bp FROM business_profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'no_business'); END IF;
  IF v_bp.verification_status = 'verified'  THEN RETURN jsonb_build_object('ok', false, 'error', 'already_verified'); END IF;
  IF v_bp.verification_status = 'suspended' THEN RETURN jsonb_build_object('ok', false, 'error', 'suspended'); END IF;
  IF EXISTS (SELECT 1 FROM business_verification_submissions WHERE business_id = v_uid AND status = 'pending_review') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_pending');
  END IF;

  IF coalesce(trim(p->>'legal_name'), '') = '' OR coalesce(trim(p->>'representative_name'), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_fields');
  END IF;
  IF jsonb_typeof(coalesce(p->'documents', '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p->'documents', '[]'::jsonb)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_documents');
  END IF;
  -- Documents must live in the caller's own private folder.
  FOR v_doc IN SELECT * FROM jsonb_array_elements(p->'documents') LOOP
    IF split_part(coalesce(v_doc->>'path', ''), '/', 1) <> v_uid::text THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_document');
    END IF;
  END LOOP;

  INSERT INTO business_verification_submissions
    (business_id, legal_name, business_type, representative_name, representative_role, phone, email, website,
     address, city, state, country, registration_ids, documents, notes)
  VALUES
    (v_uid, trim(p->>'legal_name'), p->>'business_type', trim(p->>'representative_name'), p->>'representative_role',
     p->>'phone', p->>'email', p->>'website', p->>'address', p->>'city', p->>'state', coalesce(p->>'country', 'India'),
     coalesce(p->'registration_ids', '{}'::jsonb), p->'documents', p->>'notes')
  RETURNING id INTO v_id;

  UPDATE business_profiles SET verification_status = 'submitted', rejection_reason = NULL, updated_at = now()
   WHERE id = v_uid;

  -- Queue indicator for admins (create_notification swallows its own errors,
  -- so a notification problem never blocks the submission).
  PERFORM create_notification(p2.id, 'admin_business_verification', 'New business verification',
            coalesce(v_bp.business_name, 'A business') || ' submitted verification documents.', NULL, v_uid, NULL)
     FROM profiles p2 WHERE p2.is_admin = true OR p2.moderator_role = 'super_admin';

  RETURN jsonb_build_object('ok', true, 'submission_id', v_id);
END;
$$;

-- ── 10. Admin: review verification ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_review_business_verification(
  p_submission_id uuid, p_decision text, p_note text DEFAULT NULL, p_internal_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_sub  business_verification_submissions%ROWTYPE;
  v_new_sub text;
  v_new_bp  text;
BEGIN
  IF NOT is_platform_admin(v_uid) THEN RETURN jsonb_build_object('ok', false, 'error', 'forbidden'); END IF;
  IF p_decision NOT IN ('approve', 'reject', 'needs_more_info') THEN RETURN jsonb_build_object('ok', false, 'error', 'bad_decision'); END IF;
  IF p_decision IN ('reject', 'needs_more_info') AND coalesce(trim(p_note), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'note_required');
  END IF;

  SELECT * INTO v_sub FROM business_verification_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_sub.status <> 'pending_review' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_reviewed'); END IF;

  v_new_sub := CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'needs_more_info' END;
  v_new_bp  := CASE p_decision WHEN 'approve' THEN 'verified' WHEN 'reject' THEN 'rejected' ELSE 'needs_more_info' END;

  UPDATE business_verification_submissions
     SET status = v_new_sub, review_note = nullif(trim(p_note), ''), reviewed_by = v_uid, reviewed_at = now()
   WHERE id = v_sub.id;

  UPDATE business_profiles
     SET verification_status = v_new_bp,
         rejection_reason = CASE WHEN p_decision = 'approve' THEN NULL ELSE nullif(trim(p_note), '') END,
         updated_at = now()
   WHERE id = v_sub.business_id;

  PERFORM log_admin_action('business_verification_' || v_new_sub, 'business', v_sub.business_id, nullif(trim(p_note), ''),
                           jsonb_build_object('submission_id', v_sub.id, 'internal_note', nullif(trim(p_internal_note), '')));

  PERFORM create_notification(v_sub.business_id, 'business_verification_' || v_new_sub,
          CASE p_decision WHEN 'approve' THEN 'Your business is verified ✓'
                          WHEN 'reject'  THEN 'Business verification not approved'
                          ELSE 'More information needed for verification' END,
          CASE WHEN p_decision = 'approve' THEN 'Your blue verified badge is now visible across STRIVUP.'
               ELSE trim(p_note) END,
          NULL, NULL, NULL);

  RETURN jsonb_build_object('ok', true, 'status', v_new_bp);
END;
$$;

-- Admin: suspend or restore an already-verified business's badge.
CREATE OR REPLACE FUNCTION public.admin_set_business_verification(p_business_id uuid, p_status text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old text;
BEGIN
  IF NOT is_platform_admin(auth.uid()) THEN RETURN jsonb_build_object('ok', false, 'error', 'forbidden'); END IF;
  IF p_status NOT IN ('verified', 'suspended') THEN RETURN jsonb_build_object('ok', false, 'error', 'bad_status'); END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'note_required'); END IF;
  SELECT verification_status INTO v_old FROM business_profiles WHERE id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  UPDATE business_profiles SET verification_status = p_status, updated_at = now() WHERE id = p_business_id;
  PERFORM log_admin_action('business_status_' || p_status, 'business', p_business_id, trim(p_reason),
                           jsonb_build_object('from', v_old));
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── 11. Admin: account status ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_set_account_status(p_user_id uuid, p_status text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old text;
BEGIN
  IF NOT is_platform_admin(v_uid) THEN RETURN jsonb_build_object('ok', false, 'error', 'forbidden'); END IF;
  IF p_status NOT IN ('active', 'deactivated', 'suspended', 'banned') THEN RETURN jsonb_build_object('ok', false, 'error', 'bad_status'); END IF;
  IF p_user_id = v_uid THEN RETURN jsonb_build_object('ok', false, 'error', 'self'); END IF;
  IF is_platform_admin(p_user_id) THEN RETURN jsonb_build_object('ok', false, 'error', 'target_admin'); END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'reason_required'); END IF;

  SELECT account_status INTO v_old FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_old = p_status THEN RETURN jsonb_build_object('ok', true, 'unchanged', true); END IF;

  UPDATE profiles
     SET account_status = p_status, account_status_reason = trim(p_reason),
         account_status_changed_at = now(), account_status_changed_by = v_uid, updated_at = now()
   WHERE id = p_user_id;

  PERFORM log_admin_action(CASE WHEN p_status = 'active' THEN 'account_restored' ELSE 'account_' || p_status END,
                           'user', p_user_id, trim(p_reason), jsonb_build_object('from', v_old));
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── 12. Admin: search users (email comes from auth.users, admins only) ──────

CREATE OR REPLACE FUNCTION public.admin_search_users(p_query text DEFAULT '', p_status text DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS TABLE (id uuid, full_name text, username text, email text, avatar_url text, account_type text,
               account_status text, account_status_reason text, is_deactivated boolean, is_admin boolean,
               created_at timestamptz, report_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_platform_admin(auth.uid()) THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, p.username, u.email::text, p.avatar_url, p.account_type,
         p.account_status, p.account_status_reason, coalesce(p.is_deactivated, false), coalesce(p.is_admin, false),
         p.created_at,
         (SELECT count(*) FROM proof_reports r JOIN proof_submissions s ON s.id = r.proof_id WHERE s.user_id = p.id)
    FROM profiles p
    LEFT JOIN auth.users u ON u.id = p.id
   WHERE (p_status IS NULL OR p.account_status = p_status)
     AND (coalesce(trim(p_query), '') = ''
          OR p.full_name ILIKE '%' || p_query || '%'
          OR p.username  ILIKE '%' || p_query || '%'
          OR u.email     ILIKE '%' || p_query || '%'
          OR p.id::text = trim(p_query))
   ORDER BY p.created_at DESC
   LIMIT least(greatest(p_limit, 1), 200);
END;
$$;

-- ── 13. Admin: platform overview (real counts only) ─────────────────────────

CREATE OR REPLACE FUNCTION public.admin_platform_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_platform_reviewer(auth.uid()) THEN RETURN jsonb_build_object('ok', false, 'error', 'forbidden'); END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'total_users',            (SELECT count(*) FROM profiles),
    'new_users_30d',          (SELECT count(*) FROM profiles WHERE created_at > now() - interval '30 days'),
    'businesses',             (SELECT count(*) FROM business_profiles),
    'verified_businesses',    (SELECT count(*) FROM business_profiles WHERE verification_status = 'verified'),
    'pending_verifications',  (SELECT count(*) FROM business_verification_submissions WHERE status = 'pending_review'),
    'active_quests',          (SELECT count(*) FROM quests WHERE quest_status IN ('active', 'published') OR (quest_status IS NULL AND status = 'active')),
    'challenges',             (SELECT count(*) FROM challenges),
    'pending_reports',        (SELECT count(*) FROM proof_reports WHERE status = 'pending'),
    'suspended_accounts',     (SELECT count(*) FROM profiles WHERE account_status = 'suspended'),
    'banned_accounts',        (SELECT count(*) FROM profiles WHERE account_status = 'banned'),
    'deactivated_accounts',   (SELECT count(*) FROM profiles WHERE account_status = 'deactivated' OR is_deactivated)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_business_verification(jsonb)                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_business_verification(uuid, text, text, text)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_business_verification(uuid, text, text)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_account_status(uuid, text, text)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_search_users(text, text, integer)                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_platform_stats()                                         FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_business_verification(jsonb)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_business_verification(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_business_verification(uuid, text, text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_account_status(uuid, text, text)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_users(text, text, integer)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_platform_stats()                                      TO authenticated;

-- ── 14. Restricted accounts can't create content or join ────────────────────
-- RESTRICTIVE policies are AND-ed with the existing permissive ones.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proof_submissions', 'quest_participants', 'challenge_participants',
                           'challenges', 'quests', 'quest_task_submissions']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'active_account_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_account_active(auth.uid())))',
                   'active_account_insert', t);
  END LOOP;
END $$;

-- ── 15. Admins can read everything they moderate ────────────────────────────
DROP POLICY IF EXISTS quests_admin_read ON public.quests;
CREATE POLICY quests_admin_read ON public.quests FOR SELECT TO authenticated
  USING ((SELECT public.is_platform_reviewer(auth.uid())));
DROP POLICY IF EXISTS challenges_admin_read ON public.challenges;
CREATE POLICY challenges_admin_read ON public.challenges FOR SELECT TO authenticated
  USING ((SELECT public.is_platform_reviewer(auth.uid())));
-- bp_admin_read already exists on business_profiles (is_admin); widen it to super_admin too.
DROP POLICY IF EXISTS bp_admin_read ON public.business_profiles;
CREATE POLICY bp_admin_read ON public.business_profiles FOR SELECT TO authenticated
  USING ((SELECT public.is_platform_admin(auth.uid())));
