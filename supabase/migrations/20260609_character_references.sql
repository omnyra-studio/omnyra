-- Extends character_registry with stylized flag.
-- Adds is_stylized to gate Flux pose count and Kling motion tuning.
ALTER TABLE character_registry
  ADD COLUMN IF NOT EXISTS is_stylized BOOLEAN NOT NULL DEFAULT false;

-- Character reference images table.
-- Stores multiple reference images per character (flux sheets, saved kling frames,
-- user uploads). The parallel engine and cinematic pipeline use findBestReference()
-- to pick the highest-quality reference for each generation.

CREATE TABLE IF NOT EXISTS character_references (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id  UUID        NOT NULL REFERENCES character_registry(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  image_url     TEXT        NOT NULL,
  source        TEXT        NOT NULL CHECK (source IN ('flux_sheet', 'kling_frame', 'user_upload')),
  pose_label    TEXT,        -- 'front' | 'profile' | 'emotional' | 'tender' | 'sad' | null
  is_primary    BOOLEAN     NOT NULL DEFAULT false,
  quality_score FLOAT       NOT NULL DEFAULT 0.8 CHECK (quality_score BETWEEN 0 AND 1),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup: best reference for a character (primary first, then newest)
CREATE INDEX IF NOT EXISTS char_refs_character_best_idx
  ON character_references (character_id, is_primary DESC, quality_score DESC, created_at DESC);

-- Per-user listing
CREATE INDEX IF NOT EXISTS char_refs_user_idx
  ON character_references (user_id, created_at DESC);

ALTER TABLE character_references ENABLE ROW LEVEL SECURITY;

-- Owner-only access — character creator manages their references
CREATE POLICY "char_refs_owner"
  ON character_references FOR ALL
  USING (auth.uid() = user_id);
