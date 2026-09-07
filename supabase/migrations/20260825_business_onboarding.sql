-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260825_business_onboarding.sql
-- Project:   cxujipeulvhreiryaptr
-- Idempotent. Run once in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. business_profiles ─────────────────────────────────────────────────────
-- One row per business owner (auth.uid()). Reuses profiles.account_type = 'business'
-- to know a user is a business; no separate auth system needed.

CREATE TABLE IF NOT EXISTS business_profiles (
  id                  uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  -- Basics
  business_name       text,
  business_username   text UNIQUE,
  category            text,
  description         text,
  logo_url            text,
  -- Contact
  business_phone      text,
  business_email      text,
  website             text,
  -- Location
  address             text,
  city                text,
  state               text,
  pincode             text,
  country             text DEFAULT 'India',
  latitude            double precision,
  longitude           double precision,
  -- Verification
  verification_status text NOT NULL DEFAULT 'draft'
    CONSTRAINT bp_verification_status_check
    CHECK (verification_status IN ('draft','incomplete','submitted','under_review','verified','rejected','suspended')),
  rejection_reason    text,
  -- Onboarding state (resumable)
  onboarding_step     int NOT NULL DEFAULT 1,  -- last completed step (1-7)
  onboarding_done     boolean NOT NULL DEFAULT false,
  -- Stats (denormalised for dashboard perf)
  total_customers     int NOT NULL DEFAULT 0,
  total_challenges    int NOT NULL DEFAULT 0,
  total_participants  int NOT NULL DEFAULT 0,
  rating              numeric(3,1) NOT NULL DEFAULT 0.0,
  -- Timestamps
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;

-- Owner can read/write own business profile
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='business_profiles' AND policyname='bp_owner') THEN
    CREATE POLICY bp_owner ON business_profiles
      FOR ALL USING (auth.uid() = id);
  END IF;
END $$;

-- Admins can read all business profiles
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='business_profiles' AND policyname='bp_admin_read') THEN
    CREATE POLICY bp_admin_read ON business_profiles
      FOR SELECT
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;
END $$;

-- Public read for verified businesses only (for explore/discovery)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='business_profiles' AND policyname='bp_public_verified') THEN
    CREATE POLICY bp_public_verified ON business_profiles
      FOR SELECT
      USING (verification_status = 'verified');
  END IF;
END $$;

-- ── 2. business_social_links ─────────────────────────────────────────────────
-- Separate from user profile_social_links to avoid confusion.
-- Max 4 links enforced at application layer (same rule as profile).

CREATE TABLE IF NOT EXISTS business_social_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  platform    text NOT NULL CHECK (platform IN ('instagram','linkedin','github','twitter','youtube','portfolio','other')),
  url         text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE business_social_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='business_social_links' AND policyname='bsl_owner') THEN
    CREATE POLICY bsl_owner ON business_social_links
      FOR ALL USING (auth.uid() = business_id);
  END IF;
END $$;

-- ── 3. business_verification_requests ────────────────────────────────────────
-- Participant generates SV-XXXXXX → business enters it → approve/reject
-- After approval a one-time bill code (STRIV-XXXX) is generated here.

CREATE TABLE IF NOT EXISTS business_verification_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The SV-XXXXXX code the participant shows the business
  sv_code             text NOT NULL UNIQUE,
  -- Who is requesting (participant)
  participant_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Which business this targets
  business_id         uuid NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  -- What challenge/quest this is for
  challenge_id        uuid REFERENCES challenges(id) ON DELETE SET NULL,
  quest_id            uuid REFERENCES quests(id)     ON DELETE SET NULL,
  -- Activity metadata
  verification_type   text NOT NULL DEFAULT 'business_visit'
    CHECK (verification_type IN ('business_visit','purchase','checkin','other')),
  activity_day        int,   -- day number within a challenge
  -- Status lifecycle
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','expired')),
  rejection_reason    text,
  -- After business approval: one-time bill code written on physical receipt
  bill_code           text UNIQUE,        -- STRIV-XXXX, generated on approval
  bill_code_expires_at timestamptz,       -- 30 min after approval
  bill_code_used      boolean NOT NULL DEFAULT false,
  -- Timestamps
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  expires_at          timestamptz DEFAULT (now() + interval '24 hours')
);

ALTER TABLE business_verification_requests ENABLE ROW LEVEL SECURITY;

-- Participants can create and read their own requests
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='business_verification_requests' AND policyname='bvr_participant') THEN
    CREATE POLICY bvr_participant ON business_verification_requests
      FOR ALL USING (auth.uid() = participant_id);
  END IF;
END $$;

-- Businesses can read and update requests targeted at them
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='business_verification_requests' AND policyname='bvr_business') THEN
    CREATE POLICY bvr_business ON business_verification_requests
      FOR ALL USING (auth.uid() = business_id);
  END IF;
END $$;

-- Admins can read all
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='business_verification_requests' AND policyname='bvr_admin') THEN
    CREATE POLICY bvr_admin ON business_verification_requests
      FOR SELECT
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;
END $$;

-- Index for fast SV-code lookup
CREATE INDEX IF NOT EXISTS idx_bvr_sv_code       ON business_verification_requests (sv_code);
CREATE INDEX IF NOT EXISTS idx_bvr_business_id   ON business_verification_requests (business_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bvr_participant_id ON business_verification_requests (participant_id, created_at DESC);

-- ── 4. Notifications for business events ──────────────────────────────────────
-- The existing notifications table is already used by alerts; we reuse it.
-- No schema change needed — notifications.user_id accepts any uid.

-- ── 5. Helper: generate a unique SV code ──────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_sv_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  code text;
  exists_already boolean;
BEGIN
  LOOP
    code := 'SV-' || LPAD(floor(random() * 1000000)::text, 6, '0');
    SELECT EXISTS(
      SELECT 1 FROM business_verification_requests WHERE sv_code = code
    ) INTO exists_already;
    EXIT WHEN NOT exists_already;
  END LOOP;
  RETURN code;
END;
$$;

-- ── 6. Helper: generate a unique STRIV bill code ─────────────────────────────
CREATE OR REPLACE FUNCTION generate_bill_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  code text;
  exists_already boolean;
BEGIN
  LOOP
    code := 'STRIV-' || LPAD(floor(random() * 10000)::text, 4, '0');
    SELECT EXISTS(
      SELECT 1 FROM business_verification_requests WHERE bill_code = code
    ) INTO exists_already;
    EXIT WHEN NOT exists_already;
  END LOOP;
  RETURN code;
END;
$$;
