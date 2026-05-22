-- AGS §7 + §8 — additional safe intervention surfaces.
--
--   onboarding_minimal     : true when AGS wants the client to skip
--                            optional onboarding screens. Set by the
--                            churn applier for high-risk users; cleared
--                            automatically when risk drops below the
--                            threshold. Fully reversible.
--
--   premium_unlocked_until : UTC timestamp through which the user has
--                            temporary access to premium templates as a
--                            share-reward perk. NULL means no unlock.
--                            Bounded: each share extends by up to N
--                            days, capped at MAX_UNLOCK_DAYS days into
--                            the future (enforced application-side).
ALTER TABLE user_profiles_extended
  ADD COLUMN IF NOT EXISTS onboarding_minimal     BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS premium_unlocked_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_profiles_extended_premium
  ON user_profiles_extended(premium_unlocked_until)
  WHERE premium_unlocked_until IS NOT NULL;
