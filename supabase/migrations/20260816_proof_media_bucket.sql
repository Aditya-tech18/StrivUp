-- Create the public proof-media storage bucket.
-- Run this in the Supabase SQL Editor (Settings → SQL Editor) once.
-- The bucket stores challenge thumbnails and daily proof uploads.

INSERT INTO storage.buckets (id, name, public)
VALUES ('proof-media', 'proof-media', true)
ON CONFLICT (id) DO NOTHING;

-- ── RLS policies on storage.objects ──────────────────────────────────────

-- Authenticated users can upload objects whose first path segment is
-- their own user id (e.g. {userId}/thumbnails/... or {userId}/proofs/...).
CREATE POLICY "Authenticated users can upload to own folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'proof-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Anyone (including unauthenticated) can read public proof media.
CREATE POLICY "Public read access for proof-media"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'proof-media');

-- Authenticated users can update/delete their own objects.
CREATE POLICY "Users can update their own objects"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'proof-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own objects"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'proof-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
