-- Add pipeline_status column to avatar_jobs.
-- This is informational-only metadata written by the worker at key progress
-- points. It does NOT participate in execution state or lease logic.
ALTER TABLE avatar_jobs
  ADD COLUMN IF NOT EXISTS pipeline_status TEXT;
