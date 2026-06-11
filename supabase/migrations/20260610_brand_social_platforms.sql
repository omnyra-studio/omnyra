-- Brand profile: social media handles + target platforms
ALTER TABLE brand_profiles
  ADD COLUMN IF NOT EXISTS tiktok_handle     TEXT,
  ADD COLUMN IF NOT EXISTS instagram_handle  TEXT,
  ADD COLUMN IF NOT EXISTS youtube_handle    TEXT,
  ADD COLUMN IF NOT EXISTS facebook_page     TEXT,
  ADD COLUMN IF NOT EXISTS target_platforms  JSONB DEFAULT '[]'::jsonb;
