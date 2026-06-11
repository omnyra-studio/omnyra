-- Social OAuth tokens: stored server-side only, never exposed to client
-- Access/refresh tokens for YouTube (and future platforms)
ALTER TABLE brand_profiles
  ADD COLUMN IF NOT EXISTS youtube_oauth JSONB DEFAULT NULL;
  -- Shape: { access_token, refresh_token, token_type, expiry_date, channel_id, channel_title }

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS brand_profiles_user_id_idx ON brand_profiles(user_id);

-- RLS: only the owning user can read/write their row (tokens are in the same row)
-- Tokens are only read via service_role_key on the server — never via anon key
