-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260823_profile_private.sql
-- Project:   cxujipeulvhreiryaptr
-- Run once in Supabase SQL Editor (Settings → SQL Editor → New query)
--
-- Creates the profile_private table which holds PII columns that were
-- previously (incorrectly) on the publicly-readable profiles table.
-- SAFE: uses IF NOT EXISTS / idempotent DDL.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── profile_private ───────────────────────────────────────────────────────────
-- One row per user, owner-only RLS. id is the same as auth.uid() / profiles.id.

CREATE TABLE IF NOT EXISTS profile_private (
  id             uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  age            integer,
  email          text,
  phone          text,
  phone_verified boolean NOT NULL DEFAULT false
);

ALTER TABLE profile_private ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profile_private' AND policyname = 'profile_private_owner'
  ) THEN
    CREATE POLICY profile_private_owner ON profile_private
      FOR ALL USING (auth.uid() = id);
  END IF;
END $$;

-- ── Remove PII columns from profiles (publicly readable) ──────────────────────
-- Only run these if the columns still exist (idempotent via DO block).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'age'
  ) THEN
    ALTER TABLE profiles DROP COLUMN age;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'email'
  ) THEN
    ALTER TABLE profiles DROP COLUMN email;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'phone'
  ) THEN
    ALTER TABLE profiles DROP COLUMN phone;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'phone_verified'
  ) THEN
    ALTER TABLE profiles DROP COLUMN phone_verified;
  END IF;
END $$;

-- ── profile_completed stays on profiles (not PII, used by public gate) ─────────
-- Add it if it was on profile_private previously; keep it here so proxy.ts
-- can check it via the publicly-readable profiles row.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS profile_completed boolean NOT NULL DEFAULT false;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
