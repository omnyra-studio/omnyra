-- Continue This Story — series tracking columns on renders table

ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS series_id         UUID         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS episode_number    INT          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS parent_render_id  UUID         REFERENCES renders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS continuation_prompt TEXT        DEFAULT NULL;

-- Fast lookup: all episodes in a series ordered by episode number
CREATE INDEX IF NOT EXISTS idx_renders_series_id
  ON renders (series_id, episode_number)
  WHERE series_id IS NOT NULL;

-- Fast lookup: child renders from a parent
CREATE INDEX IF NOT EXISTS idx_renders_parent_render_id
  ON renders (parent_render_id)
  WHERE parent_render_id IS NOT NULL;
