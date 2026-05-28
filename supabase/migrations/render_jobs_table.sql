-- render_jobs: tracks the state of a full video render pipeline run
-- Run AFTER: creative_intelligence_schema.sql + scripts_and_shots_tables.sql

CREATE TABLE IF NOT EXISTS render_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id          UUID NOT NULL,
  status           TEXT NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued', 'rendering', 'composing', 'completed', 'failed')),
  total_shots      INT  NOT NULL DEFAULT 0,
  completed_shots  INT  NOT NULL DEFAULT 0,
  failed_shots     INT  NOT NULL DEFAULT 0,
  voiceover_url    TEXT,
  video_url        TEXT,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ
);

ALTER TABLE render_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "render_jobs_owner"
  ON render_jobs FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS render_jobs_user_status_idx ON render_jobs (user_id, status);

-- ── Extend shots table ────────────────────────────────────────────────────────
-- scripts_and_shots_tables.sql already created render_status as TEXT DEFAULT 'pending'
-- (no CHECK constraint). Add the missing columns; skip render_status if it exists.

ALTER TABLE shots
  ADD COLUMN IF NOT EXISTS clip_url        TEXT,
  ADD COLUMN IF NOT EXISTS render_error    TEXT,
  ADD COLUMN IF NOT EXISTS avatar_motion   JSONB,
  ADD COLUMN IF NOT EXISTS fal_render_params JSONB;

-- Upgrade render_status to include 'rendering' and 'completed' values
-- (original column was TEXT with no constraint, so this is safe to add)
ALTER TABLE shots
  DROP CONSTRAINT IF EXISTS shots_render_status_check;

ALTER TABLE shots
  ADD CONSTRAINT shots_render_status_check
    CHECK (render_status IN ('pending', 'rendering', 'completed', 'failed'));

-- trend_insights table (used by seed-trends.ts + generate-brief route)
CREATE TABLE IF NOT EXISTS trend_insights (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  niche        TEXT NOT NULL,
  insight_type TEXT NOT NULL
                 CHECK (insight_type IN ('hook_pattern','format_shift','audience_sentiment','white_space')),
  title        TEXT NOT NULL,
  description  TEXT NOT NULL,
  evidence     TEXT,
  confidence   FLOAT CHECK (confidence BETWEEN 0 AND 1),
  valid_until  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE trend_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trend_insights_read" ON trend_insights
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_trend_insights_niche ON trend_insights (niche);

-- ── RPC: atomic progress counter ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_render_job_progress(
  p_job_id    UUID,
  p_completed INT DEFAULT 0,
  p_failed    INT DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE render_jobs
  SET
    completed_shots = completed_shots + p_completed,
    failed_shots    = failed_shots    + p_failed
  WHERE id = p_job_id;
END;
$$;
