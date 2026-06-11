-- Add social_platforms JSONB column to brand_profiles.
-- Stores array of { platform, handle, url } objects for connected social accounts.
-- Also adds the individual handle columns from the 20260610 migration if not yet applied.

ALTER TABLE brand_profiles
  ADD COLUMN IF NOT EXISTS tiktok_handle     TEXT,
  ADD COLUMN IF NOT EXISTS instagram_handle  TEXT,
  ADD COLUMN IF NOT EXISTS youtube_handle    TEXT,
  ADD COLUMN IF NOT EXISTS facebook_page     TEXT,
  ADD COLUMN IF NOT EXISTS target_platforms  JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS social_platforms  JSONB DEFAULT '[]'::jsonb;
