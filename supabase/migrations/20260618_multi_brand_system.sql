-- Multi-brand system + rich memory + version history + assets
-- This enables "Support multiple brands per user" entirely in data layer.
-- Existing single-brand users get migrated to have 1 brand (is_default=true).
-- All changes are additive / safe. No visual impact.

-- 1. Enhance brand_profiles to support multiple per user (relax unique)
DO $$
BEGIN
  -- Drop the old unique on user_id if it exists (from setup.sql / brand_profiles.sql)
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'brand_profiles'::regclass 
      AND conname LIKE '%user_id%'
  ) THEN
    ALTER TABLE brand_profiles DROP CONSTRAINT IF EXISTS brand_profiles_user_id_key;
  END IF;
END $$;

-- Add columns for richer brand data (requirements: tone rules, hooks, disallowed, personas, etc.)
ALTER TABLE brand_profiles
  ADD COLUMN IF NOT EXISTS slug                TEXT,
  ADD COLUMN IF NOT EXISTS is_default          BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS guidelines_pdf_url  TEXT,
  ADD COLUMN IF NOT EXISTS logo_urls           TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS voice_sample_urls   TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS color_palette       JSONB  DEFAULT '{}',   -- extended from simple colors[]
  ADD COLUMN IF NOT EXISTS preferred_hooks     TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS disallowed_elements TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS emotional_triggers  TEXT[] DEFAULT '{}',   -- observable only, Ghost-safe
  ADD COLUMN IF NOT EXISTS visual_references   JSONB  DEFAULT '[]',   -- array of {url, description, weight}
  ADD COLUMN IF NOT EXISTS target_personas     JSONB  DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS consistency_score   NUMERIC(5,2) DEFAULT 50.0,  -- % auto-updated by feedback
  ADD COLUMN IF NOT EXISTS last_trained_at     TIMESTAMPTZ;

-- Make (user_id, slug) unique for easy switching (slug derived from name if not provided)
CREATE UNIQUE INDEX IF NOT EXISTS brand_profiles_user_slug_idx 
  ON brand_profiles (user_id, slug) 
  WHERE slug IS NOT NULL;

-- Default brand index (one default per user)
CREATE UNIQUE INDEX IF NOT EXISTS brand_profiles_user_default_idx 
  ON brand_profiles (user_id) 
  WHERE is_default = true;

-- Backfill: for users who have a brand_profile but no slug, set slug + make default
UPDATE brand_profiles
SET 
  slug = lower(regexp_replace(coalesce(brand_name, 'default'), '[^a-z0-9]+', '-', 'g')),
  is_default = true,
  updated_at = NOW()
WHERE slug IS NULL;

-- 2. Brand versions / history (for "version history for every brand profile with memory training")
CREATE TABLE IF NOT EXISTS brand_profile_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_profile_id UUID NOT NULL REFERENCES brand_profiles(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot         JSONB NOT NULL,               -- full copy of the profile at that time
  change_summary   TEXT,
  source           TEXT NOT NULL DEFAULT 'user', -- 'user' | 'auto-refinement' | 'training'
  rating_context   UUID,                         -- optional link to a render that triggered this
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brand_profile_versions_brand_idx ON brand_profile_versions (brand_profile_id, created_at DESC);

ALTER TABLE brand_profile_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "brand_versions_owner" ON brand_profile_versions;
CREATE POLICY "brand_versions_owner" ON brand_profile_versions
  FOR ALL USING (auth.uid() = user_id);

-- 3. Brand assets (for "rich uploads: PDF, logo, past videos/images, voice samples")
CREATE TABLE IF NOT EXISTS brand_assets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_profile_id UUID NOT NULL REFERENCES brand_profiles(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_type       TEXT NOT NULL,                 -- 'guidelines_pdf', 'logo', 'past_video', 'past_image', 'voice_sample', 'reference'
  storage_url      TEXT NOT NULL,
  file_name        TEXT,
  mime_type        TEXT,
  extracted_text   TEXT,                          -- for PDFs/guidelines (populated by processing)
  metadata         JSONB DEFAULT '{}',            -- e.g. {colors: [...], duration: 15}
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brand_assets_brand_idx ON brand_assets (brand_profile_id);
CREATE INDEX IF NOT EXISTS brand_assets_user_idx ON brand_assets (user_id);

ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "brand_assets_owner" ON brand_assets;
CREATE POLICY "brand_assets_owner" ON brand_assets
  FOR ALL USING (auth.uid() = user_id);

-- 4. Link generations/renders to specific brand (critical for multi-brand memory + intelligence per brand)
-- Add to renders if not present (many pipelines already store template etc.)
ALTER TABLE renders 
  ADD COLUMN IF NOT EXISTS brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS renders_brand_profile_idx ON renders (user_id, brand_profile_id);

-- Also help performance_data and generation_memory if useful
ALTER TABLE performance_data 
  ADD COLUMN IF NOT EXISTS brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL;

ALTER TABLE generation_memory
  ADD COLUMN IF NOT EXISTS brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL;

-- Also support per-brand brain snapshots (for refined memory per brand)
ALTER TABLE brand_brain
  ADD COLUMN IF NOT EXISTS brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS brand_brain_profile_idx ON brand_brain (user_id, brand_profile_id);

-- 5. Privacy / consent columns (for Data Privacy & Trust requirement)
ALTER TABLE brand_profiles
  ADD COLUMN IF NOT EXISTS data_usage_consent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_aggregated_insights BOOLEAN DEFAULT true;

-- Simple audit log for brand memory access / training (transparency)
CREATE TABLE IF NOT EXISTS brand_memory_audit (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL,
  action           TEXT NOT NULL,                 -- 'load', 'update', 'train_from_rating', 'asset_upload', 'predict'
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brand_memory_audit_user_idx ON brand_memory_audit (user_id, created_at DESC);

ALTER TABLE brand_memory_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_audit_owner" ON brand_memory_audit FOR ALL USING (auth.uid() = user_id);

-- 6. Update RLS on brand_profiles for multi (the policy was on user_id, still works per row)
-- Existing policy is fine; it already uses auth.uid() = user_id

-- 7. Helper function: get user's default (or first) brand
CREATE OR REPLACE FUNCTION get_default_brand_profile(p_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT id FROM brand_profiles 
  WHERE user_id = p_user_id 
  ORDER BY is_default DESC NULLS LAST, updated_at DESC 
  LIMIT 1;
$$;

COMMENT ON TABLE brand_profiles IS 'Now supports multiple brands per user. Use brand_profile_id when calling generation or intelligence APIs.';
COMMENT ON TABLE brand_profile_versions IS 'Full history + automatic refinements from user ratings / performance.';
COMMENT ON TABLE brand_assets IS 'Rich reference material uploaded per brand (PDF guidelines, logos, past work, voices). Processing (e.g. PDF text extract) happens server-side.';

-- Seed note for existing users: their current brand_profiles row will act as their first/default brand.
-- New code should always resolve a brand_profile_id instead of assuming single brand.
