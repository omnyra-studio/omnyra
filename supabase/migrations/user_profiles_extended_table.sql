-- Per-user personalisation signals.
--
-- Computed by the AGS cron from the user's render + event history.
-- Read by /api/create defaults endpoints to pre-fill the "best for you"
-- template + director settings on the brief composer.
--
-- This is a DERIVED table — never edited by hand. Wipe + recompute is
-- always safe. The cron upserts one row per user with current signals.

CREATE TABLE IF NOT EXISTS user_profiles_extended (
  user_id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Most-used / best-performing template for this user.
  dominant_template_type  TEXT,
  -- E.g. "question_hook", "shock_hook", "story_hook". Derived from
  -- the prompt-engine pattern on best renders.
  avg_hook_style          TEXT,
  -- Most common brief.audience field.
  audience_type           TEXT,
  -- Free-form jsonb: { best_template, best_viral_score, sample_size, ... }
  success_pattern         JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Most common director_settings.energy value.
  preferred_energy_level  TEXT,
  -- Aggregate engagement: { videos_completed, videos_shared, videos_downloaded, regenerate_rate }
  conversion_behavior     JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Computed risk in 0..100. >= 70 means active churn intervention candidate.
  churn_risk_score        INTEGER NOT NULL DEFAULT 0,
  -- Source-of-truth window for the last computation.
  recomputed_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_extended_churn
  ON user_profiles_extended(churn_risk_score DESC)
  WHERE churn_risk_score >= 70;

ALTER TABLE user_profiles_extended ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_profiles_extended_owner_read" ON user_profiles_extended;
CREATE POLICY "user_profiles_extended_owner_read"
  ON user_profiles_extended FOR SELECT
  USING (auth.uid() = user_id);
-- No client write policy. Writes go via service_role only.
