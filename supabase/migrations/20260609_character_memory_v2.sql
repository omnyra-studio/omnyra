-- Character Memory V2: approval workflow, video reference support, enhanced source types.
-- Run after 20260609_character_references.sql.

-- Extend source CHECK to include 'video_ref'
ALTER TABLE character_references
  DROP CONSTRAINT IF EXISTS character_references_source_check;

ALTER TABLE character_references
  ADD CONSTRAINT character_references_source_check
    CHECK (source IN ('flux_sheet', 'kling_frame', 'user_upload', 'video_ref'));

-- Approval workflow — existing rows are pre-approved
ALTER TABLE character_references
  ADD COLUMN IF NOT EXISTS is_video_reference BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_video_url   TEXT,
  ADD COLUMN IF NOT EXISTS frame_count        INTEGER,
  ADD COLUMN IF NOT EXISTS is_approved        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS approved_at        TIMESTAMPTZ;

-- Backfill: mark existing rows as approved at creation time
UPDATE character_references
   SET approved_at = created_at
 WHERE is_approved = true AND approved_at IS NULL;

-- Index: list approved references newest-first per character (used by UI gallery)
CREATE INDEX IF NOT EXISTS char_refs_approved_idx
  ON character_references (character_id, is_approved, created_at DESC);
