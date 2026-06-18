-- Create the 'renders' storage bucket (public) for cinematic outputs, voiceovers, and merged MP4s.
-- make_renders_bucket_public.sql only UPDATEs an existing bucket — this INSERT ensures it exists.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'renders',
  'renders',
  true,
  104857600,  -- 100 MB
  ARRAY['video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Service role uploads (merge, voiceover, cinematic pipeline)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'renders_service_role_all'
  ) THEN
    CREATE POLICY "renders_service_role_all"
    ON storage.objects
    FOR ALL
    TO service_role
    USING (bucket_id = 'renders')
    WITH CHECK (bucket_id = 'renders');
  END IF;
END $$;

-- Authenticated users can read all public renders (bucket is public)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'renders_public_read'
  ) THEN
    CREATE POLICY "renders_public_read"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'renders');
  END IF;
END $$;