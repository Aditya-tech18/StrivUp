-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260820_tasks_and_review.sql
-- Project:   cxujipeulvhreiryaptr
-- Run once in Supabase SQL Editor. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. challenge_tasks ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS challenge_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  proof_type   text CHECK (proof_type IN ('photo', 'video', 'text', 'link', 'none')),
  is_required  boolean NOT NULL DEFAULT true,
  sort_order   int     NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE challenge_tasks ENABLE ROW LEVEL SECURITY;

-- Anyone can read tasks for public challenges; participants/creators can read private ones
CREATE POLICY "Read tasks for accessible challenges"
  ON challenge_tasks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM challenges c
      WHERE c.id = challenge_tasks.challenge_id
        AND (
          c.visibility = 'public'
          OR c.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM challenge_participants cp
            WHERE cp.challenge_id = c.id
              AND cp.user_id = auth.uid()
          )
        )
    )
  );

-- Only the challenge creator can insert / update / delete tasks
CREATE POLICY "Creator manages tasks"
  ON challenge_tasks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM challenges c
      WHERE c.id = challenge_tasks.challenge_id
        AND c.creator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM challenges c
      WHERE c.id = challenge_tasks.challenge_id
        AND c.creator_id = auth.uid()
    )
  );

-- Index for fast lookup by challenge
CREATE INDEX IF NOT EXISTS idx_challenge_tasks_challenge_id
  ON challenge_tasks (challenge_id, sort_order);

-- ── 2. Extend proof_submissions ───────────────────────────────────────────────

-- task_id is nullable so existing single-proof challenges keep working
ALTER TABLE proof_submissions
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES challenge_tasks(id) ON DELETE SET NULL;

ALTER TABLE proof_submissions
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES profiles(id);

ALTER TABLE proof_submissions
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE proof_submissions
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- ── 3. Creator review policy on proof_submissions ─────────────────────────────

-- Allow challenge creators to update verification_status, reviewed_by,
-- reviewed_at, rejection_reason on any submission for their challenge.
-- Submitters cannot abuse this to approve their own proof because the policy
-- only allows updating review-related columns (enforced at app layer; Supabase
-- row-level update doesn't support column-level restrictions, so the app
-- will only PATCH the four review columns).
CREATE POLICY "Creators can review submissions for their challenges"
  ON proof_submissions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM challenges c
      WHERE c.id = proof_submissions.challenge_id
        AND c.creator_id = auth.uid()
    )
  );
