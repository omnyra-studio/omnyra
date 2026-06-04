const postgres = require('postgres');
const sql = postgres('postgresql://postgres.wtzqjdlcvtjunujocbst:spJ4tLOMV9TO2fsN@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres');
const results = [];

async function run(label, query) {
  try { await sql.unsafe(query); results.push({ label, status: 'OK' }); }
  catch (e) { results.push({ label, status: 'FAIL', err: e.message }); }
}

async function main() {

  // G1 — user_profiles_extended (derived table, service_role writes only)
  await run('G1: user_profiles_extended', `
    CREATE TABLE IF NOT EXISTS user_profiles_extended (
      user_id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      dominant_template_type TEXT,
      avg_hook_style         TEXT,
      audience_type          TEXT,
      success_pattern        JSONB NOT NULL DEFAULT '{}'::jsonb,
      preferred_energy_level TEXT,
      conversion_behavior    JSONB NOT NULL DEFAULT '{}'::jsonb,
      churn_risk_score       INTEGER NOT NULL DEFAULT 0,
      recomputed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_user_profiles_extended_churn
      ON user_profiles_extended(churn_risk_score DESC) WHERE churn_risk_score >= 70;
    ALTER TABLE user_profiles_extended ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "user_profiles_extended_owner_read" ON user_profiles_extended;
    CREATE POLICY "user_profiles_extended_owner_read"
      ON user_profiles_extended FOR SELECT USING (auth.uid() = user_id);
  `);

  // G2 — creator_profiles (Director Core conditioning)
  await run('G2: creator_profiles', `
    CREATE TABLE IF NOT EXISTS creator_profiles (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id              UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
      niche                TEXT,
      audience_type        TEXT,
      communication_style  TEXT NOT NULL DEFAULT 'conversational',
      pacing               TEXT NOT NULL DEFAULT 'measured',
      preferred_hooks      TEXT[] NOT NULL DEFAULT '{}',
      preferred_ctas       TEXT[] NOT NULL DEFAULT '{}',
      content_pillars      TEXT[] NOT NULL DEFAULT '{}',
      visual_style         TEXT,
      brand_colors         TEXT[] NOT NULL DEFAULT '{}',
      quality_score        NUMERIC(4,3) NOT NULL DEFAULT 0.5,
      total_videos         INT NOT NULL DEFAULT 0,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_creator_profiles_user_id ON creator_profiles(user_id);
    ALTER TABLE creator_profiles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "creator_profiles_owner_all" ON creator_profiles;
    CREATE POLICY "creator_profiles_owner_all" ON creator_profiles FOR ALL
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  `);

  // G3 — generation_memory (brand brain learning loop)
  await run('G3: generation_memory', `
    CREATE TABLE IF NOT EXISTS generation_memory (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      hook_type        TEXT,
      energy_level     SMALLINT CHECK (energy_level BETWEEN 1 AND 5),
      pacing           TEXT CHECK (pacing IN ('slow','measured','fast')),
      delivery_style   TEXT,
      template         TEXT,
      niche            TEXT,
      platform         TEXT,
      script_snippet   TEXT,
      video_url        TEXT,
      was_published    BOOLEAN NOT NULL DEFAULT false,
      was_edited       BOOLEAN NOT NULL DEFAULT false,
      user_rating      SMALLINT CHECK (user_rating BETWEEN 1 AND 5),
      outcome_recorded BOOLEAN NOT NULL DEFAULT false,
      outcome_at       TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_generation_memory_user_id      ON generation_memory(user_id);
    CREATE INDEX IF NOT EXISTS idx_generation_memory_user_created ON generation_memory(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_generation_memory_outcome      ON generation_memory(user_id, outcome_recorded, was_published);
    ALTER TABLE generation_memory ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "generation_memory_owner_all" ON generation_memory;
    CREATE POLICY "generation_memory_owner_all" ON generation_memory FOR ALL
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  `);

  // G4 — preference_weights (brand brain EMA weights)
  await run('G4: preference_weights', `
    CREATE TABLE IF NOT EXISTS preference_weights (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
      hook_weights     JSONB NOT NULL DEFAULT '{}',
      energy_weights   JSONB NOT NULL DEFAULT '{}',
      pacing_weights   JSONB NOT NULL DEFAULT '{}',
      template_weights JSONB NOT NULL DEFAULT '{}',
      top_niches       TEXT[] NOT NULL DEFAULT '{}',
      learning_rate    NUMERIC(4,3) NOT NULL DEFAULT 0.2,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_preference_weights_user_id ON preference_weights(user_id);
    ALTER TABLE preference_weights ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "preference_weights_owner_all" ON preference_weights;
    CREATE POLICY "preference_weights_owner_all" ON preference_weights FOR ALL
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  `);

  // G5 — api_rate_limits (references profiles, service_role only)
  await run('G5: api_rate_limits', `
    CREATE TABLE IF NOT EXISTS api_rate_limits (
      id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id       UUID REFERENCES profiles(id),
      endpoint      TEXT NOT NULL,
      request_count INTEGER DEFAULT 1,
      window_start  TIMESTAMPTZ DEFAULT now(),
      created_at    TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_rate_limits_user_endpoint ON api_rate_limits(user_id, endpoint, window_start);
    ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "rate_limits_no_public_access" ON api_rate_limits;
    CREATE POLICY "rate_limits_no_public_access" ON api_rate_limits FOR ALL
      USING (false) WITH CHECK (false);
  `);

  // G6 — usage_logs
  await run('G6: usage_logs', `
    CREATE TABLE IF NOT EXISTS usage_logs (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      action_type          TEXT NOT NULL,
      estimated_cost_usd   FLOAT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS usage_logs_user_id_idx   ON usage_logs(user_id);
    CREATE INDEX IF NOT EXISTS usage_logs_created_at_idx ON usage_logs(created_at DESC);
    ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can read own usage" ON usage_logs;
    CREATE POLICY "Users can read own usage" ON usage_logs FOR SELECT USING (auth.uid() = user_id);
  `);

  // G7 — trend_cache (cron-written, read-only for authenticated)
  await run('G7: trend_cache', `
    CREATE TABLE IF NOT EXISTS trend_cache (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      niche      TEXT NOT NULL,
      platform   TEXT NOT NULL,
      data       JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT now(),
      UNIQUE (niche, platform)
    );
    CREATE INDEX IF NOT EXISTS trend_cache_niche_platform ON trend_cache(niche, platform);
    ALTER TABLE trend_cache ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "trend_cache_read" ON trend_cache;
    CREATE POLICY "trend_cache_read" ON trend_cache FOR SELECT USING (auth.uid() IS NOT NULL);
  `);

  // G8 — rate_limit_state (from 20260603_rate_limits.sql — FK fixed to profiles not users)
  await run('G8: rate_limit_state', `
    CREATE TABLE IF NOT EXISTS rate_limit_state (
      user_id               UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
      daily_request_count   INT  NOT NULL DEFAULT 0,
      daily_window_start    TIMESTAMP NOT NULL DEFAULT now(),
      cooldown_until        TIMESTAMP,
      video_cooldown_until  TIMESTAMP,
      concurrent_video_jobs INT  NOT NULL DEFAULT 0,
      hard_flag_count       INT  NOT NULL DEFAULT 0,
      updated_at            TIMESTAMP NOT NULL DEFAULT now()
    );
    ALTER TABLE rate_limit_state ENABLE ROW LEVEL SECURITY;
  `);

  await sql.end();
  results.forEach(r => console.log((r.status === 'OK' ? '✓' : '✗') + ' ' + r.label + (r.err ? '\n  → ' + r.err : '')));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
