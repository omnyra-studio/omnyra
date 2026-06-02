-- Creator Profiles — user-curated identity memory for the Director Core.
--
-- One row per user. Created on first generation or via onboarding wizard.
-- Distinct from user_profiles_extended (which is AGS-computed analytics).
--
-- The Director Core reads this table on every generation to condition:
--   - scene emotion + energy on communication_style + pacing
--   - hook selection on preferred_hooks
--   - CTA selection on preferred_ctas
--   - visual direction on visual_style + content_pillars
--
-- Safe to run multiple times (all statements are idempotent).

CREATE TABLE IF NOT EXISTS creator_profiles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Niche + Audience
  niche                TEXT,
  audience_type        TEXT,                              -- 'b2b' | 'consumer' | 'creator'

  -- Voice + Tone (used to condition Director Core performance specs)
  communication_style  TEXT NOT NULL DEFAULT 'conversational',
  pacing               TEXT NOT NULL DEFAULT 'measured',  -- 'slow' | 'measured' | 'fast'

  -- Content DNA (injected into hook/CTA selection in Director Core prompt)
  preferred_hooks      TEXT[] NOT NULL DEFAULT '{}',
  preferred_ctas       TEXT[] NOT NULL DEFAULT '{}',
  content_pillars      TEXT[] NOT NULL DEFAULT '{}',

  -- Visual (injected into Kling B-roll visual prompts)
  visual_style         TEXT,                              -- 'clean-minimal' | 'high-energy' | 'cinematic'
  brand_colors         TEXT[] NOT NULL DEFAULT '{}',

  -- Quality feedback loop (managed by lib/creator-profile.ts recordVideoOutcome)
  quality_score        NUMERIC(4, 3) NOT NULL DEFAULT 0.5,
  total_videos         INT NOT NULL DEFAULT 0,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_profiles_user_id
  ON creator_profiles(user_id);

ALTER TABLE creator_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator_profiles_owner_all" ON creator_profiles;
CREATE POLICY "creator_profiles_owner_all"
  ON creator_profiles
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
