-- Brand Brain — generation memory + preference weight tables.
--
-- generation_memory: One row per AI generation. Stores the settings used
--   (hook_type, energy_level, pacing, template, niche) and the outcome
--   (was_published, was_edited, user_rating) for the learning loop.
--
-- preference_weights: One row per user. JSONB weight maps updated via EMA
--   after each confirmed outcome. Read by Director Core at generation time.
--
-- Safe to run multiple times (all statements are idempotent).

-- ── generation_memory ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS generation_memory (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Generation settings snapshot
  hook_type         TEXT,
  energy_level      SMALLINT CHECK (energy_level BETWEEN 1 AND 5),
  pacing            TEXT CHECK (pacing IN ('slow', 'measured', 'fast')),
  delivery_style    TEXT,
  template          TEXT,
  niche             TEXT,
  platform          TEXT,
  script_snippet    TEXT,          -- first 300 chars of generated script
  video_url         TEXT,

  -- Outcome (written by record-outcome API call)
  was_published     BOOLEAN NOT NULL DEFAULT false,
  was_edited        BOOLEAN NOT NULL DEFAULT false,
  user_rating       SMALLINT CHECK (user_rating BETWEEN 1 AND 5),
  outcome_recorded  BOOLEAN NOT NULL DEFAULT false,
  outcome_at        TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_memory_user_id
  ON generation_memory(user_id);

CREATE INDEX IF NOT EXISTS idx_generation_memory_user_created
  ON generation_memory(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_memory_outcome
  ON generation_memory(user_id, outcome_recorded, was_published);

ALTER TABLE generation_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "generation_memory_owner_all" ON generation_memory;
CREATE POLICY "generation_memory_owner_all"
  ON generation_memory
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── preference_weights ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS preference_weights (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- EMA weight maps (key → 0.0–1.0 weight)
  hook_weights     JSONB NOT NULL DEFAULT '{}',   -- hook_type → weight
  energy_weights   JSONB NOT NULL DEFAULT '{}',   -- "1"–"5" → weight
  pacing_weights   JSONB NOT NULL DEFAULT '{}',   -- slow/measured/fast → weight
  template_weights JSONB NOT NULL DEFAULT '{}',   -- template slug → weight

  -- Derived from generation history
  top_niches       TEXT[] NOT NULL DEFAULT '{}',

  -- Learning configuration
  learning_rate    NUMERIC(4, 3) NOT NULL DEFAULT 0.2,

  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preference_weights_user_id
  ON preference_weights(user_id);

ALTER TABLE preference_weights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "preference_weights_owner_all" ON preference_weights;
CREATE POLICY "preference_weights_owner_all"
  ON preference_weights
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
