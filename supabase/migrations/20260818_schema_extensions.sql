-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260818_schema_extensions.sql
-- Project:   cxujipeulvhreiryaptr
-- Run once in Supabase SQL Editor (Settings → SQL Editor → New query)
--
-- SAFE: every ALTER TABLE uses IF NOT EXISTS / conditional DDL so re-running
-- this script is idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. profiles additions ─────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'user'
    CONSTRAINT profiles_account_type_check
    CHECK (account_type IN ('user', 'creator', 'business'));

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bio text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'none'
    CONSTRAINT profiles_verification_status_check
    CHECK (verification_status IN ('none', 'pending', 'approved', 'rejected'));

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- ── 2. challenges additions ───────────────────────────────────────────────────

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS creator_type text NOT NULL DEFAULT 'user'
    CONSTRAINT challenges_creator_type_check
    CHECK (creator_type IN ('user', 'creator', 'business'));

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS campaign_objective text;

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS reward_description text;

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS proof_type text
    CONSTRAINT challenges_proof_type_check
    CHECK (proof_type IN ('none', 'photo', 'video', 'text', 'manual_review'));

-- Index so Explore's featured query is fast even with many challenges
CREATE INDEX IF NOT EXISTS idx_challenges_featured
  ON challenges (featured, visibility)
  WHERE featured = true;

-- ── 3. followers table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS followers (
  follower_id  uuid REFERENCES profiles(id) ON DELETE CASCADE,
  followed_id  uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),

  PRIMARY KEY (follower_id, followed_id),
  CONSTRAINT followers_no_self_follow CHECK (follower_id != followed_id)
);

-- Enable Row Level Security
ALTER TABLE followers ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated) can read follower rows
CREATE POLICY "Anyone can view followers"
  ON followers
  FOR SELECT
  USING (true);

-- Authenticated users can follow others (insert their own follower_id row)
CREATE POLICY "Users can follow others"
  ON followers
  FOR INSERT
  TO authenticated
  WITH CHECK (follower_id = auth.uid());

-- Users can only unfollow (delete) rows they created
CREATE POLICY "Users can unfollow"
  ON followers
  FOR DELETE
  TO authenticated
  USING (follower_id = auth.uid());
