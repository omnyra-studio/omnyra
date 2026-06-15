-- Brand Memory table — stores per-user/campaign brand guidelines and reference images.
-- Used by the Emotional Intelligence Engine to inject consistent branding into generations.

CREATE TABLE IF NOT EXISTS brand_memories (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_name         TEXT,
  brand_guidelines      TEXT NOT NULL DEFAULT '',
  reference_images      TEXT[] DEFAULT '{}',
  character_descriptions JSONB DEFAULT '{}',
  tone_and_style        TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Video projects table — tracks generation history per campaign.
CREATE TABLE IF NOT EXISTS video_projects (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_name    TEXT,
  brand_memory_id  UUID REFERENCES brand_memories(id) ON DELETE SET NULL,
  prompt           TEXT,
  final_video_url  TEXT,
  thumbnail_url    TEXT,
  duration_seconds INTEGER,
  emotional_arc    TEXT,
  model_used       TEXT,
  status           TEXT NOT NULL DEFAULT 'processing',
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS brand_memories_user_id_idx ON brand_memories(user_id);
CREATE INDEX IF NOT EXISTS video_projects_user_id_idx ON video_projects(user_id);
CREATE INDEX IF NOT EXISTS video_projects_campaign_idx ON video_projects(user_id, campaign_name);

-- RLS
ALTER TABLE brand_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_projects  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own brand memories"
  ON brand_memories FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own video projects"
  ON video_projects FOR ALL USING (auth.uid() = user_id);

-- updated_at trigger for brand_memories
CREATE OR REPLACE FUNCTION update_brand_memories_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS brand_memories_updated_at ON brand_memories;
CREATE TRIGGER brand_memories_updated_at
  BEFORE UPDATE ON brand_memories
  FOR EACH ROW EXECUTE FUNCTION update_brand_memories_updated_at();
