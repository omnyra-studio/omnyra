-- ══════════════════════════════════════════════════════════════════════════════
-- 20260614_definitive_learning_schema.sql
--
-- SAFE TO RUN on a fresh DB or one that already has creative_intelligence_schema.
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS everywhere.
--
-- What this does:
--   1. Adds outcome columns to renders (was_published, was_edited, user_rating,
--      template, completed_at) — needed by learning.ts
--   2. Fixes performance_data so it references renders(id) not projects(id).
--      The old creative_intelligence_schema.sql pointed to projects — wrong.
--      We DROP and recreate only when project_id currently points to projects.
--   3. Creates supporting indexes.
--   4. Applies RLS on performance_data.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Renders: outcome columns ───────────────────────────────────────────────

ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS was_published boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS was_edited    boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_rating   smallint              CHECK (user_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS template      text,
  ADD COLUMN IF NOT EXISTS completed_at  timestamptz;

CREATE INDEX IF NOT EXISTS idx_renders_user_completed
  ON renders(user_id, completed_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_renders_user_template
  ON renders(user_id, template);

CREATE INDEX IF NOT EXISTS idx_renders_published
  ON renders(user_id, was_published, completed_at DESC);

-- ── 2. Fix performance_data ───────────────────────────────────────────────────
--
-- creative_intelligence_schema.sql (if already applied) created:
--   performance_data.project_id → projects(id)
--
-- Our learning loop needs:
--   performance_data.project_id → renders(id)
--
-- Strategy: if the table FK points to projects, drop and recreate.
-- If it already points to renders, do nothing.

DO $$
DECLARE
  fk_target text;
BEGIN
  -- Find what table performance_data.project_id currently references
  SELECT ccu.table_name
    INTO fk_target
    FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = rc.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = rc.unique_constraint_name
   WHERE kcu.table_name  = 'performance_data'
     AND kcu.column_name = 'project_id'
   LIMIT 1;

  IF fk_target = 'projects' THEN
    -- Old schema: safe to drop (pre-beta, no real data)
    DROP TABLE IF EXISTS performance_data CASCADE;
    RAISE NOTICE 'performance_data (old FK → projects) dropped — will recreate with FK → renders';
  ELSIF fk_target = 'renders' THEN
    RAISE NOTICE 'performance_data already has correct FK → renders, skipping recreate';
  ELSE
    RAISE NOTICE 'performance_data does not exist or has no FK — will create fresh';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS performance_data (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           uuid          NOT NULL REFERENCES renders(id) ON DELETE CASCADE,
  platform             text          NOT NULL,
  post_url             text,
  views                integer       NOT NULL DEFAULT 0,
  likes                integer       NOT NULL DEFAULT 0,
  comments             integer       NOT NULL DEFAULT 0,
  shares               integer       NOT NULL DEFAULT 0,
  saves                integer       NOT NULL DEFAULT 0,
  retention_percentage numeric(5,2)           CHECK (retention_percentage BETWEEN 0 AND 100),
  watch_time_seconds   numeric(8,2),
  data_ingested_at     timestamptz   NOT NULL DEFAULT now(),
  created_at           timestamptz   NOT NULL DEFAULT now()
);

-- One row per render × platform
CREATE UNIQUE INDEX IF NOT EXISTS idx_perf_data_project_platform
  ON performance_data(project_id, platform);

CREATE INDEX IF NOT EXISTS idx_perf_data_ingested
  ON performance_data(data_ingested_at DESC);

-- ── 3. RLS on performance_data ────────────────────────────────────────────────

ALTER TABLE performance_data ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own performance data (via render ownership)
DROP POLICY IF EXISTS "perf_data_select_own"  ON performance_data;
DROP POLICY IF EXISTS "perf_data_insert_own"  ON performance_data;
DROP POLICY IF EXISTS "perf_data_owner_all"   ON performance_data;

CREATE POLICY "perf_data_owner_all" ON performance_data
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM renders r
       WHERE r.id      = performance_data.project_id
         AND r.user_id = auth.uid()
    )
  );

-- ── 4. Verification query (shows what was applied) ────────────────────────────
-- Run after to confirm:
--
--   SELECT column_name, data_type
--     FROM information_schema.columns
--    WHERE table_name = 'renders'
--      AND column_name IN ('was_published','was_edited','user_rating','template','completed_at')
--    ORDER BY column_name;
--
--   SELECT COUNT(*) FROM performance_data;  -- should return 0 (clean slate)
