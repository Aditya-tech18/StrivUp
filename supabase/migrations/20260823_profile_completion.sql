-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260823_profile_completion.sql
-- Project:   cxujipeulvhreiryaptr
-- Run once in Supabase SQL Editor (Settings → SQL Editor → New query)
--
-- Adds columns required by the profile-completion gate in proxy.ts and the
-- profile setup page. SAFE: uses IF NOT EXISTS / idempotent DDL.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── profiles additions ────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS age integer;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS profile_completed boolean NOT NULL DEFAULT false;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS username text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ── interests catalogue (static lookup table) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS interests (
  id      serial PRIMARY KEY,
  name    text NOT NULL,
  slug    text NOT NULL UNIQUE
);

-- Seed a small set of interests if the table is empty
INSERT INTO interests (name, slug)
SELECT name, slug FROM (VALUES
  ('Fitness',  'fitness'),
  ('Coding',   'coding'),
  ('Reading',  'reading'),
  ('Writing',  'writing'),
  ('Music',    'music'),
  ('Art',      'art'),
  ('Gaming',   'gaming'),
  ('Business', 'business'),
  ('Travel',   'travel'),
  ('Cooking',  'cooking')
) AS v(name, slug)
WHERE NOT EXISTS (SELECT 1 FROM interests LIMIT 1);

-- ── user_interests junction ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_interests (
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  interest_id integer REFERENCES interests(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, interest_id)
);

-- RLS: users can only read/write their own interests
ALTER TABLE user_interests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_interests' AND policyname = 'user_interests_own'
  ) THEN
    CREATE POLICY user_interests_own ON user_interests
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- RLS: interests catalogue is publicly readable
ALTER TABLE interests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'interests' AND policyname = 'interests_public_read'
  ) THEN
    CREATE POLICY interests_public_read ON interests
      FOR SELECT USING (true);
  END IF;
END $$;
