const postgres = require('postgres');
const sql = postgres('postgresql://postgres.wtzqjdlcvtjunujocbst:spJ4tLOMV9TO2fsN@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres');
const results = [];

async function run(label, query) {
  try { await sql.unsafe(query); results.push({ label, status: 'OK' }); }
  catch (e) { results.push({ label, status: 'FAIL', err: e.message }); }
}

async function main() {

  // I-3d fix: pre-aggregate into a CTE so HAVING subquery doesn't reference
  // ungrouped e.payload. EXISTS in HAVING can't reference unaggregated columns.
  await run('I-3d: detect_scoring_gaps()', `
    CREATE OR REPLACE FUNCTION detect_scoring_gaps()
    RETURNS TABLE(render_id UUID, user_id UUID, event_count BIGINT, has_score BOOLEAN)
    LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      WITH agg AS (
        SELECT
          (e.payload->>'render_id')::uuid AS render_id,
          r.user_id,
          COUNT(*)                        AS event_count
        FROM events e
        JOIN renders r ON r.id = (e.payload->>'render_id')::uuid
        WHERE e.payload ? 'render_id'
          AND e.type IN ('video_viewed','video_shared','video_downloaded','video_replayed','video_completed')
        GROUP BY (e.payload->>'render_id')::uuid, r.user_id
      )
      SELECT
        agg.render_id,
        agg.user_id,
        agg.event_count,
        EXISTS (SELECT 1 FROM content_scores cs WHERE cs.render_id = agg.render_id) AS has_score
      FROM agg
      WHERE NOT EXISTS (
        SELECT 1 FROM content_scores cs WHERE cs.render_id = agg.render_id
      );
    $$;
  `);

  // I-5b fix: external_api_cost_ledger.cost_usd does not exist in production.
  // Remove that join; retain avatar_stage_ledger join behind a guard.
  // avatar_stage_ledger may also not exist — use a conditional query.
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
    FROM avatar_jobs aj;
  `);

  await sql.end();
  console.log('\n=== PHASE I PATCH RESULTS ===');
  results.forEach(r => console.log((r.status === 'OK' ? '✓' : '✗') + ' ' + r.label + (r.err ? '\n    → ' + r.err : '')));
  const ok = results.filter(r => r.status === 'OK').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`\n${ok} OK  |  ${failed} FAILED`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
