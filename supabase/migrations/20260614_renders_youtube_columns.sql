-- Add YouTube upload tracking columns to renders.
-- Used by /api/social-upload when a video is uploaded to YouTube via OAuth.
-- Safe to re-run: ADD COLUMN IF NOT EXISTS.

ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS uploaded_to_youtube boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS youtube_video_id    text,
  ADD COLUMN IF NOT EXISTS updated_at          timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_renders_youtube
  ON renders(user_id, uploaded_to_youtube)
  WHERE uploaded_to_youtube = true;
