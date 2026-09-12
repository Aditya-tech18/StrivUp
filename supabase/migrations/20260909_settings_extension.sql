-- ============================================================
-- STRIVUP — Run this in Supabase SQL Editor (Dashboard > SQL)
-- Safe: fully idempotent. Run once to unlock all profile features.
-- ============================================================

-- 1. Add extended columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender               TEXT,
  ADD COLUMN IF NOT EXISTS is_deactivated       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_private           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_challenge_ids UUID[]  NOT NULL DEFAULT '{}';

-- 2. Add gender to profile_private
ALTER TABLE public.profile_private
  ADD COLUMN IF NOT EXISTS gender TEXT;

-- 3. profile_social_links
CREATE TABLE IF NOT EXISTS public.profile_social_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform   TEXT NOT NULL CHECK (platform IN ('instagram','linkedin','github','twitter','youtube','portfolio','other')),
  url        TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.profile_social_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profile_social_links' AND policyname='psl_owner') THEN
    CREATE POLICY psl_owner ON public.profile_social_links FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profile_social_links' AND policyname='psl_public_read') THEN
    CREATE POLICY psl_public_read ON public.profile_social_links FOR SELECT USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_psl_user_id ON public.profile_social_links(user_id);

-- 4. notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT,
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='notif_owner') THEN
    CREATE POLICY notif_owner ON public.notifications FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- 5. avatars storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='avatars_public_read') THEN
    CREATE POLICY "avatars_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='avatars_auth_upload') THEN
    CREATE POLICY "avatars_auth_upload" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='avatars_auth_update') THEN
    CREATE POLICY "avatars_auth_update" ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='avatars_auth_delete') THEN
    CREATE POLICY "avatars_auth_delete" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

-- 6. Seed interests
INSERT INTO public.interests (name, slug) VALUES
  ('Gym','gym'),('Dance','dance'),('Dating','dating'),
  ('Fashion','fashion'),('Spiritual','spiritual'),('Other','other'),
  ('Running','running'),('Meditation','meditation'),('Productivity','productivity'),
  ('Technology','technology'),('Business','business'),('Finance','finance'),
  ('Health','health'),('Photography','photography'),('Art','art'),
  ('Music','music'),('Cooking','cooking'),('Education','education'),
  ('Self Improvement','self_improvement'),('Gaming','gaming')
ON CONFLICT (slug) DO NOTHING;

-- 7. streaks VIEW
CREATE OR REPLACE VIEW public.streaks AS
WITH daily AS (
  SELECT user_id, challenge_id, submitted_at::date AS day
  FROM public.proof_submissions
  WHERE verification_status = 'approved'
  GROUP BY user_id, challenge_id, submitted_at::date
),
gaps AS (
  SELECT user_id, challenge_id, day,
    day - (ROW_NUMBER() OVER (PARTITION BY user_id, challenge_id ORDER BY day))::int AS grp
  FROM daily
),
runs AS (
  SELECT user_id, challenge_id, grp, COUNT(*) AS run_len, MAX(day) AS last_day
  FROM gaps GROUP BY user_id, challenge_id, grp
)
SELECT
  user_id, challenge_id,
  MAX(run_len) AS longest_streak,
  COALESCE(MAX(run_len) FILTER (WHERE last_day >= CURRENT_DATE - INTERVAL '1 day'), 0) AS current_streak
FROM runs GROUP BY user_id, challenge_id;

-- 8. profile_challenge_stats VIEW
CREATE OR REPLACE VIEW public.profile_challenge_stats AS
SELECT
  cp.user_id,
  cp.challenge_id,
  c.title,
  c.duration_days,
  c.thumbnail_url,
  LEAST(GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (now() - cp.joined_at)) / 86400)::int),
        COALESCE(c.duration_days, 99999)) AS current_day,
  COALESCE(st.current_streak,  0) AS current_streak,
  COALESCE(st.longest_streak,  0) AS longest_streak,
  CASE
    WHEN GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (now() - cp.joined_at)) / 86400)::int) = 0 THEN 0
    ELSE LEAST(100, ROUND(
      COUNT(ps.id) FILTER (WHERE ps.verification_status = 'approved') * 100.0
      / GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (now() - cp.joined_at)) / 86400)::int)
    ))
  END AS consistency_pct,
  cp.status,
  cp.joined_at,
  MAX(ps.submitted_at) FILTER (WHERE ps.verification_status = 'approved') AS completed_at
FROM public.challenge_participants cp
JOIN public.challenges c ON c.id = cp.challenge_id
LEFT JOIN public.proof_submissions ps
  ON ps.challenge_id = cp.challenge_id AND ps.user_id = cp.user_id
LEFT JOIN public.streaks st
  ON st.challenge_id = cp.challenge_id AND st.user_id = cp.user_id
GROUP BY cp.user_id, cp.challenge_id, c.title, c.duration_days,
         c.thumbnail_url, cp.joined_at, cp.status,
         st.current_streak, st.longest_streak;

-- 9. profile_heatmap VIEW
CREATE OR REPLACE VIEW public.profile_heatmap AS
SELECT
  user_id, challenge_id,
  submitted_at::date AS submission_date,
  COUNT(*) AS submission_count
FROM public.proof_submissions
WHERE verification_status = 'approved'
GROUP BY user_id, challenge_id, submitted_at::date;

-- 10. Indexes
CREATE INDEX IF NOT EXISTS idx_followers_followed_id ON public.followers(followed_id);
CREATE INDEX IF NOT EXISTS idx_followers_follower_id ON public.followers(follower_id);
CREATE INDEX IF NOT EXISTS idx_proof_user_challenge  ON public.proof_submissions(user_id, challenge_id);
CREATE INDEX IF NOT EXISTS idx_cp_user_id            ON public.challenge_participants(user_id);

-- Verify
SELECT
  'Done' AS status,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_deactivated') AS is_deactivated,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_private')     AS is_private,
  (SELECT COUNT(*) FROM information_schema.views  WHERE table_name='profile_challenge_stats') AS stats_view,
  (SELECT COUNT(*) FROM information_schema.views  WHERE table_name='profile_heatmap')         AS heatmap_view,
  (SELECT COUNT(*) FROM information_schema.views  WHERE table_name='streaks')                 AS streaks_view,
  (SELECT COUNT(*) FROM public.interests)                                                      AS interests;
