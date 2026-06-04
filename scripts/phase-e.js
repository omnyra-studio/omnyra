const postgres = require('postgres');
const sql = postgres('postgresql://postgres.wtzqjdlcvtjunujocbst:spJ4tLOMV9TO2fsN@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres');
const results = [];

async function run(label, query) {
  try { await sql.unsafe(query); results.push({ label, status: 'OK' }); }
  catch (e) { results.push({ label, status: 'FAIL', err: e.message }); }
}

async function main() {

  // E1 — user_revenue_state (references auth.users)
  await run('E1: user_revenue_state', `
    CREATE TABLE IF NOT EXISTS user_revenue_state (
      user_id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      plan_tier               TEXT NOT NULL DEFAULT 'free'
                                CHECK (plan_tier IN ('free','creator','pro','studio')),
      monthly_value_score     INTEGER NOT NULL DEFAULT 0 CHECK (monthly_value_score BETWEEN 0 AND 1000),
      churn_risk_score        INTEGER NOT NULL DEFAULT 0 CHECK (churn_risk_score BETWEEN 0 AND 100),
      upgrade_probability     INTEGER NOT NULL DEFAULT 0 CHECK (upgrade_probability BETWEEN 0 AND 100),
      lifetime_value_estimate INTEGER NOT NULL DEFAULT 0,
      price_sensitivity       TEXT NOT NULL DEFAULT 'medium'
                                CHECK (price_sensitivity IN ('low','medium','high')),
      last_offer_type         TEXT,
      last_offer_at           TIMESTAMPTZ,
      total_spent             NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_credits_used      INTEGER NOT NULL DEFAULT 0,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_urs_churn    ON user_revenue_state(churn_risk_score DESC);
    CREATE INDEX IF NOT EXISTS idx_urs_upgrade  ON user_revenue_state(upgrade_probability DESC) WHERE plan_tier='free';
    ALTER TABLE user_revenue_state ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "urs_owner_read" ON user_revenue_state;
    CREATE POLICY "urs_owner_read" ON user_revenue_state FOR SELECT USING (auth.uid() = user_id);
  `);

  // E2 — updated_at trigger for user_revenue_state
  await run('E2: trg_urs_touch_updated', `
    CREATE OR REPLACE FUNCTION trg_urs_touch_updated()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
    DROP TRIGGER IF EXISTS urs_touch_updated ON user_revenue_state;
    CREATE TRIGGER urs_touch_updated
      BEFORE UPDATE ON user_revenue_state
      FOR EACH ROW EXECUTE FUNCTION trg_urs_touch_updated();
  `);

  // E3 — revenue_events (append-only audit log; self-referencing FK safe in Postgres)
  await run('E3: revenue_events', `
    CREATE TABLE IF NOT EXISTS revenue_events (
      id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      event_type      TEXT NOT NULL,
      action_type     TEXT,
      offer           JSONB,
      source_event_id UUID REFERENCES revenue_events(id) ON DELETE SET NULL,
      context         JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_revenue_events_user_time ON revenue_events(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_revenue_events_type_time ON revenue_events(event_type, created_at DESC);
    ALTER TABLE revenue_events ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "revenue_events_owner_read" ON revenue_events;
    CREATE POLICY "revenue_events_owner_read" ON revenue_events FOR SELECT USING (auth.uid() = user_id);
  `);

  // E4 — offer_log (depends on revenue_events ✓)
  await run('E4: offer_log', `
    CREATE TABLE IF NOT EXISTS offer_log (
      id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      offer_type       TEXT NOT NULL CHECK (offer_type IN ('upgrade','discount','credits','reactivation')),
      revenue_event_id UUID REFERENCES revenue_events(id) ON DELETE SET NULL,
      accepted         BOOLEAN NOT NULL DEFAULT false,
      accepted_at      TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_offer_log_user_time ON offer_log(user_id, created_at DESC);
    ALTER TABLE offer_log ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "offer_log_owner_read" ON offer_log;
    CREATE POLICY "offer_log_owner_read" ON offer_log FOR SELECT USING (auth.uid() = user_id);
  `);

  // E5 — can_show_offer RPC (depends on offer_log ✓, user_revenue_state ✓)
  await run('E5: can_show_offer', `
    CREATE OR REPLACE FUNCTION can_show_offer(
      p_user_id    UUID,
      p_offer_type TEXT DEFAULT NULL
    ) RETURNS TABLE(allowed BOOLEAN, reason TEXT, cooldown_remaining INTEGER)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_last_at       TIMESTAMPTZ;
      v_weekly_count  INTEGER;
      v_monthly_count INTEGER;
      v_churn_risk    INTEGER := 0;
      v_min_hours     INTEGER := 24;
      v_now           TIMESTAMPTZ := now();
    BEGIN
      SELECT churn_risk_score INTO v_churn_risk FROM user_revenue_state WHERE user_id = p_user_id;
      IF COALESCE(v_churn_risk,0) >= 70 THEN v_min_hours := 12; END IF;

      SELECT MAX(created_at) INTO v_last_at FROM offer_log WHERE user_id = p_user_id;
      IF v_last_at IS NOT NULL AND v_now - v_last_at < (v_min_hours||' hours')::interval THEN
        allowed := FALSE; reason := format('cooldown_%shr', v_min_hours);
        cooldown_remaining := GREATEST(0, v_min_hours*3600 - EXTRACT(EPOCH FROM (v_now-v_last_at))::integer);
        RETURN NEXT; RETURN;
      END IF;

      SELECT COUNT(*) INTO v_weekly_count FROM offer_log WHERE user_id=p_user_id AND created_at >= v_now - INTERVAL '7 days';
      IF v_weekly_count >= 3 THEN
        allowed:=FALSE; reason:=format('weekly_cap_%s',v_weekly_count); cooldown_remaining:=NULL; RETURN NEXT; RETURN;
      END IF;

      SELECT COUNT(*) INTO v_monthly_count FROM offer_log WHERE user_id=p_user_id AND created_at >= v_now - INTERVAL '30 days';
      IF v_monthly_count >= 8 THEN
        allowed:=FALSE; reason:=format('monthly_cap_%s',v_monthly_count); cooldown_remaining:=NULL; RETURN NEXT; RETURN;
      END IF;

      allowed:=TRUE; reason:=CASE WHEN p_offer_type IS NULL THEN 'ok' ELSE format('ok:%s',p_offer_type) END;
      cooldown_remaining:=0; RETURN NEXT;
    END; $$;
  `);

  // E6 — log_offer_shown RPC
  await run('E6: log_offer_shown', `
    CREATE OR REPLACE FUNCTION log_offer_shown(
      p_user_id          UUID,
      p_offer_type       TEXT,
      p_revenue_event_id UUID DEFAULT NULL
    ) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE v_id UUID;
    BEGIN
      INSERT INTO offer_log (user_id, offer_type, revenue_event_id)
        VALUES (p_user_id, p_offer_type, p_revenue_event_id)
        RETURNING id INTO v_id;
      RETURN v_id;
    END; $$;
  `);

  await sql.end();
  results.forEach(r => console.log((r.status === 'OK' ? '✓' : '✗') + ' ' + r.label + (r.err ? '\n  → ' + r.err : '')));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
