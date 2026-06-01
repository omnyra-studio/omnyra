-- Character registry: reusable character definitions with visual identity locking.
--
-- core_prompt:      base description injected into every scene prompt
-- visual_signature: secondary identifiers (hair, eyes, clothing details)
-- neg_prompt:       negative prompt additions to suppress visual drift
-- ref_frame_url:    URL to the first keyframe from the most recent successful
--                   Kling generation for this character; used as a consistency
--                   reference and displayed as a preview thumbnail in the UI.

CREATE TABLE IF NOT EXISTS character_registry (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  core_prompt      TEXT        NOT NULL,
  visual_signature TEXT        NOT NULL DEFAULT '',
  neg_prompt       TEXT        NOT NULL DEFAULT '',
  ref_frame_url    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS character_registry_user_idx
  ON character_registry (user_id, created_at DESC);

ALTER TABLE character_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "character_registry_owner"
  ON character_registry FOR ALL
  USING (auth.uid() = user_id);
