-- Creative Intelligence Schema
-- Adds the core tables for Omnyra's adaptive content strategy layer:
-- profiles, projects, briefs, hooks, creator_memory, performance_data, trend_signals
--
-- Requires: pgvector extension (for creator_memory embeddings)

-- ── Extensions ────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;

-- ── 1. profiles ───────────────────────────────────────────────────────────────
-- Extends auth.users. One row per user. Created via trigger on sign-up.

CREATE TABLE IF NOT EXISTS profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name           TEXT,
  avatar_url          TEXT,
  subscription_tier   TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_owner_select" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_owner_update" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Auto-create a profile row when a new auth user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── 2. projects ───────────────────────────────────────────────────────────────
-- One per content piece. Holds the user's original intent.

CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT,
  goal        TEXT,
  platform    TEXT CHECK (platform IN ('tiktok', 'youtube_shorts', 'instagram_reels')),
  niche       TEXT,
  status      TEXT NOT NULL DEFAULT 'draft',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status  ON projects(user_id, status);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_owner_all" ON projects
  FOR ALL USING (
    auth.uid() = user_id
    OR auth.uid() = (SELECT id FROM profiles WHERE id = user_id LIMIT 1)
  );

-- Simpler rewrite: just match user_id directly
DROP POLICY IF EXISTS "projects_owner_all" ON projects;
CREATE POLICY "projects_owner_all" ON projects
  FOR ALL USING (auth.uid() = user_id);

-- Keep updated_at in sync
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 3. briefs ─────────────────────────────────────────────────────────────────
-- Strategy output generated from the intelligence layer.

CREATE TABLE IF NOT EXISTS briefs (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  objective                       TEXT,
  target_audience_emotional_state TEXT,
  recommended_angle               TEXT,
  situation_analysis              TEXT,
  white_space_rationale           TEXT,
  confidence_score                FLOAT CHECK (confidence_score BETWEEN 0 AND 1),
  trend_signals_used              JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt_used                     TEXT,
  status                          TEXT NOT NULL DEFAULT 'pending_review',
  generated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_briefs_project_id ON briefs(project_id);

ALTER TABLE briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "briefs_owner_all" ON briefs
  FOR ALL USING (
    auth.uid() = (SELECT user_id FROM projects WHERE id = project_id LIMIT 1)
  );

-- ── 4. hooks ──────────────────────────────────────────────────────────────────
-- Generated hook options from a brief.

CREATE TABLE IF NOT EXISTS hooks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id              UUID NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  hook_text             TEXT NOT NULL,
  hook_type             TEXT,
  reasoning             TEXT,
  predicted_retention   FLOAT CHECK (predicted_retention BETWEEN 0 AND 100),
  psychological_trigger TEXT,
  score                 FLOAT,
  score_breakdown       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status                TEXT NOT NULL DEFAULT 'pending_review',
  selected_at           TIMESTAMPTZ,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hooks_brief_id   ON hooks(brief_id);
CREATE INDEX IF NOT EXISTS idx_hooks_project_id ON hooks(project_id);

ALTER TABLE hooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hooks_owner_all" ON hooks
  FOR ALL USING (
    auth.uid() = (SELECT user_id FROM projects WHERE id = project_id LIMIT 1)
  );

-- ── 5. creator_memory ─────────────────────────────────────────────────────────
-- The moat. Stores embedded observations about what works for this creator.

CREATE TABLE IF NOT EXISTS creator_memory (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  memory_type       TEXT NOT NULL,
  content           TEXT NOT NULL,
  embedding         vector(1536),
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_memory_user_id     ON creator_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_creator_memory_type        ON creator_memory(user_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_creator_memory_embedding
  ON creator_memory USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE creator_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creator_memory_owner_all" ON creator_memory
  FOR ALL USING (auth.uid() = user_id);

-- ── 6. performance_data ───────────────────────────────────────────────────────
-- Post-publish feedback loop. Closes the prediction → reality gap.

CREATE TABLE IF NOT EXISTS performance_data (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform            TEXT,
  platform_post_id    TEXT,
  post_url            TEXT,
  views               INT,
  likes               INT,
  comments            INT,
  shares              INT,
  saves               INT,
  retention_percentage FLOAT CHECK (retention_percentage BETWEEN 0 AND 100),
  predicted_score     FLOAT,
  actual_score        FLOAT,
  posted_at           TIMESTAMPTZ,
  data_ingested_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_performance_data_project_id ON performance_data(project_id);

ALTER TABLE performance_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "performance_data_owner_all" ON performance_data
  FOR ALL USING (
    auth.uid() = (SELECT user_id FROM projects WHERE id = project_id LIMIT 1)
  );

-- ── 7. trend_signals ─────────────────────────────────────────────────────────
-- Cached trend data shared across users. Written by service_role crons only.

CREATE TABLE IF NOT EXISTS trend_signals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL,
  niche           TEXT,
  keyword         TEXT,
  signal_strength FLOAT CHECK (signal_strength BETWEEN 0 AND 100),
  velocity        TEXT,
  raw_data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  scraped_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trend_signals_niche    ON trend_signals(niche);
CREATE INDEX IF NOT EXISTS idx_trend_signals_expires  ON trend_signals(expires_at);

ALTER TABLE trend_signals ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read trend signals; only service_role writes
CREATE POLICY "trend_signals_authenticated_read" ON trend_signals
  FOR SELECT USING (auth.role() = 'authenticated');
