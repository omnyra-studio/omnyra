-- Migration: Create user-uploads storage bucket for voiceover audio and other user assets.
--
-- The cinematic pipeline uploads TTS voiceover audio to this bucket so the
-- server-side compose-video route can fetch it via a signed URL. Without this
-- bucket the upload returns 400 and the cinematic video has no audio track.
--
-- Bucket is private (public=false). Users read/write only their own path prefix.
-- Safe to run multiple times (INSERT … ON CONFLICT DO NOTHING).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-uploads',
  'user-uploads',
  false,
  52428800,  -- 50 MB
  ARRAY['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm', 'video/mp4', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ── RLS policies ──────────────────────────────────────────────────────────────

-- Users can upload files under their own uid/ prefix
CREATE POLICY "user_uploads_insert_own_path"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'user-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can read their own files
CREATE POLICY "user_uploads_select_own_path"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'user-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete their own files
CREATE POLICY "user_uploads_delete_own_path"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'user-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Service role (supabaseAdmin) can access all paths (bypasses RLS by default,
-- but explicit policy makes intent clear for auditing)
CREATE POLICY "user_uploads_service_role_all"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'user-uploads')
WITH CHECK (bucket_id = 'user-uploads');
