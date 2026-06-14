-- ═══════════════════════════════════════════════════════════════
-- Omnyra.studio — Definitive Learning Schema Migration
-- 20260614_definitive_learning_schema.sql
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS everywhere.
-- Handles conflict if creative_intelligence_schema.sql already ran
-- (that version referenced projects, this one references renders).
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Renders: outcome columns ───────────────────────────────

ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS was_published BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS was_edited    BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_rating   SMALLINT CHECK (user_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS template      TEXT,
  ADD COLUMN IF NOT EXISTS completed_at  TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_renders_published
  ON renders(user_id, was_published, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_renders_user_completed
  ON renders(user_id, completed_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_renders_user_template
  ON renders(user_id, template);

-- ── 2. Fix performance_data if it points to wrong table ───────
--
-- creative_intelligence_schema.sql (if previously applied) created
-- performance_data with project_id → projects(id). We need
-- render_id → renders(id). Drop the old table if it exists with
-- the wrong FK — it's pre-beta so there's no real data to lose.

DO $$
DECLARE
  fk_target TEXT;
BEGIN
  SELECT ccu.table_name
    INTO fk_target
    FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = rc.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = rc.unique_constraint_name
   WHERE kcu.table_name = 'performance_data'
   LIMIT 1;

  IF fk_target = 'projects' THEN
    DROP TABLE IF EXISTS performance_data CASCADE;
    RAISE NOTICE 'performance_data (old FK → projects) dropped — recreating with FK → renders';
  ELSIF fk_target IS NULL THEN
    RAISE NOTICE 'performance_data does not exist — creating fresh';
  ELSE
    RAISE NOTICE 'performance_data already has FK → %. Dropping and recreating to ensure correct schema.', fk_target;
    DROP TABLE IF EXISTS performance_data CASCADE;
  END IF;
END;
$$;

-- ── 3. performance_data (authoritative schema) ────────────────
-- render_id + platform = composite unique key for upsert support
-- user_id enables direct RLS without joining renders

CREATE TABLE IF NOT EXISTS performance_data (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  render_id          UUID         NOT NULL REFERENCES renders(id) ON DELETE CASCADE,
  user_id            UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform           TEXT         NOT NULL,
  post_url           TEXT,
  views              INTEGER      NOT NULL DEFAULT 0,
  retention_pct      NUMERIC(5,2)          CHECK (retention_pct BETWEEN 0 AND 100),
  watch_time_seconds INTEGER,
  likes              INTEGER      NOT NULL DEFAULT 0,
  comments           INTEGER      NOT NULL DEFAULT 0,
  shares             INTEGER      NOT NULL DEFAULT 0,
  saves              INTEGER      NOT NULL DEFAULT 0,
  data_ingested_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- UNIQUE required for upsert onConflict("render_id,platform")
CREATE UNIQUE INDEX IF NOT EXISTS idx_perf_data_render_platform
  ON performance_data(render_id, platform);

CREATE INDEX IF NOT EXISTS idx_perf_data_user
  ON performance_data(user_id, data_ingested_at DESC);

-- ── 4. RLS ────────────────────────────────────────────────────

ALTER TABLE performance_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perf_data_owner_all"             ON performance_data;
DROP POLICY IF EXISTS "perf_data_select_own"            ON performance_data;
DROP POLICY IF EXISTS "perf_data_insert_own"            ON performance_data;
DROP POLICY IF EXISTS "Users can view own performance data" ON performance_data;
DROP POLICY IF EXISTS "System can insert performance data"  ON performance_data;

-- Owners can read their own data
CREATE POLICY "perf_data_select_own" ON performance_data
  FOR SELECT USING (auth.uid() = user_id);

-- Service role inserts (no user_id check needed — service role bypasses RLS)
-- Authenticated users can insert their own rows
CREATE POLICY "perf_data_insert_own" ON performance_data
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── 5. Helper function ────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_renders_columns()
RETURNS TABLE(col TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT c.column_name::TEXT
    FROM information_schema.columns c
   WHERE c.table_name  = 'renders'
     AND c.column_name IN ('was_published','was_edited','user_rating','template','completed_at');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. Verification ───────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '✅ Migration applied. Run these to verify:';
  RAISE NOTICE '  SELECT * FROM check_renders_columns();  -- should return 5 rows';
  RAISE NOTICE '  SELECT COUNT(*) FROM performance_data;  -- should return 0';
END;
$$;
