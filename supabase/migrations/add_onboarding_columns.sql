-- Adds onboarding profile fields and the columns the promo system relies on.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS use_case TEXT,
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

-- Single-use promo schema expected by /api/promo/redeem.
-- Keeps the existing promo_codes table; adds the columns the new flow needs.
ALTER TABLE promo_codes
  ADD COLUMN IF NOT EXISTS used_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
