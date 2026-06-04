const postgres = require('postgres');
const sql = postgres('postgresql://postgres.wtzqjdlcvtjunujocbst:spJ4tLOMV9TO2fsN@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres');
const results = [];

async function run(label, query) {
  try { await sql.unsafe(query); results.push({ label, status: 'OK' }); }
  catch (e) { results.push({ label, status: 'FAIL', err: e.message }); }
}

async function main() {

  // ══════════════════════════════════════════════════════════════
  // PHASE I-1: IDENTITY & CONSISTENCY GUARDS
  // ══════════════════════════════════════════════════════════════

  // I-1a: renders cannot reach 'complete' without a render_finalised event.
  //       Uses DEFERRABLE CONSTRAINT trigger so finalize_render's two-step
  //       (UPDATE renders, then INSERT render_events) resolves within the
  //       same transaction before the check fires.
  await run('I-1a: trg_check_render_finalised (DEFERRED)', `
    CREATE OR REPLACE FUNCTION trg_check_render_finalised()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.status = 'complete' AND OLD.status IS DISTINCT FROM 'complete' THEN
        IF NOT EXISTS (
          SELECT 1 FROM render_events
          WHERE render_id = NEW.id AND event_type = 'render_finalised'
        ) THEN
          RAISE EXCEPTION
            'render_integrity: render % marked complete with no render_finalised event', NEW.id
            USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN NEW;
    END; $$;
    DROP TRIGGER IF EXISTS renders_finalised_guard ON renders;
    CREATE CONSTRAINT TRIGGER renders_finalised_guard
      AFTER UPDATE OF status ON renders
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION trg_check_render_finalised();
  `);

  // I-1b: validate_render_credit_trace() — callable safety check.
  //       Returns renders marked complete where credits_used > 0 but no
  //       matching credit_transactions row exists. Non-blocking; used by cron.
  await run('I-1b: validate_render_credit_trace()', `
    CREATE OR REPLACE FUNCTION validate_render_credit_trace()
    RETURNS TABLE(render_id UUID, user_id UUID, credits_used INT, missing_txn BOOLEAN)
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT
        r.id                                              AS render_id,
        r.user_id,
        r.credits_used,
        NOT EXISTS (
          SELECT 1 FROM credit_transactions ct
          WHERE ct.user_id = r.user_id
            AND ct.amount  = -r.credits_used
            AND ct.description LIKE 'pipeline_render:%' || r.id::text || '%'
        ) AS missing_txn
      FROM renders r
      WHERE r.status = 'complete'
        AND r.credits_used > 0;
    $$;
  `);

  // I-1c: validate_avatar_stage_order() — detect stage regressions.
  //       Stage order: validating_assets(1) building_scenes(2) routing_model(3)
  //                    executing(4) post_validation(5) stored(6)
  //       Legacy stages (animate/lipsync/tts/done) map to NULL and are skipped.
  await run('I-1c: validate_avatar_stage_order()', `
    CREATE OR REPLACE FUNCTION validate_avatar_stage_order()
    RETURNS TABLE(job_id UUID, current_stage TEXT, stage_outputs JSONB, anomaly TEXT)
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT
        id                    AS job_id,
        stage                 AS current_stage,
        stage_outputs,
        CASE
          WHEN status = 'completed' AND stage IS DISTINCT FROM 'stored'
            THEN 'completed_without_stored_stage'
          WHEN status = 'processing' AND stage IS NULL
            THEN 'processing_with_null_stage'
          ELSE NULL
        END AS anomaly
      FROM avatar_jobs
      WHERE status IN ('processing','completed')
        AND (
          (status = 'completed' AND stage IS DISTINCT FROM 'stored')
          OR (status = 'processing' AND stage IS NULL)
        );
    $$;
  `);

  // ══════════════════════════════════════════════════════════════
  // PHASE I-2: ORPHAN DETECTION VIEWS
  // ══════════════════════════════════════════════════════════════

  // I-2a: Renders with zero events (never got past creation)
  await run('I-2a: v_orphan_renders_no_events', `
    CREATE OR REPLACE VIEW v_orphan_renders_no_events AS
    SELECT r.id, r.user_id, r.status, r.created_at,
           now() - r.created_at AS age
    FROM renders r
    WHERE NOT EXISTS (
      SELECT 1 FROM render_events re WHERE re.render_id = r.id
    )
    ORDER BY r.created_at;
  `);

  // I-2b: Renders stuck in non-terminal state > 30 min
  await run('I-2b: v_stuck_renders', `
    CREATE OR REPLACE VIEW v_stuck_renders AS
    SELECT r.id, r.user_id, r.status, r.updated_at,
           now() - r.updated_at AS stuck_for,
           (SELECT event_type FROM render_events WHERE render_id=r.id ORDER BY created_at DESC LIMIT 1) AS latest_event
    FROM renders r
    WHERE r.status NOT IN ('complete','failed')
      AND r.updated_at < now() - INTERVAL '30 minutes'
    ORDER BY r.updated_at;
  `);

  // I-2c: render_pipeline_jobs with stale lock (worker died)
  await run('I-2c: v_orphan_pipeline_jobs', `
    CREATE OR REPLACE VIEW v_orphan_pipeline_jobs AS
    SELECT rpj.id, rpj.render_id, rpj.user_id, rpj.step,
           rpj.status, rpj.locked_by, rpj.locked_at, rpj.attempt,
           now() - rpj.locked_at AS locked_for
    FROM render_pipeline_jobs rpj
    WHERE rpj.status IN ('pending','running')
      AND rpj.locked_at IS NOT NULL
      AND rpj.locked_at < now() - INTERVAL '5 minutes'
    ORDER BY rpj.locked_at;
  `);

  // I-2d: render_jobs stuck (no terminal state after 30 min)
  await run('I-2d: v_stuck_render_jobs', `
    CREATE OR REPLACE VIEW v_stuck_render_jobs AS
    SELECT rj.id, rj.user_id, rj.status,
           rj.total_shots, rj.completed_shots, rj.failed_shots,
           rj.created_at, now() - rj.created_at AS age
    FROM render_jobs rj
    WHERE rj.status NOT IN ('completed','failed')
      AND rj.created_at < now() - INTERVAL '30 minutes'
    ORDER BY rj.created_at;
  `);

  // I-2e: Avatar jobs with expired lease (worker released without advancing)
  await run('I-2e: v_orphan_avatar_jobs', `
    CREATE OR REPLACE VIEW v_orphan_avatar_jobs AS
    SELECT aj.id, aj.user_id, aj.status, aj.stage,
           aj.locked_by, aj.lease_expires_at, aj.retry_count, aj.max_retries,
           now() - aj.updated_at AS stuck_for
    FROM avatar_jobs aj
    WHERE aj.status = 'processing'
      AND (
        aj.lease_expires_at < now()
        OR aj.updated_at < now() - INTERVAL '20 minutes'
      )
    ORDER BY aj.updated_at;
  `);

  // I-2f: Credit anomalies — profiles.credits negative (impossible under normal ops)
  await run('I-2f: v_negative_credit_profiles', `
    CREATE OR REPLACE VIEW v_negative_credit_profiles AS
    SELECT id AS user_id, email, credits, plan
    FROM profiles
    WHERE credits < 0
    ORDER BY credits;
  `);

  // I-2g: credits.balance diverged from profiles.credits
  await run('I-2g: v_credit_balance_drift', `
    CREATE OR REPLACE VIEW v_credit_balance_drift AS
    SELECT
      p.id             AS user_id,
      p.credits        AS profiles_credits,
      c.balance        AS ledger_balance,
      p.credits - c.balance AS drift
    FROM profiles p
    JOIN credits c ON c.user_id = p.id
    WHERE p.credits <> c.balance
    ORDER BY ABS(p.credits - c.balance) DESC;
  `);

  // I-2h: Revenue events with no matching user_revenue_state
  await run('I-2h: v_revenue_events_no_state', `
    CREATE OR REPLACE VIEW v_revenue_events_no_state AS
    SELECT re.id, re.user_id, re.event_type, re.created_at
    FROM revenue_events re
    WHERE NOT EXISTS (
      SELECT 1 FROM user_revenue_state urs WHERE urs.user_id = re.user_id
    )
    ORDER BY re.created_at DESC;
  `);

  // ══════════════════════════════════════════════════════════════
  // PHASE I-3: RECONCILIATION QUERIES (packaged as functions)
  // ══════════════════════════════════════════════════════════════

  // I-3a: Rebuild render state from latest render_event
  await run('I-3a: reconcile_render_status_from_events()', `
    CREATE OR REPLACE FUNCTION reconcile_render_status_from_events()
    RETURNS TABLE(render_id UUID, old_status TEXT, derived_status TEXT, needs_fix BOOLEAN)
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT
        r.id AS render_id,
        r.status AS old_status,
        CASE
          WHEN latest.event_type = 'render_finalised'                           THEN 'complete'
          WHEN latest.event_type = 'render_failed'                              THEN 'failed'
          WHEN latest.event_type IN ('lipsync_started','lipsync_completed',
                                     'motion_started','motion_completed',
                                     'voice_started','voice_completed')         THEN 'rendering'
          WHEN latest.event_type = 'script_generated'                           THEN 'drafting'
          WHEN latest.event_type IN ('render_created','brief_validated')        THEN 'queued'
          ELSE r.status
        END AS derived_status,
        r.status IS DISTINCT FROM
        CASE
          WHEN latest.event_type = 'render_finalised'                           THEN 'complete'
          WHEN latest.event_type = 'render_failed'                              THEN 'failed'
          WHEN latest.event_type IN ('lipsync_started','lipsync_completed',
                                     'motion_started','motion_completed',
                                     'voice_started','voice_completed')         THEN 'rendering'
          WHEN latest.event_type = 'script_generated'                           THEN 'drafting'
          WHEN latest.event_type IN ('render_created','brief_validated')        THEN 'queued'
          ELSE r.status
        END AS needs_fix
      FROM renders r
      LEFT JOIN LATERAL (
        SELECT event_type FROM render_events WHERE render_id = r.id ORDER BY created_at DESC LIMIT 1
      ) latest ON TRUE
      WHERE latest.event_type IS NOT NULL;
    $$;
  `);

  // I-3b: Credit ledger consistency check (profiles.credits vs transaction sum)
  await run('I-3b: reconcile_credit_ledger()', `
    CREATE OR REPLACE FUNCTION reconcile_credit_ledger()
    RETURNS TABLE(
      user_id        UUID,
      profiles_bal   INT,
      txn_sum        BIGINT,
      ledger_bal     INT,
      txn_drift      BIGINT,
      ledger_drift   INT
    )
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT
        p.id                                         AS user_id,
        p.credits                                    AS profiles_bal,
        COALESCE(SUM(ct.amount), 0)                  AS txn_sum,
        c.balance                                    AS ledger_bal,
        p.credits - COALESCE(SUM(ct.amount), 0)     AS txn_drift,
        p.credits - c.balance                        AS ledger_drift
      FROM profiles p
      LEFT JOIN credit_transactions ct ON ct.user_id = p.id
      LEFT JOIN credits c ON c.user_id = p.id
      GROUP BY p.id, p.credits, c.balance
      HAVING
        p.credits IS DISTINCT FROM COALESCE(SUM(ct.amount), 0)
        OR p.credits IS DISTINCT FROM c.balance
      ORDER BY ABS(p.credits - COALESCE(SUM(ct.amount), 0)) DESC;
    $$;
  `);

  // I-3c: Renders that should be complete but finalize_render was never called
  await run('I-3c: detect_missing_finalise_calls()', `
    CREATE OR REPLACE FUNCTION detect_missing_finalise_calls()
    RETURNS TABLE(render_id UUID, user_id UUID, status TEXT, has_finalised_event BOOLEAN, age INTERVAL)
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT
        r.id              AS render_id,
        r.user_id,
        r.status,
        EXISTS (
          SELECT 1 FROM render_events re WHERE re.render_id=r.id AND re.event_type='render_finalised'
        )                 AS has_finalised_event,
        now() - r.created_at AS age
      FROM renders r
      WHERE r.status NOT IN ('complete','failed')
        AND r.created_at < now() - INTERVAL '1 hour'
        AND EXISTS (
          SELECT 1 FROM render_events re WHERE re.render_id=r.id AND re.event_type='render_finalised'
        );
    $$;
  `);

  // I-3d: Content scoring gaps (events exist for a render but no content_scores row)
  await run('I-3d: detect_scoring_gaps()', `
    CREATE OR REPLACE FUNCTION detect_scoring_gaps()
    RETURNS TABLE(render_id UUID, user_id UUID, event_count BIGINT, has_score BOOLEAN)
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT
        (e.payload->>'render_id')::uuid AS render_id,
        r.user_id,
        COUNT(*)                        AS event_count,
        EXISTS (
          SELECT 1 FROM content_scores cs WHERE cs.render_id=(e.payload->>'render_id')::uuid
        )                               AS has_score
      FROM events e
      JOIN renders r ON r.id = (e.payload->>'render_id')::uuid
      WHERE e.payload ? 'render_id'
        AND e.type IN ('video_viewed','video_shared','video_downloaded','video_replayed','video_completed')
      GROUP BY (e.payload->>'render_id')::uuid, r.user_id
      HAVING NOT EXISTS (
        SELECT 1 FROM content_scores cs WHERE cs.render_id=(e.payload->>'render_id')::uuid
      );
    $$;
  `);

  // ══════════════════════════════════════════════════════════════
  // PHASE I-4: IDEMPOTENCY HARDENING
  // ══════════════════════════════════════════════════════════════

  // I-4a: Unique constraint — only one render_finalised event per render
  //       Prevents double-finalization from writing duplicate events
  await run('I-4a: unique render_finalised per render', `
    CREATE UNIQUE INDEX IF NOT EXISTS uq_render_events_finalised
      ON render_events (render_id)
      WHERE event_type = 'render_finalised';
  `);

  // I-4b: Unique constraint — offer_log cannot double-log the same revenue_event
  await run('I-4b: unique offer_log per revenue_event_id', `
    CREATE UNIQUE INDEX IF NOT EXISTS uq_offer_log_revenue_event
      ON offer_log (revenue_event_id)
      WHERE revenue_event_id IS NOT NULL;
  `);

  // I-4c: Idempotency table for credit deductions (prevents retry double-spend)
  //       Keyed on (user_id, idempotency_key). finalize_render uses render_id
  //       as natural idempotency — this covers ad-hoc deduction calls.
  await run('I-4c: credit_deduction_log table', `
    CREATE TABLE IF NOT EXISTS credit_deduction_log (
      idempotency_key TEXT    NOT NULL,
      user_id         UUID    NOT NULL,
      amount          INTEGER NOT NULL,
      source          TEXT    NOT NULL DEFAULT 'unknown',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, idempotency_key)
    );
    ALTER TABLE credit_deduction_log ENABLE ROW LEVEL SECURITY;
  `);

  // I-4d: safe_deduct_credits_idempotent() — wraps deduct_credits with dedup key.
  //       Returns (ok, already_applied, new_balance). Callers must pass a stable
  //       idempotency_key (e.g. render_id::text or job_id::text).
  await run('I-4d: safe_deduct_credits_idempotent()', `
    CREATE OR REPLACE FUNCTION safe_deduct_credits_idempotent(
      p_user_id        UUID,
      p_amount         INTEGER,
      p_idempotency_key TEXT,
      p_source         TEXT DEFAULT 'unknown'
    ) RETURNS TABLE(ok BOOLEAN, already_applied BOOLEAN, new_balance INTEGER)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_inserted BOOLEAN := false;
      v_balance  INTEGER;
    BEGIN
      -- Attempt idempotency key insert (will fail silently on conflict)
      BEGIN
        INSERT INTO credit_deduction_log (idempotency_key, user_id, amount, source)
          VALUES (p_idempotency_key, p_user_id, p_amount, p_source);
        v_inserted := true;
      EXCEPTION WHEN unique_violation THEN
        -- Already applied — return current balance without deducting
        SELECT credits INTO v_balance FROM profiles WHERE id = p_user_id;
        ok := TRUE; already_applied := TRUE; new_balance := COALESCE(v_balance, 0);
        RETURN NEXT; RETURN;
      END;

      -- First time: perform the actual deduction
      IF NOT public.deduct_credits(p_user_id, p_amount) THEN
        -- Deduction failed (insufficient) — remove the idempotency key
        DELETE FROM credit_deduction_log WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key;
        SELECT credits INTO v_balance FROM profiles WHERE id = p_user_id;
        ok := FALSE; already_applied := FALSE; new_balance := COALESCE(v_balance, 0);
        RETURN NEXT; RETURN;
      END IF;

      SELECT credits INTO v_balance FROM profiles WHERE id = p_user_id;
      ok := TRUE; already_applied := FALSE; new_balance := COALESCE(v_balance, 0);
      RETURN NEXT;
    END; $$;
  `);

  // I-4e: Guard render_jobs from duplicate completion signals
  await run('I-4e: uq_render_events_failed per render', `
    CREATE UNIQUE INDEX IF NOT EXISTS uq_render_events_failed
      ON render_events (render_id)
      WHERE event_type = 'render_failed';
  `);

  // ══════════════════════════════════════════════════════════════
  // PHASE I-5: OBSERVABILITY LAYER
  // ══════════════════════════════════════════════════════════════

  // I-5a: render_execution_trace — unified per-render pipeline view
  await run('I-5a: v_render_execution_trace', `
    CREATE OR REPLACE VIEW v_render_execution_trace AS
    SELECT
      r.id                                                        AS render_id,
      r.user_id,
      r.status,
      r.template,
      r.credits_used,
      r.viral_score,
      r.created_at,
      r.completed_at,
      r.updated_at,
      -- Latest event lineage
      ev.event_type                                               AS latest_event,
      ev.created_at                                               AS latest_event_at,
      -- Event counts by category
      ec.total_events,
      ec.finalised_events,
      ec.failed_events,
      -- Pipeline job health
      pj.total_steps,
      pj.completed_steps,
      pj.failed_steps,
      pj.running_steps,
      pj.orphaned_steps,
      -- Credit verification
      ct.credited_amount,
      -- Derived health signal
      CASE
        WHEN r.status = 'complete'  AND ec.finalised_events > 0   THEN 'healthy'
        WHEN r.status = 'complete'  AND ec.finalised_events = 0   THEN 'incomplete_finalize'
        WHEN r.status = 'failed'    AND ec.failed_events > 0      THEN 'healthy_failure'
        WHEN r.status = 'failed'    AND ec.failed_events = 0      THEN 'untraced_failure'
        WHEN r.status NOT IN ('complete','failed')
          AND r.updated_at < now() - INTERVAL '30 minutes'        THEN 'stuck'
        WHEN ec.total_events = 0                                   THEN 'no_events'
        ELSE 'in_progress'
      END                                                         AS health
    FROM renders r
    LEFT JOIN LATERAL (
      SELECT event_type, created_at FROM render_events WHERE render_id=r.id ORDER BY created_at DESC LIMIT 1
    ) ev ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)                                     AS total_events,
        COUNT(*) FILTER (WHERE event_type='render_finalised') AS finalised_events,
        COUNT(*) FILTER (WHERE event_type='render_failed')    AS failed_events
      FROM render_events WHERE render_id=r.id
    ) ec ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)                                       AS total_steps,
        COUNT(*) FILTER (WHERE status='completed')     AS completed_steps,
        COUNT(*) FILTER (WHERE status='failed')        AS failed_steps,
        COUNT(*) FILTER (WHERE status='running')       AS running_steps,
        COUNT(*) FILTER (WHERE status IN ('pending','running') AND locked_at < now()-INTERVAL '5 minutes') AS orphaned_steps
      FROM render_pipeline_jobs WHERE render_id=r.id
    ) pj ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(amount) AS credited_amount FROM credit_transactions
      WHERE user_id=r.user_id AND description LIKE '%' || r.id::text || '%'
    ) ct ON TRUE;
  `);

  // I-5b: avatar_execution_trace — per-job stage visibility
  await run('I-5b: v_avatar_execution_trace', `
    CREATE OR REPLACE VIEW v_avatar_execution_trace AS
    SELECT
      aj.id                                                       AS job_id,
      aj.user_id,
      aj.status,
      aj.stage,
      aj.pipeline_status,
      aj.retry_count,
      aj.max_retries,
      aj.locked_by,
      aj.lease_expires_at,
      aj.created_at,
      aj.updated_at,
      now() - aj.updated_at                                       AS time_in_current_state,
      -- Stage audit
      sl.total_stages,
      sl.completed_stages,
      sl.failed_stages,
      -- API cost
      acl.total_api_cost_usd,
      -- Health signal
      CASE
        WHEN aj.status = 'completed'                              THEN 'healthy'
        WHEN aj.status = 'failed'                                 THEN 'failed'
        WHEN aj.status = 'processing' AND aj.lease_expires_at < now()
                                                                  THEN 'lease_expired'
        WHEN aj.status = 'processing' AND aj.updated_at < now() - INTERVAL '20 minutes'
                                                                  THEN 'stuck'
        WHEN aj.status = 'queued'     AND aj.created_at < now() - INTERVAL '10 minutes'
                                                                  THEN 'queue_backlog'
        ELSE 'ok'
      END                                                         AS health
    FROM avatar_jobs aj
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)                                                AS total_stages,
        COUNT(*) FILTER (WHERE status='completed')             AS completed_stages,
        COUNT(*) FILTER (WHERE status='failed')                AS failed_stages
      FROM avatar_stage_ledger WHERE job_id=aj.id
    ) sl ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(cost_usd) AS total_api_cost_usd
      FROM external_api_cost_ledger WHERE job_id=aj.id
    ) acl ON TRUE;
  `);

  // I-5c: system_health_summary — single-query dashboard snapshot
  await run('I-5c: v_system_health_summary', `
    CREATE OR REPLACE VIEW v_system_health_summary AS
    SELECT
      -- Render pipeline health
      (SELECT COUNT(*) FROM renders WHERE status NOT IN ('complete','failed') AND updated_at < now()-INTERVAL '30 minutes')::int
                                                                    AS stuck_renders,
      (SELECT COUNT(*) FROM renders WHERE NOT EXISTS (SELECT 1 FROM render_events re WHERE re.render_id=renders.id))::int
                                                                    AS renders_no_events,
      (SELECT COUNT(*) FROM render_pipeline_jobs WHERE status IN ('pending','running') AND locked_at < now()-INTERVAL '5 minutes')::int
                                                                    AS orphaned_pipeline_jobs,
      (SELECT COUNT(*) FROM render_jobs WHERE status NOT IN ('completed','failed') AND created_at < now()-INTERVAL '30 minutes')::int
                                                                    AS stuck_render_jobs,
      -- Avatar pipeline health
      (SELECT COUNT(*) FROM avatar_jobs WHERE status='processing' AND (lease_expires_at < now() OR updated_at < now()-INTERVAL '20 minutes'))::int
                                                                    AS orphaned_avatar_jobs,
      (SELECT COUNT(*) FROM avatar_jobs WHERE status='queued' AND created_at < now()-INTERVAL '10 minutes')::int
                                                                    AS avatar_queue_backlog,
      -- Credit health
      (SELECT COUNT(*) FROM profiles WHERE credits < 0)::int        AS users_negative_credits,
      (SELECT COUNT(*) FROM v_credit_balance_drift)::int            AS users_with_credit_drift,
      -- Revenue health
      (SELECT COUNT(*) FROM revenue_events re WHERE NOT EXISTS (SELECT 1 FROM user_revenue_state urs WHERE urs.user_id=re.user_id))::int
                                                                    AS revenue_events_no_state,
      -- Scoring health
      (SELECT COUNT(*) FROM renders r WHERE r.status='complete' AND NOT EXISTS (SELECT 1 FROM content_scores cs WHERE cs.render_id=r.id))::int
                                                                    AS completed_renders_unscored,
      -- Timestamp
      now()                                                         AS checked_at;
  `);

  // ══════════════════════════════════════════════════════════════
  // PHASE I-6: BACKGROUND RECOVERY JOB FUNCTIONS
  // ══════════════════════════════════════════════════════════════

  // I-6a: recover_stuck_render_pipeline_jobs()
  //       Resets orphaned render_pipeline_jobs (stale lock > 5 min) back to pending.
  //       Increments attempt counter. Called by cron/pipeline-worker.
  await run('I-6a: recover_stuck_render_pipeline_jobs()', `
    CREATE OR REPLACE FUNCTION recover_stuck_render_pipeline_jobs(
      p_stale_minutes INTEGER DEFAULT 5
    ) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE v_count INTEGER;
    BEGIN
      UPDATE render_pipeline_jobs
        SET status    = 'pending',
            locked_by = NULL,
            locked_at = NULL,
            attempt   = attempt + 1
      WHERE status IN ('pending','running')
        AND locked_at IS NOT NULL
        AND locked_at < now() - (p_stale_minutes||' minutes')::interval
      RETURNING id INTO v_count;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      RETURN v_count;
    END; $$;
  `);

  // I-6b: recover_stuck_avatar_jobs()
  //       Resets avatar_jobs whose lease expired back to queued so another worker can pick them up.
  //       Only resets if retry_count < max_retries; marks as failed otherwise.
  await run('I-6b: recover_stuck_avatar_jobs()', `
    CREATE OR REPLACE FUNCTION recover_stuck_avatar_jobs()
    RETURNS TABLE(job_id UUID, action TEXT) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      -- Jobs under retry limit: requeue
      RETURN QUERY
        UPDATE avatar_jobs
          SET status           = 'queued',
              stage            = NULL,
              locked_by        = NULL,
              locked_at        = NULL,
              lease_expires_at = NULL,
              retry_count      = retry_count + 1,
              updated_at       = now()
        WHERE status = 'processing'
          AND (lease_expires_at < now() OR updated_at < now() - INTERVAL '20 minutes')
          AND retry_count < max_retries
        RETURNING id, 'requeued'::text;

      -- Jobs over retry limit: mark failed
      RETURN QUERY
        UPDATE avatar_jobs
          SET status           = 'failed',
              error            = 'lease_expired_max_retries',
              last_error_code  = 'LEASE_EXPIRED',
              locked_by        = NULL,
              locked_at        = NULL,
              lease_expires_at = NULL,
              updated_at       = now()
        WHERE status = 'processing'
          AND (lease_expires_at < now() OR updated_at < now() - INTERVAL '20 minutes')
          AND retry_count >= max_retries
        RETURNING id, 'failed_max_retries'::text;
    END; $$;
  `);

  // I-6c: reconcile_credit_state()
  //       Aligns credits.balance with the sum of credit_transactions.
  //       SAFE: only updates credits.balance; never touches profiles.credits.
  //       Returns rows fixed.
  await run('I-6c: reconcile_credit_state()', `
    CREATE OR REPLACE FUNCTION reconcile_credit_state()
    RETURNS TABLE(user_id UUID, old_balance INT, new_balance INT) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      RETURN QUERY
        UPDATE credits c
          SET balance = txn.total, updated_at = now()
        FROM (
          SELECT ct.user_id, COALESCE(SUM(ct.amount)::int, 0) AS total
          FROM credit_transactions ct
          GROUP BY ct.user_id
        ) txn
        WHERE c.user_id = txn.user_id
          AND c.balance IS DISTINCT FROM txn.total
        RETURNING c.user_id,
                  c.balance - (c.balance - txn.total) AS old_balance,
                  txn.total AS new_balance;
    END; $$;
  `);

  // I-6d: rebuild_missing_render_states_from_events()
  //       Finds renders whose DB status contradicts the event stream and corrects them.
  //       Only fixes terminal states (complete/failed) where event evidence is definitive.
  //       Uses SET LOCAL omnyra.bypass = 'on' to bypass the state machine trigger.
  await run('I-6d: rebuild_missing_render_states_from_events()', `
    CREATE OR REPLACE FUNCTION rebuild_missing_render_states_from_events()
    RETURNS TABLE(render_id UUID, old_status TEXT, new_status TEXT)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      -- Bypass state machine so we can apply event-derived corrections
      SET LOCAL omnyra.bypass = 'on';

      RETURN QUERY
        UPDATE renders r
          SET status     = ev.correct_status,
              updated_at = now()
        FROM (
          SELECT DISTINCT ON (re.render_id)
            re.render_id,
            CASE
              WHEN re.event_type = 'render_finalised' THEN 'complete'
              WHEN re.event_type = 'render_failed'    THEN 'failed'
              ELSE NULL
            END AS correct_status
          FROM render_events re
          WHERE re.event_type IN ('render_finalised','render_failed')
          ORDER BY re.render_id, re.created_at DESC
        ) ev
        WHERE r.id = ev.render_id
          AND ev.correct_status IS NOT NULL
          AND r.status IS DISTINCT FROM ev.correct_status
        RETURNING r.id, (SELECT status FROM renders WHERE id=r.id) AS old_status, ev.correct_status;
    END; $$;
  `);

  // I-6e: score_unscored_completed_renders()
  //       Runs calculate_viral_score for completed renders missing a content_scores row.
  //       Called by cron/recalculate-scores as a gap-fill pass.
  await run('I-6e: score_unscored_completed_renders()', `
    CREATE OR REPLACE FUNCTION score_unscored_completed_renders()
    RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_render RECORD;
      v_count  INTEGER := 0;
    BEGIN
      FOR v_render IN
        SELECT id FROM renders
        WHERE status = 'complete'
          AND NOT EXISTS (SELECT 1 FROM content_scores cs WHERE cs.render_id = renders.id)
        ORDER BY created_at DESC
        LIMIT 500
      LOOP
        PERFORM calculate_viral_score(v_render.id);
        v_count := v_count + 1;
      END LOOP;
      RETURN v_count;
    END; $$;
  `);

  await sql.end();

  const ok     = results.filter(r => r.status === 'OK').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log('\n=== PHASE I RESULTS ===');
  results.forEach(r => console.log((r.status === 'OK' ? '✓' : '✗') + ' ' + r.label + (r.err ? '\n    → ' + r.err : '')));
  console.log(`\n${ok} OK  |  ${failed} FAILED`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
