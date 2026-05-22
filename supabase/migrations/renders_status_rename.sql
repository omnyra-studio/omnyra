-- Migrate render status enum to the canonical 4-stage spec:
--   queued → drafting → rendering → complete   (failed = terminal)
--
-- Stage semantics:
--   queued     row exists, no script yet (pre-AI)
--   drafting   script + scenes generated, awaiting user approval
--   rendering  user approved, heavy pipeline running (voice/motion/lipsync)
--   complete   final video_url is populated
--   failed     terminal failure; can be regenerated back to drafting
--
-- Mapping from the old granular statuses:
--   pending                               → queued
--   draft (no script)                     → queued
--   draft (has script)                    → drafting
--   processing / voice_done / motion_done
--     / lipsync_done                      → rendering
--   complete                              → complete
--   failed                                → failed

-- ── 1. Drop old check constraints (if any) ───────────────────────────
ALTER TABLE renders DROP CONSTRAINT IF EXISTS renders_status_check;

-- ── 2. Backfill data ─────────────────────────────────────────────────
UPDATE renders SET status = 'drafting'
  WHERE status = 'draft' AND script IS NOT NULL AND script <> '';

UPDATE renders SET status = 'queued'
  WHERE status IN ('pending', 'draft');

UPDATE renders SET status = 'rendering'
  WHERE status IN ('processing', 'voice_done', 'motion_done', 'lipsync_done');

-- ── 3. Enforce the new enum at the DB level ──────────────────────────
ALTER TABLE renders
  ADD CONSTRAINT renders_status_check
  CHECK (status IN ('queued', 'drafting', 'rendering', 'complete', 'failed'));

ALTER TABLE renders ALTER COLUMN status SET DEFAULT 'queued';

-- ── 4. Make renders realtime-subscribable ────────────────────────────
-- The client subscribes to render_events for granular UI, but a fallback
-- subscription to renders (for the top-level status string) keeps the
-- "what stage am I in" indicator authoritative when the events stream
-- is interrupted.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'renders'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE renders';
  END IF;
END $$;

-- ── 5. Useful covering index for the realtime subscription ───────────
CREATE INDEX IF NOT EXISTS idx_renders_user_updated
  ON renders(user_id, updated_at DESC);

-- ── 6. Per-scene output URLs (needed for pipeline idempotency) ───────
-- The pipeline writes one URL per scene once the motion stage completes.
-- Used by runPipeline() to skip work on re-invocation.
ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS scene_urls TEXT[] DEFAULT NULL;
