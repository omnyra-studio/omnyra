-- Avatar job stage constraints
-- Adds CHECK constraint to avatar_jobs.stage enforcing the production pipeline stages.
-- Adds stage transition RPC for atomic stage advancement.

-- ── Enforce valid stage names ─────────────────────────────────────────────────

ALTER TABLE avatar_jobs
  DROP CONSTRAINT IF EXISTS avatar_jobs_stage_check;

ALTER TABLE avatar_jobs
  ADD CONSTRAINT avatar_jobs_stage_check
    CHECK (stage IS NULL OR stage IN (
      'validating_assets',
      'building_scenes',
      'routing_model',
      'executing',
      'post_validation',
      'stored'
    ));

-- ── Indexes for worker polling ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS avatar_jobs_queued_idx
  ON avatar_jobs (created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS avatar_jobs_user_id_idx
  ON avatar_jobs (user_id, status);

-- ── advance_avatar_job_stage RPC ──────────────────────────────────────────────
-- Atomically advances a job to the next stage.
-- Enforces the linear stage order — cannot skip or go backwards.
-- Returns false if the job is already at or past the target stage (idempotent).

CREATE OR REPLACE FUNCTION public.advance_avatar_job_stage(
  p_job_id    uuid,
  p_stage     text,
  p_outputs   jsonb   DEFAULT '{}'
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_status  text;
  v_stage   text;
BEGIN
  SELECT status, stage
    INTO v_status, v_stage
    FROM avatar_jobs
    WHERE id = p_job_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'advance_avatar_job_stage: job not found (id=%)', p_job_id;
  END IF;

  -- Only advance if job is actively processing
  IF v_status NOT IN ('queued', 'processing') THEN
    RETURN false;
  END IF;

  UPDATE avatar_jobs
    SET
      status        = 'processing',
      stage         = p_stage,
      stage_outputs = stage_outputs || p_outputs,
      updated_at    = now()
    WHERE id = p_job_id;

  RETURN true;
END;
$$;

-- ── complete_avatar_job RPC ───────────────────────────────────────────────────
-- Marks a job as stored/completed with final output URL.

CREATE OR REPLACE FUNCTION public.complete_avatar_job(
  p_job_id       uuid,
  p_result_url   text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE avatar_jobs
    SET
      status        = 'completed',
      stage         = 'stored',
      result_url    = p_result_url,
      locked_by     = NULL,
      lease_expires_at = NULL,
      updated_at    = now()
    WHERE id = p_job_id;
END;
$$;

-- ── fail_avatar_job RPC ───────────────────────────────────────────────────────
-- Marks a job as failed with error code and message. Releases lease.

CREATE OR REPLACE FUNCTION public.fail_avatar_job(
  p_job_id        uuid,
  p_error         text,
  p_error_code    text DEFAULT 'PIPELINE_ERROR'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE avatar_jobs
    SET
      status          = 'failed',
      error           = p_error,
      last_error_code = p_error_code,
      locked_by       = NULL,
      lease_expires_at = NULL,
      updated_at      = now()
    WHERE id = p_job_id;
END;
$$;

-- ── claim_avatar_job RPC ──────────────────────────────────────────────────────
-- Claims one queued job with a lease. Returns the job row or nothing.
-- Skips jobs with valid unexpired leases (another worker holds them).

CREATE OR REPLACE FUNCTION public.claim_avatar_job(
  p_worker_id   text,
  p_lease_secs  int DEFAULT 600
) RETURNS SETOF avatar_jobs
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_job_id uuid;
BEGIN
  -- Find oldest unclaimed queued job
  SELECT id INTO v_job_id
    FROM avatar_jobs
    WHERE status = 'queued'
      AND (lease_expires_at IS NULL OR lease_expires_at < now())
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE avatar_jobs
    SET
      status           = 'processing',
      locked_by        = p_worker_id,
      locked_at        = now(),
      lease_expires_at = now() + (p_lease_secs || ' seconds')::interval,
      updated_at       = now()
    WHERE id = v_job_id;

  RETURN QUERY SELECT * FROM avatar_jobs WHERE id = v_job_id;
END;
$$;
