-- ============================================================
-- Omnyra Memory + Intelligence Schema
-- Run AFTER all existing migrations.
-- Safe to apply multiple times (IF NOT EXISTS guards everywhere).
-- ============================================================

-- ── Hedra image_asset_id cache ────────────────────────────────────────────────
-- Eliminates the 2-call Hedra upload round trip on repeat character generations.

CREATE TABLE IF NOT EXISTS character_hedra_assets (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id    uuid        NOT NULL REFERENCES character_registry(id) ON DELETE CASCADE,
  image_hash      text        NOT NULL,      -- SHA256(image_url) slice 0..31
  image_asset_id  text        NOT NULL,      -- Hedra /assets response id
  expires_at      timestamptz NOT NULL,      -- 7 days from creation
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(character_id, image_hash)
);

CREATE INDEX IF NOT EXISTS idx_char_hedra_assets_lookup
  ON character_hedra_assets(character_id, image_hash)
  WHERE expires_at > now();

ALTER TABLE character_hedra_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hedra_assets_owner" ON character_hedra_assets
  FOR ALL USING (
    auth.uid() = (SELECT user_id FROM character_registry WHERE id = character_id LIMIT 1)
  );

-- ── Generation history ────────────────────────────────────────────────────────
-- Every clip ever generated across all providers. Source of truth for intelligence.

CREATE TABLE IF NOT EXISTS generation_history (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id       uuid        REFERENCES projects(id) ON DELETE SET NULL,
  shot_id          uuid        REFERENCES shots(id) ON DELETE SET NULL,
  plan_id          uuid        REFERENCES shot_plans(id) ON DELETE SET NULL,

  -- What was requested
  provider         text        NOT NULL CHECK (provider IN ('hedra','kling','elevenlabs')),
  model_id         text        NOT NULL,
  scene_type       text,
  prompt_text      text,
  character_id     uuid        REFERENCES character_registry(id) ON DELETE SET NULL,

  -- What was produced
  output_url       text,
  duration_seconds float,

  -- Timing + cost
  generation_ms    int,
  credits_spent    int,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','completed','failed','cached')),

  -- Quality signals (set async by user action)
  was_regenerated  boolean     NOT NULL DEFAULT false,
  was_selected     boolean     NOT NULL DEFAULT false,
  user_rating      smallint    CHECK (user_rating BETWEEN 1 AND 5),
  consistency_score float,

  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gen_history_user_date
  ON generation_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gen_history_provider
  ON generation_history(user_id, provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gen_history_character
  ON generation_history(character_id, provider)
  WHERE character_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gen_history_project
  ON generation_history(project_id)
  WHERE project_id IS NOT NULL;

ALTER TABLE generation_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gen_history_owner" ON generation_history
  FOR ALL USING (auth.uid() = user_id);

-- ── Performance memory ────────────────────────────────────────────────────────
-- Aggregated per-tool stats, auto-maintained by trigger.

CREATE TABLE IF NOT EXISTS performance_memory (
  id                     uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dimension              text  NOT NULL,  -- 'provider' | 'character' | 'scene_type'
  dimension_value        text  NOT NULL,  -- 'hedra' | char_uuid | 'cinematic'
  total_generations      int   NOT NULL DEFAULT 0,
  successful_generations int   NOT NULL DEFAULT 0,
  regeneration_rate      float NOT NULL DEFAULT 0,
  selection_rate         float NOT NULL DEFAULT 0,
  avg_generation_ms      float,
  avg_user_rating        float,
  avg_consistency_score  float,
  last_updated           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, dimension, dimension_value)
);

CREATE INDEX IF NOT EXISTS idx_perf_memory_user_dim
  ON performance_memory(user_id, dimension);

ALTER TABLE performance_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perf_memory_owner" ON performance_memory
  FOR ALL USING (auth.uid() = user_id);

-- ── Performance memory auto-update trigger ────────────────────────────────────

CREATE OR REPLACE FUNCTION update_performance_memory_fn()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO performance_memory(
    user_id, dimension, dimension_value,
    total_generations, successful_generations
  )
  VALUES (
    NEW.user_id, 'provider', NEW.provider,
    1, CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, dimension, dimension_value) DO UPDATE SET
    total_generations      = performance_memory.total_generations + 1,
    successful_generations = performance_memory.successful_generations
                             + CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
    last_updated           = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_perf_memory ON generation_history;
CREATE TRIGGER trg_update_perf_memory
  AFTER INSERT ON generation_history
  FOR EACH ROW EXECUTE FUNCTION update_performance_memory_fn();

-- ── Generation signals ────────────────────────────────────────────────────────
-- Granular per-generation quality metadata (set async, user or auto).

CREATE TABLE IF NOT EXISTS generation_signals (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id  uuid        NOT NULL REFERENCES generation_history(id) ON DELETE CASCADE,
  -- Signal types by provider:
  --   hedra:       lipsync_quality (0-1), face_stability (0-1)
  --   kling:       motion_adherence (0-1), visual_consistency (0-1)
  --   elevenlabs:  voice_match (0-1), emotion_clarity (0-1)
  signal_type    text        NOT NULL,
  signal_value   float,
  source         text        NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','user','vce')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gen_signals_gen_id
  ON generation_signals(generation_id, signal_type);

ALTER TABLE generation_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gen_signals_owner" ON generation_signals
  FOR ALL USING (
    auth.uid() = (SELECT user_id FROM generation_history WHERE id = generation_id LIMIT 1)
  );

-- ── Consistency scores ────────────────────────────────────────────────────────
-- Latest computed consistency score per character.

CREATE TABLE IF NOT EXISTS consistency_scores (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type  text        NOT NULL CHECK (entity_type IN ('character','brand')),
  entity_id    uuid        NOT NULL,
  score        float       NOT NULL CHECK (score BETWEEN 0 AND 1),
  sample_size  int         NOT NULL DEFAULT 0,
  computed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consistency_entity
  ON consistency_scores(entity_type, entity_id, computed_at DESC);

ALTER TABLE consistency_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consistency_scores_owner" ON consistency_scores
  FOR ALL USING (auth.uid() = user_id);

-- ── Intelligence recommendations ──────────────────────────────────────────────
-- Persisted recommendations shown on the dashboard.

CREATE TABLE IF NOT EXISTS intelligence_recommendations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rec_type      text        NOT NULL,  -- 'tool_combo' | 'duration' | 'character_setting'
  headline      text        NOT NULL,
  detail        text,
  confidence    float       NOT NULL DEFAULT 0,
  was_acted_on  boolean     NOT NULL DEFAULT false,
  was_dismissed boolean     NOT NULL DEFAULT false,
  shown_at      timestamptz NOT NULL DEFAULT now(),
  acted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_intel_recs_user
  ON intelligence_recommendations(user_id, shown_at DESC)
  WHERE was_dismissed = false;

ALTER TABLE intelligence_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intel_recs_owner" ON intelligence_recommendations
  FOR ALL USING (auth.uid() = user_id);

-- ── Voiceover columns on shot_plans (safe ALTER if missing) ──────────────────
-- Some deployments may already have these; IGNORE if they exist.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shot_plans' AND column_name = 'voiceover_url'
  ) THEN
    ALTER TABLE shot_plans ADD COLUMN voiceover_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shot_plans' AND column_name = 'voiceover_duration'
  ) THEN
    ALTER TABLE shot_plans ADD COLUMN voiceover_duration float;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shot_plans' AND column_name = 'voiceover_status'
  ) THEN
    ALTER TABLE shot_plans ADD COLUMN voiceover_status text DEFAULT 'pending';
  END IF;
END $$;

-- ── narration_text on shots (safe ALTER if missing) ───────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shots' AND column_name = 'narration_text'
  ) THEN
    ALTER TABLE shots ADD COLUMN narration_text text;
  END IF;
END $$;
