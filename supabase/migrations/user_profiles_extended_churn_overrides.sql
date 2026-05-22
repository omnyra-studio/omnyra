-- AGS §7 churn intervention: surface a system-suggested template per
-- high-risk user. Set automatically by the churn applier; consumed by
-- /api/create/defaults so the create page pre-selects it.
--
-- This column is a SAFE intervention surface — it does not affect
-- billing, does not delete user data, and is fully reversible (set to
-- NULL to clear).
ALTER TABLE user_profiles_extended
  ADD COLUMN IF NOT EXISTS suggested_template TEXT;
