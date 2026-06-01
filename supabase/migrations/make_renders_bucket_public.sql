-- Migration 30: Make the 'renders' storage bucket publicly readable.
--
-- The avatar pipeline stores audio files in the 'renders' bucket and passes
-- those URLs to fal.ai (sync-lipsync model). fal.ai fetches the audio over
-- the public internet — it has no Supabase credentials. When the bucket is
-- private the fetch fails with 403, which fal returns as 422 Unprocessable
-- Entity on the result endpoint.
--
-- Safe to run multiple times (UPDATE is idempotent when bucket already public).

UPDATE storage.buckets
SET    public = true
WHERE  id = 'renders';
