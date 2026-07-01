-- Add input_json column to pipeline_jobs for Pipeline V2 async dispatch.
--
-- When /api/generate-cinematic-sequence returns immediately with a videoId,
-- it persists the PipelineInput + credit txnId here so the cron worker
-- (/api/cron/pipeline-worker) can reconstruct and run the pipeline
-- without any open HTTP connection.
--
-- NULL means the row was created by the legacy render-engine path — the
-- pipeline-worker-v2 cron skips those rows entirely (claimV2Jobs filters
-- WHERE input_json IS NOT NULL).

ALTER TABLE pipeline_jobs
  ADD COLUMN IF NOT EXISTS input_json jsonb;
