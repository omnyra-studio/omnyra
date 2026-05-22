-- Autonomous Company Operating System — long-term memory + roadmap + competitor signals.
--
-- These three tables are the COMPANY-LEVEL brain that sits above the
-- per-user / per-template scoring layers. The daily strategy engine
-- writes insights into company_memory, recomputes roadmap priorities,
-- and reacts to competitor signals.
--
-- Per spec §7 safety governor:
--   - all autonomous actions are LOGGED here
--   - reversible (no deletions; statuses flip)
--   - explainable (source_metrics + reason text)

-- ── 1. company_memory ───────────────────────────────────────────────
-- Long-term store of system-level insights. Append-only; never updated
-- or deleted. The daily strategy engine inserts new rows; obsolete
-- insights are filtered by created_at + confidence_score downstream.

CREATE TABLE IF NOT EXISTS company_memory (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category          TEXT NOT NULL
                      CHECK (category IN ('product','marketing','revenue','ux','growth')),
  insight           TEXT NOT NULL,
  confidence_score  INTEGER NOT NULL DEFAULT 50
                      CHECK (confidence_score BETWEEN 0 AND 100),
  impact_score      INTEGER NOT NULL DEFAULT 50
                      CHECK (impact_score BETWEEN 0 AND 100),
  source_metrics    JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Optional pointer back to the system_insights row that triggered
  -- this memory entry (when the strategy engine promotes a tactical
  -- insight to long-term memory).
  source_insight_id UUID REFERENCES system_insights(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_memory_cat_time
  ON company_memory(category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_memory_impact
  ON company_memory(impact_score DESC, created_at DESC);

ALTER TABLE company_memory ENABLE ROW LEVEL SECURITY;
-- service_role only. No client policy. Surfaced to admins via internal routes.

-- ── 2. roadmap_items ────────────────────────────────────────────────
-- Self-prioritising backlog. The strategy engine assigns impact +
-- effort scores; priority_score is a generated column so it's
-- always consistent with the inputs. Auto-reordering = ORDER BY
-- priority_score DESC.

CREATE TABLE IF NOT EXISTS roadmap_items (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_name    TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'product'
                    CHECK (category IN ('product','marketing','revenue','ux','growth','infra')),
  description     TEXT,
  -- 0–100 each. impact = expected business impact; effort = relative
  -- engineering effort (higher = harder).
  impact_score    INTEGER NOT NULL DEFAULT 50
                    CHECK (impact_score BETWEEN 0 AND 100),
  effort_score    INTEGER NOT NULL DEFAULT 50
                    CHECK (effort_score BETWEEN 0 AND 100),
  -- Generated stored column matching the spec's exact formula.
  priority_score  NUMERIC(6,2) GENERATED ALWAYS AS
                    (impact_score::numeric * 0.7 - effort_score::numeric * 0.3)
                    STORED,
  status          TEXT NOT NULL DEFAULT 'planned'
                    CHECK (status IN ('planned','building','shipped','archived')),
  -- Why the engine surfaced this item (text + structured metric refs).
  rationale       TEXT,
  source_metrics  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roadmap_priority
  ON roadmap_items(priority_score DESC)
  WHERE status IN ('planned','building');

CREATE OR REPLACE FUNCTION trg_roadmap_touch_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS roadmap_touch_updated ON roadmap_items;
CREATE TRIGGER roadmap_touch_updated
  BEFORE UPDATE ON roadmap_items
  FOR EACH ROW EXECUTE FUNCTION trg_roadmap_touch_updated();

ALTER TABLE roadmap_items ENABLE ROW LEVEL SECURITY;
-- service_role only.

-- ── 3. competitor_signals ───────────────────────────────────────────
-- Manual + future-monitored intelligence. Insert-only audit log of
-- observed competitor moves. The strategy engine reads recent rows
-- and writes a corresponding insight into company_memory when it
-- detects an impactful signal.

CREATE TABLE IF NOT EXISTS competitor_signals (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_name   TEXT NOT NULL,
  -- "feature" | "pricing" | "messaging" | "funding" | "outage" | …
  signal_type       TEXT NOT NULL,
  feature_changes   JSONB,
  pricing_changes   JSONB,
  market_signals    JSONB,
  notes             TEXT,
  source            TEXT,  -- "manual" | "rss" | "scrape:<vendor>" | …
  detected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitor_signals_time
  ON competitor_signals(detected_at DESC);

ALTER TABLE competitor_signals ENABLE ROW LEVEL SECURITY;
-- service_role only.

-- ── 4. marketing_assets ─────────────────────────────────────────────
-- Output of the marketing asset generator. Append-only catalogue;
-- distribution stays human-gated per spec §7 ("no automatic spam").

CREATE TABLE IF NOT EXISTS marketing_assets (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- "tiktok_script" | "ad_copy" | "headline" | "ugc_concept" | "email_subject"
  asset_type      TEXT NOT NULL,
  -- The template / hook / pattern the asset is derived from.
  source_template TEXT,
  source_metrics  JSONB NOT NULL DEFAULT '{}'::jsonb,
  content         TEXT NOT NULL,
  -- 0..100 confidence that this asset is worth using (proxy from the
  -- source template's score).
  confidence_score INTEGER NOT NULL DEFAULT 50
                    CHECK (confidence_score BETWEEN 0 AND 100),
  -- "draft" | "approved" | "published" | "rejected"
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','approved','published','rejected')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_assets_type_time
  ON marketing_assets(asset_type, created_at DESC);

ALTER TABLE marketing_assets ENABLE ROW LEVEL SECURITY;
-- service_role only.
