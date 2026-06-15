-- Add style_preset to brand_profiles
-- user-memory.ts reads brand?.style_preset — column was missing from original schema.
ALTER TABLE brand_profiles
  ADD COLUMN IF NOT EXISTS style_preset text;
