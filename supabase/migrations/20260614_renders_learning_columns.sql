-- ══════════════════════════════════════════════════════════════════════════════
-- Omnyra.studio — Renders learning columns + performance_data table
-- 20260614_renders_learning_columns.sql
--
-- Adds outcome-tracking columns to renders (was_published, was_edited,
-- user_rating, template, completed_at) and creates performance_data for
-- post-publish platform metrics.
--
-- Safe to re-run: all ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Renders: add outcome columns ──────────────────────────────────────────────

ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS was_published boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS was_edited    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_rating   smallint             CHECK (user_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS template      text,
  ADD COLUMN IF NOT EXISTS completed_at  timestamptz;

-- Index for analyzeCreatorHistory ordering
CREATE INDEX IF NOT EXISTS idx_renders_user_completed
  ON renders(user_id, completed_at DESC NULLS LAST);

-- Index for template-level aggregation
CREATE INDEX IF NOT EXISTS idx_renders_user_template
  ON renders(user_id, template);

-- ── performance_data table ────────────────────────────────────────────────────
-- One row per (render × platform). Ingested via learning.ingestPerformanceData.
-- Ghost Test: stores behavioral signals (retention %, timing, share rate) only.

CREATE TABLE IF NOT EXISTS performance_data (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           uuid        NOT NULL REFERENCES renders(id) ON DELETE CASCADE,
  platform             text        NOT NULL,  -- "tiktok" | "instagram" | "youtube_shorts" etc.
  post_url             text,
  views                integer     NOT NULL DEFAULT 0,
  likes                integer     NOT NULL DEFAULT 0,
  comments             integer     NOT NULL DEFAULT 0,
  shares               integer     NOT NULL DEFAULT 0,
  saves                integer     NOT NULL DEFAULT 0,
  retention_percentage numeric(5,2)         CHECK (retention_percentage BETWEEN 0 AND 100),
  watch_time_seconds   numeric(8,2),
  data_ingested_at     timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Composite unique: one row per render per platform
CREATE UNIQUE INDEX IF NOT EXISTS idx_perf_data_project_platform
  ON performance_data(project_id, platform);

-- Index for analyzeCreatorHistory join
CREATE INDEX IF NOT EXISTS idx_perf_data_ingested
  ON performance_data(data_ingested_at DESC);

ALTER TABLE performance_data ENABLE ROW LEVEL SECURITY;

-- Users can read their own performance data (via render ownership)
DROP POLICY IF EXISTS "perf_data_select_own" ON performance_data;
CREATE POLICY "perf_data_select_own" ON performance_data
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM renders r
      WHERE r.id = performance_data.project_id
        AND r.user_id = auth.uid()
    )
  );
