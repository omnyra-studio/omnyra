-- Avatar pipeline tables: avatar_jobs, avatar_stage_ledger, external_api_cost_ledger
--
-- Run once in Supabase SQL editor or via `supabase db push`.
--
-- avatar_jobs
--   Operational state for each queued/running/completed avatar generation request.
--   The worker owns all writes via service-role client (bypasses RLS).
--   Users read their own rows via anon/auth client (RLS enforced).
--
-- avatar_stage_ledger
--   Exactly-once execution record per (job, stage).
--   Immutable once status = 'completed' — never overwritten.
--
-- external_api_cost_ledger
--   Exactly-once billing record per (job, stage, request_hash).
--   Prevents duplicate ElevenLabs / Kling / SyncLabs charges on retry.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. avatar_jobs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS avatar_jobs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key       TEXT        NOT NULL,

  -- Job lifecycle
  status                TEXT        NOT NULL DEFAULT 'queued'
                          CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  stage                 TEXT,                              -- current pipeline stage
  input                 JSONB       NOT NULL DEFAULT '{}', -- { script, voice_id, image_url }

  -- Outputs
  result_url            TEXT,
  animated_video_url    TEXT,
  error                 TEXT,
  last_error_code       TEXT,

  -- Retry tracking
  retry_count           INT         NOT NULL DEFAULT 0,
  max_retries           INT         NOT NULL DEFAULT 2,
  retry_count_per_stage JSONB       NOT NULL DEFAULT '{}',

  -- Stage-to-stage output passing (audio_url, animated_video_url, etc.)
  stage_outputs         JSONB       NOT NULL DEFAULT '{}',

  -- Lease-based execution locking
  locked_by             TEXT,       -- worker UUID holding the current lease
  locked_at             TIMESTAMPTZ,
  lease_expires_at      TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: one active (non-failed) job per user+input combination
CREATE UNIQUE INDEX IF NOT EXISTS avatar_jobs_idempotency_idx
  ON avatar_jobs (user_id, idempotency_key)
  WHERE status != 'failed';

-- Recovery queries: expired leases + orphaned queued jobs
CREATE INDEX IF NOT EXISTS avatar_jobs_lease_recovery_idx
  ON avatar_jobs (status, lease_expires_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS avatar_jobs_orphan_idx
  ON avatar_jobs (status, stage, updated_at)
  WHERE status = 'queued' AND stage IS NOT NULL;

ALTER TABLE avatar_jobs ENABLE ROW LEVEL SECURITY;

-- Users read/write only their own jobs (worker uses service role, bypasses RLS)
CREATE POLICY "avatar_jobs_owner"
  ON avatar_jobs FOR ALL
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. avatar_stage_ledger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS avatar_stage_ledger (
  job_id                UUID        NOT NULL REFERENCES avatar_jobs(id) ON DELETE CASCADE,
  stage                 TEXT        NOT NULL,
  execution_id          TEXT        NOT NULL, -- worker UUID; 'reconciled' for recovery writes
  status                TEXT        NOT NULL DEFAULT 'running'
                          CHECK (status IN ('running', 'completed', 'failed')),
  external_request_hash TEXT,
  output_url            TEXT,
  error                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (job_id, stage)
);

-- Cost-desync scan: find completed entries for global reconciliation
CREATE INDEX IF NOT EXISTS avatar_stage_ledger_completed_idx
  ON avatar_stage_ledger (stage, status)
  WHERE status = 'completed';

ALTER TABLE avatar_stage_ledger ENABLE ROW LEVEL SECURITY;

-- Only service role (worker) writes; users have no direct access
CREATE POLICY "avatar_stage_ledger_service_only"
  ON avatar_stage_ledger FOR ALL
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. external_api_cost_ledger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS external_api_cost_ledger (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         UUID        NOT NULL REFERENCES avatar_jobs(id) ON DELETE CASCADE,
  stage          TEXT        NOT NULL,
  provider       TEXT        NOT NULL,  -- elevenlabs | kling | synclabs
  request_hash   TEXT        NOT NULL,  -- sha256 of exact API inputs
  status         TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'charged')),
  output_url     TEXT,                  -- URL returned by the external API
  cost_estimate  NUMERIC,               -- credits to deduct

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (job_id, stage, request_hash)
);

-- Cost-desync scan: charged entries missing from execution ledger
CREATE INDEX IF NOT EXISTS external_api_cost_ledger_charged_idx
  ON external_api_cost_ledger (status, output_url)
  WHERE status = 'charged';

ALTER TABLE external_api_cost_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "external_api_cost_ledger_service_only"
  ON external_api_cost_ledger FOR ALL
  USING (false);
