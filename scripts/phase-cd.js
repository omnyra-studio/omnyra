const postgres = require('postgres');
const sql = postgres('postgresql://postgres.wtzqjdlcvtjunujocbst:spJ4tLOMV9TO2fsN@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres');
const results = [];

async function run(label, query) {
  try { await sql.unsafe(query); results.push({ label, status: 'OK' }); }
  catch (e) { results.push({ label, status: 'FAIL', err: e.message }); }
}

async function main() {

  // ── PHASE C: STATE MACHINE TRIGGERS ──────────────────────────────────────

  // C1 — render state machine trigger function + trigger
  await run('C1: trg_renders_status_machine', `
    CREATE OR REPLACE FUNCTION trg_renders_status_machine()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE
      v_old TEXT := OLD.status;
      v_new TEXT := NEW.status;
      v_bypass TEXT;
    BEGIN
      BEGIN
        v_bypass := current_setting('omnyra.bypass', true);
      EXCEPTION WHEN OTHERS THEN
        v_bypass := NULL;
      END;
      IF v_bypass = 'on' THEN RETURN NEW; END IF;
      IF v_old IS NOT DISTINCT FROM v_new THEN RETURN NEW; END IF;
      IF v_old = 'complete' THEN
        RAISE EXCEPTION 'render_state_machine: cannot transition from complete (got %)', v_new USING ERRCODE = '23514';
      END IF;
      IF v_old = 'queued'    AND v_new NOT IN ('drafting','failed')              THEN
        RAISE EXCEPTION 'render_state_machine: invalid transition queued → %',    v_new USING ERRCODE = '23514';
      END IF;
      IF v_old = 'drafting'  AND v_new NOT IN ('rendering','failed')             THEN
        RAISE EXCEPTION 'render_state_machine: invalid transition drafting → %',  v_new USING ERRCODE = '23514';
      END IF;
      IF v_old = 'rendering' AND v_new NOT IN ('complete','failed')              THEN
        RAISE EXCEPTION 'render_state_machine: invalid transition rendering → %', v_new USING ERRCODE = '23514';
      END IF;
      IF v_old = 'failed'    AND v_new NOT IN ('drafting','rendering','failed')  THEN
        RAISE EXCEPTION 'render_state_machine: invalid transition failed → %',    v_new USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS renders_status_machine ON renders;
    CREATE TRIGGER renders_status_machine
      BEFORE UPDATE OF status ON renders
      FOR EACH ROW EXECUTE FUNCTION trg_renders_status_machine();
  `);

  // C2 — handle_new_user trigger on auth.users (re-deploy idempotently)
  await run('C2: handle_new_user trigger', `
    CREATE OR REPLACE FUNCTION handle_new_user()
    RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      INSERT INTO profiles (id, full_name, avatar_url)
      VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url'
      )
      ON CONFLICT (id) DO NOTHING;
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION handle_new_user();
  `);

  // ── PHASE D: RPC CORE ─────────────────────────────────────────────────────

  // D1 — Avatar pipeline RPCs (from 20260603_avatar_job_stages.sql)
  await run('D1: advance_avatar_job_stage', `
    CREATE OR REPLACE FUNCTION public.advance_avatar_job_stage(
      p_job_id  uuid,
      p_stage   text,
      p_outputs jsonb DEFAULT '{}'
    ) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE v_status text; v_stage text;
    BEGIN
      SELECT status, stage INTO v_status, v_stage FROM avatar_jobs WHERE id = p_job_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'advance_avatar_job_stage: job not found (id=%)', p_job_id; END IF;
      IF v_status NOT IN ('queued','processing') THEN RETURN false; END IF;
      UPDATE avatar_jobs SET status='processing', stage=p_stage, stage_outputs=stage_outputs||p_outputs, updated_at=now() WHERE id=p_job_id;
      RETURN true;
    END; $$;
  `);

  await run('D1: complete_avatar_job', `
    CREATE OR REPLACE FUNCTION public.complete_avatar_job(p_job_id uuid, p_result_url text)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
      UPDATE avatar_jobs SET status='completed', stage='stored', result_url=p_result_url, locked_by=NULL, lease_expires_at=NULL, updated_at=now() WHERE id=p_job_id;
    END; $$;
  `);

  await run('D1: fail_avatar_job', `
    CREATE OR REPLACE FUNCTION public.fail_avatar_job(
      p_job_id uuid, p_error text, p_error_code text DEFAULT 'PIPELINE_ERROR'
    ) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
      UPDATE avatar_jobs SET status='failed', error=p_error, last_error_code=p_error_code, locked_by=NULL, lease_expires_at=NULL, updated_at=now() WHERE id=p_job_id;
    END; $$;
  `);

  await run('D1: claim_avatar_job', `
    CREATE OR REPLACE FUNCTION public.claim_avatar_job(
      p_worker_id text, p_lease_secs int DEFAULT 600
    ) RETURNS SETOF avatar_jobs LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE v_job_id uuid;
    BEGIN
      SELECT id INTO v_job_id FROM avatar_jobs
        WHERE status='queued' AND (lease_expires_at IS NULL OR lease_expires_at < now())
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
      IF NOT FOUND THEN RETURN; END IF;
      UPDATE avatar_jobs SET status='processing', locked_by=p_worker_id, locked_at=now(),
        lease_expires_at=now()+(p_lease_secs||' seconds')::interval, updated_at=now()
        WHERE id=v_job_id;
      RETURN QUERY SELECT * FROM avatar_jobs WHERE id=v_job_id;
    END; $$;
  `);

  // D2 — Avatar job stage constraint + indexes
  await run('D2: avatar_jobs stage constraint + indexes', `
    ALTER TABLE avatar_jobs DROP CONSTRAINT IF EXISTS avatar_jobs_stage_check;
    ALTER TABLE avatar_jobs ADD CONSTRAINT avatar_jobs_stage_check
      CHECK (stage IS NULL OR stage IN (
        'validating_assets','building_scenes','routing_model',
        'executing','post_validation','stored'
      ));
    CREATE INDEX IF NOT EXISTS avatar_jobs_queued_idx   ON avatar_jobs(created_at) WHERE status='queued';
    CREATE INDEX IF NOT EXISTS avatar_jobs_user_id_idx  ON avatar_jobs(user_id, status);
  `);

  // D3 — increment_render_job_progress (depends on render_jobs ✓)
  await run('D3: increment_render_job_progress', `
    CREATE OR REPLACE FUNCTION increment_render_job_progress(
      p_job_id    UUID,
      p_completed INT DEFAULT 0,
      p_failed    INT DEFAULT 0
    ) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
      UPDATE render_jobs SET
        completed_shots = completed_shots + p_completed,
        failed_shots    = failed_shots    + p_failed
      WHERE id = p_job_id;
    END; $$;
  `);

  // D4 — try_deduct_credits (depends on credits ✓, credit_transactions ✓)
  await run('D4: try_deduct_credits', `
    CREATE OR REPLACE FUNCTION try_deduct_credits(
      p_user_id     UUID,
      p_amount      INTEGER,
      p_type        TEXT DEFAULT 'usage',
      p_description TEXT DEFAULT NULL
    ) RETURNS TABLE(ok BOOLEAN, new_balance INTEGER, reason TEXT)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE v_balance INTEGER;
    BEGIN
      IF p_amount IS NULL OR p_amount <= 0 THEN
        ok := FALSE; new_balance := 0; reason := 'invalid_amount'; RETURN NEXT; RETURN;
      END IF;
      SELECT balance INTO v_balance FROM credits WHERE user_id = p_user_id FOR UPDATE;
      IF v_balance IS NULL THEN
        ok := FALSE; new_balance := 0; reason := 'no_credit_row'; RETURN NEXT; RETURN;
      END IF;
      IF v_balance < p_amount THEN
        ok := FALSE; new_balance := v_balance; reason := 'insufficient_credits'; RETURN NEXT; RETURN;
      END IF;
      INSERT INTO credit_transactions (user_id, amount, type, description)
        VALUES (p_user_id, -p_amount, p_type, p_description);
      ok := TRUE; new_balance := v_balance - p_amount; reason := 'ok'; RETURN NEXT;
    END; $$;
  `);

  // D5 — grant_credits_atomic (depends on credits ✓, credit_transactions ✓)
  await run('D5: grant_credits_atomic', `
    CREATE OR REPLACE FUNCTION grant_credits_atomic(
      p_user_id UUID, p_amount INTEGER, p_type TEXT, p_description TEXT
    ) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE v_new_balance INTEGER;
    BEGIN
      IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
      END IF;
      INSERT INTO credit_transactions (user_id, amount, type, description)
        VALUES (p_user_id, p_amount, p_type, p_description);
      SELECT balance INTO v_new_balance FROM credits WHERE user_id = p_user_id;
      RETURN COALESCE(v_new_balance, p_amount);
    END; $$;
  `);

  // D6 — deduct_credits (legacy helper — targets profiles.credits)
  await run('D6: deduct_credits', `
    CREATE OR REPLACE FUNCTION public.deduct_credits(
      p_user_id uuid,
      p_amount  int
    ) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE v_rows int;
    BEGIN
      UPDATE public.profiles SET credits = credits - p_amount
        WHERE id = p_user_id AND credits >= p_amount;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      RETURN v_rows > 0;
    END; $$;
  `);

  // D7 — add_credits (legacy helper — targets profiles.credits)
  await run('D7: add_credits', `
    CREATE OR REPLACE FUNCTION public.add_credits(
      p_user_id uuid,
      p_amount  int
    ) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
      UPDATE public.profiles SET credits = credits + p_amount WHERE id = p_user_id;
    END; $$;
  `);

  // D8 — finalize_render + fail_render_atomic (depends on render_events ✓, events ✓)
  await run('D8: finalize_render', `
    CREATE OR REPLACE FUNCTION finalize_render(
      p_render_id        UUID,
      p_user_id          UUID,
      p_video_url        TEXT,
      p_credits_required INTEGER
    ) RETURNS TABLE(ok BOOLEAN, reason TEXT)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_owner UUID; v_status TEXT; v_already_paid INTEGER; v_balance INTEGER;
    BEGIN
      SELECT user_id, status, credits_used INTO v_owner, v_status, v_already_paid
        FROM renders WHERE id = p_render_id FOR UPDATE;
      IF v_owner IS NULL        THEN ok:=FALSE; reason:='render_not_found'; RETURN NEXT; RETURN; END IF;
      IF v_owner <> p_user_id   THEN ok:=FALSE; reason:='forbidden';        RETURN NEXT; RETURN; END IF;
      IF v_status NOT IN ('rendering','complete') THEN
        ok:=FALSE; reason:=format('invalid_state:%s', v_status); RETURN NEXT; RETURN;
      END IF;
      IF v_already_paid IS NULL OR v_already_paid = 0 THEN
        SELECT balance INTO v_balance FROM credits WHERE user_id=p_user_id FOR UPDATE;
        IF COALESCE(v_balance,0) < p_credits_required THEN
          ok:=FALSE; reason:='insufficient_credits_at_finalize'; RETURN NEXT; RETURN;
        END IF;
        INSERT INTO credit_transactions (user_id, amount, type, description)
          VALUES (p_user_id, -p_credits_required, 'usage', format('pipeline_render:%s', p_render_id));
      END IF;
      UPDATE renders SET status='complete', video_url=COALESCE(p_video_url,video_url),
        credits_used=p_credits_required, completed_at=now(), error_message=NULL, updated_at=now()
        WHERE id=p_render_id;
      INSERT INTO render_events (render_id, event_type, payload)
        VALUES (p_render_id, 'render_finalised',
                jsonb_build_object('video_url',p_video_url,'credits_used',p_credits_required));
      INSERT INTO events (user_id, type, payload)
        VALUES (p_user_id, 'render_completed',
                jsonb_build_object('render_id',p_render_id,'video_url',p_video_url,'credits_used',p_credits_required));
      ok:=TRUE; reason:='ok'; RETURN NEXT;
    END; $$;
  `);

  await run('D8: fail_render_atomic', `
    CREATE OR REPLACE FUNCTION fail_render_atomic(
      p_render_id UUID, p_user_id UUID, p_error_message TEXT, p_stage TEXT DEFAULT NULL
    ) RETURNS TABLE(ok BOOLEAN, reason TEXT)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE v_owner UUID;
    BEGIN
      SELECT user_id INTO v_owner FROM renders WHERE id=p_render_id FOR UPDATE;
      IF v_owner IS NULL      THEN ok:=FALSE; reason:='render_not_found'; RETURN NEXT; RETURN; END IF;
      IF v_owner <> p_user_id THEN ok:=FALSE; reason:='forbidden';        RETURN NEXT; RETURN; END IF;
      UPDATE renders SET status='failed', error_message=p_error_message, updated_at=now() WHERE id=p_render_id;
      INSERT INTO render_events (render_id, event_type, payload)
        VALUES (p_render_id, 'render_failed',
                jsonb_build_object('message',p_error_message,'stage',p_stage));
      INSERT INTO events (user_id, type, payload)
        VALUES (p_user_id, 'render_failed',
                jsonb_build_object('render_id',p_render_id,'message',p_error_message,'stage',p_stage));
      ok:=TRUE; reason:='ok'; RETURN NEXT;
    END; $$;
  `);

  await sql.end();
  results.forEach(r => console.log((r.status === 'OK' ? '✓' : '✗') + ' ' + r.label + (r.err ? '\n  → ' + r.err : '')));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
