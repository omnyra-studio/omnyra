-- Agent Swarm Production Schema
-- Tables: brand_memory, story_state, scenes, renders (cost extension)
-- All tables scoped to auth.uid() via RLS

-- ── brand_memory ───────────────────────────────────────────────────────────────
-- Stores per-brand character bank + global visual rules
CREATE TABLE IF NOT EXISTS brand_memory (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id        text NOT NULL,
  characters      jsonb NOT NULL DEFAULT '[]',      -- BrandCharacter[]
  global_visual   jsonb NOT NULL DEFAULT '{}',      -- GlobalVisualRules
  forbidden       text[] NOT NULL DEFAULT '{}',     -- forbiddenChanges[]
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, brand_id)
);

ALTER TABLE brand_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_memory_owner" ON brand_memory
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_brand_memory_user_brand ON brand_memory(user_id, brand_id);

-- ── story_state ────────────────────────────────────────────────────────────────
-- Tracks narrative state per project (StoryMemory)
CREATE TABLE IF NOT EXISTS story_state (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          text NOT NULL,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  story_arc           text,
  current_emotion     text,
  tension_level       numeric(3,2),
  location_state      text,
  continuity_objects  text[] DEFAULT '{}',
  lighting_vector     text,
  camera_vector       text,
  scenes_so_far       int NOT NULL DEFAULT 0,
  scene_progression   jsonb NOT NULL DEFAULT '[]',   -- SceneProgressionEntry[]
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

ALTER TABLE story_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "story_state_owner" ON story_state
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_story_state_project ON story_state(project_id);
CREATE INDEX IF NOT EXISTS idx_story_state_user ON story_state(user_id);

-- ── scenes ─────────────────────────────────────────────────────────────────────
-- Stores compiled scene graph nodes
CREATE TABLE IF NOT EXISTS scenes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       text NOT NULL,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scene_id         text NOT NULL,                 -- "scene_01" etc.
  narrative_role   text NOT NULL,                 -- hook/development/climax/resolution
  duration_secs    int NOT NULL DEFAULT 10,
  image_prompt     text,
  video_prompt     text,
  negative_prompt  text,
  image_url        text,                          -- Flux Dev output
  video_url        text,                          -- Kling/Runway output
  last_frame_url   text,                          -- extracted for next scene
  model_used       text,                          -- kling/runway/luma
  render_status    text NOT NULL DEFAULT 'pending', -- pending/queued/rendering/complete/failed
  motion_complexity text,
  priority         int NOT NULL DEFAULT 2,
  queue_job_id     text,                          -- BullMQ job ID
  render_ms        int,
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, scene_id)
);

ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scenes_owner" ON scenes
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_scenes_project ON scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_scenes_user ON scenes(user_id);
CREATE INDEX IF NOT EXISTS idx_scenes_status ON scenes(render_status);

-- ── renders cost extension ─────────────────────────────────────────────────────
-- Add cost tracking columns to existing renders table if not present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='renders' AND column_name='cost_usd') THEN
    ALTER TABLE renders ADD COLUMN cost_usd numeric(8,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='renders' AND column_name='model') THEN
    ALTER TABLE renders ADD COLUMN model text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='renders' AND column_name='render_ms') THEN
    ALTER TABLE renders ADD COLUMN render_ms int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='renders' AND column_name='agent_swarm_version') THEN
    ALTER TABLE renders ADD COLUMN agent_swarm_version text;
  END IF;
END $$;

-- ── updated_at triggers ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_brand_memory_updated ON brand_memory;
CREATE TRIGGER trg_brand_memory_updated
  BEFORE UPDATE ON brand_memory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_story_state_updated ON story_state;
CREATE TRIGGER trg_story_state_updated
  BEFORE UPDATE ON story_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_scenes_updated ON scenes;
CREATE TRIGGER trg_scenes_updated
  BEFORE UPDATE ON scenes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
