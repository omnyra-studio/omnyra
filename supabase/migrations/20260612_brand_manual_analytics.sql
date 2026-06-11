-- Add manual_analytics JSONB column to brand_profiles.
-- Stores { avg_views, engagement_rate, best_post_time, top_styles[] } entered by the user.

ALTER TABLE brand_profiles
  ADD COLUMN IF NOT EXISTS manual_analytics JSONB DEFAULT NULL;
