-- Self-Evolving Product Intelligence System.
--
-- Five new tables that turn Omnyra into a self-modifying product:
--   1. product_behavior_graph   — every UI node + its metrics
--   2. feature_lifecycle        — emerging → active → dominant → decaying → deprecated
--   3. generated_prds           — auto-generated product requirement docs
--   4. feature_flags            — safe rollout control plane
--   5. ui_flow_proposals        — proposed flow simplifications, gated by flags
--
-- Per spec §9 governor:
--   - all state transitions logged
--   - all proposals reversible (status flow, no deletes)
--   - all flag rollouts canary-controlled

-- ── 1. product_behavior_graph ────────────────────────────────────────
-- Every meaningful UI node — feature, screen, flow, button — gets a
-- row. `connected_nodes` stores the directed graph edges as a JSON
-- array of { to: node_id, weight: int } — populated by counting
-- consecutive events per session.
--
-- The graph is APPENDED-to on definition (CREATE NODE) but each row is
-- UPDATED on metric recompute (the weekly cron upserts).

CREATE TABLE IF NOT EXISTS product_behavior_graph (
  node_id            TEXT PRIMARY KEY,
  node_type          TEXT NOT NULL
                       CHECK (node_type IN ('feature','screen','flow','button')),
  display_name       TEXT,
  -- Distinct users * sessions that hit this node in the last window.
  usage_count        INTEGER NOT NULL DEFAULT 0,
  -- Fraction (0..1) of sessions that abandon AT this node.
  dropoff_rate       NUMERIC(5,4) NOT NULL DEFAULT 0,
  -- 0..100 — how strongly this node correlates with downstream conversion.
  conversion_impact  NUMERIC(6,2) NOT NULL DEFAULT 0,
  -- Average seconds spent on this node per session.
  avg_time_spent     NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- Outgoing edges: [{ to: 'next_node_id', weight: 42 }, …]
  connected_nodes    JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 0..100 composite — high usage + low dropoff + positive conversion.
  health_score       NUMERIC(6,2) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pbg_type_health
  ON product_behavior_graph(node_type, health_score DESC);

CREATE OR REPLACE FUNCTION trg_pbg_touch_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pbg_touch_updated ON product_behavior_graph;
CREATE TRIGGER pbg_touch_updated
  BEFORE UPDATE ON product_behavior_graph
  FOR EACH ROW EXECUTE FUNCTION trg_pbg_touch_updated();

ALTER TABLE product_behavior_graph ENABLE ROW LEVEL SECURITY;
-- service_role only.

-- ── 2. feature_lifecycle ─────────────────────────────────────────────
-- Tracks the lifecycle stage of each feature node. Auto-managed by the
-- weekly product-intelligence cron based on usage trends. Separate
-- table (rather than column on product_behavior_graph) so we keep a
-- history of state transitions for the safety governor.

CREATE TABLE IF NOT EXISTS feature_lifecycle (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id           TEXT NOT NULL REFERENCES product_behavior_graph(node_id) ON DELETE CASCADE,
  stage             TEXT NOT NULL
                      CHECK (stage IN ('emerging','active','dominant','decaying','deprecated')),
  reason            TEXT,
  source_metrics    JSONB NOT NULL DEFAULT '{}'::jsonb,
  entered_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_lifecycle_node_time
  ON feature_lifecycle(node_id, entered_at DESC);

-- Current stage per feature = newest row per node_id.
CREATE OR REPLACE VIEW feature_current_stage AS
SELECT DISTINCT ON (node_id)
  node_id, stage, reason, source_metrics, entered_at
FROM feature_lifecycle
ORDER BY node_id, entered_at DESC;

ALTER TABLE feature_lifecycle ENABLE ROW LEVEL SECURITY;
-- service_role only.

-- ── 3. generated_prds ────────────────────────────────────────────────
-- PRDs auto-generated from real usage data. Status flow:
--   draft → approved → shipped   (or → rejected)

CREATE TABLE IF NOT EXISTS generated_prds (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title             TEXT NOT NULL,
  problem_statement TEXT NOT NULL,
  user_evidence     JSONB NOT NULL DEFAULT '{}'::jsonb,
  proposed_solution TEXT NOT NULL,
  impacted_metrics  JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 0..100 derived from confidence + expected impact.
  priority_score    NUMERIC(6,2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','approved','shipped','rejected')),
  source_signal     TEXT,  -- e.g. "high_regenerate_rate" / "brief_stage_abandonment"
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generated_prds_status_priority
  ON generated_prds(status, priority_score DESC);

CREATE OR REPLACE FUNCTION trg_prds_touch_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS prds_touch_updated ON generated_prds;
CREATE TRIGGER prds_touch_updated
  BEFORE UPDATE ON generated_prds
  FOR EACH ROW EXECUTE FUNCTION trg_prds_touch_updated();

ALTER TABLE generated_prds ENABLE ROW LEVEL SECURITY;
-- service_role only.

-- ── 4. feature_flags ─────────────────────────────────────────────────
-- Server-controlled rollout. Every autonomous UI change passes through
-- a flag with a canary percent. The safety governor (spec §9) requires
-- this — no global rollouts without a metric validation window.

CREATE TABLE IF NOT EXISTS feature_flags (
  key                TEXT PRIMARY KEY,
  description        TEXT,
  enabled            BOOLEAN NOT NULL DEFAULT false,
  -- 0..100. The user_id is hashed into this bucket for sticky exposure.
  rollout_percent    INTEGER NOT NULL DEFAULT 0
                       CHECK (rollout_percent BETWEEN 0 AND 100),
  -- Optional metric the system should monitor while this flag is on;
  -- below `min_metric_value` for `min_validation_hours`, the flag
  -- auto-disables.
  guard_metric       TEXT,
  guard_floor        NUMERIC,
  guard_window_hours INTEGER NOT NULL DEFAULT 24,
  -- When non-null, this is the PRD that justified the flag.
  source_prd_id      UUID REFERENCES generated_prds(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION trg_flags_touch_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS flags_touch_updated ON feature_flags;
CREATE TRIGGER flags_touch_updated
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION trg_flags_touch_updated();

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feature_flags_public_read" ON feature_flags;
CREATE POLICY "feature_flags_public_read"
  ON feature_flags FOR SELECT
  USING (true);
-- Public read so the client can resolve flag state without a round-trip
-- to a server-only endpoint. Writes are service_role only.

-- ── 5. ui_flow_proposals ─────────────────────────────────────────────
-- Concrete flow-simplification suggestions (remove step / prefill /
-- merge). Each proposal is tied to a feature_flag — the proposal is
-- "deployed" only when the flag is enabled.

CREATE TABLE IF NOT EXISTS ui_flow_proposals (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id         TEXT NOT NULL,
  -- 'remove_step' | 'prefill_step' | 'merge_steps' | 'reorder'
  proposal_type   TEXT NOT NULL,
  -- Original path: ['step_a','step_b','step_c']
  current_path    JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Proposed path: ['step_a','step_c']
  proposed_path   JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_impact NUMERIC(6,2) NOT NULL DEFAULT 0,
  source_metrics  JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Required: every proposal must reference the flag controlling its rollout.
  flag_key        TEXT REFERENCES feature_flags(key) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'proposed'
                    CHECK (status IN ('proposed','in_canary','rolled_out','rolled_back','rejected')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ui_flow_proposals_status
  ON ui_flow_proposals(status, created_at DESC);

ALTER TABLE ui_flow_proposals ENABLE ROW LEVEL SECURITY;
-- service_role only.

-- ── 6. Feature-flag evaluator (deterministic bucket assignment) ─────
-- Given (flag_key, user_id), returns whether the flag is on for that
-- user. The user_id is hashed into 0..99 and compared with the flag's
-- rollout_percent. Deterministic → sticky exposure across sessions.

CREATE OR REPLACE FUNCTION evaluate_feature_flag(
  p_key     TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_pct     INTEGER;
  v_bucket  INTEGER;
BEGIN
  SELECT enabled, rollout_percent INTO v_enabled, v_pct
    FROM feature_flags WHERE key = p_key;
  IF v_enabled IS NULL OR v_enabled = false THEN
    RETURN false;
  END IF;
  IF v_pct >= 100 THEN RETURN true; END IF;
  IF v_pct <= 0 THEN RETURN false; END IF;

  -- Stable hash: first 2 bytes of md5(user_id::text || key) → 0..65535
  -- → mod 100. Uniform across users.
  v_bucket := ('x' || substr(md5(p_user_id::text || ':' || p_key), 1, 4))::bit(16)::int % 100;
  RETURN v_bucket < v_pct;
END;
$$;
