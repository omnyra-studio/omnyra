/**
 * POST /api/observability/calibrate
 *
 * Read-only analytics + calibration feedback for each completed generation job.
 * Does NOT modify execution logic, does NOT write to DB, does NOT affect runtime.
 *
 * Call this after every successful generate-cinematic-sequence response.
 * Pass the job telemetry payload; receive a calibration signal for tuning.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface SceneTelemetry {
  scene_index:       number;
  scene_text?:       string;
  scene_type:        string;
  motion_intensity:  number;  // 0.0–1.0 as computed by computeMotionIntensity()
  provider_used:     "kling" | "smart_motion";
  render_time_ms:    number;
  success:           boolean;
  skipped_latency?:  boolean;
}

interface JobTelemetry {
  job_id?:                  string;
  total_runtime_ms:         number;
  scene_count:              number;
  skipped_due_to_latency:   number;
  provider_mix: {
    kling:        number;
    smart_motion: number;
  };
  sla_compliant:            boolean;
  scenes:                   SceneTelemetry[];
}

interface CalibrationResult {
  status:                  "healthy" | "degraded" | "unstable";
  motion_model_accuracy:   "high" | "medium" | "low";
  provider_routing_health: "stable" | "drifting" | "broken";
  sla_health:              "safe" | "at_risk" | "violating";
  cost_efficiency:         "optimal" | "suboptimal" | "wasteful";
  key_issues:              string[];
  recommendations:         string[];
}

// ── Calibration thresholds ────────────────────────────────────────────────────

const SLA_TOTAL_MS    = 240_000;
const SLA_AT_RISK_PCT = 0.85;        // 85% of SLA → at_risk
const LATENCY_SKIP_RATE_THRESHOLD = 0.10; // 10% skipped → unstable

// Motion routing correctness:
// High-motion (≥0.6) scenes on smart_motion → routing error
// Low-motion (<0.35) scenes on Kling → cost waste
const HIGH_MOTION_THRESHOLD = 0.60;
const LOW_MOTION_THRESHOLD  = 0.35;

// Expected Kling ratio for cinematic content: 40–90%
const KLING_MIN_EXPECTED = 0.40;
const KLING_MAX_EXPECTED = 0.90;

// ── Calibration logic ─────────────────────────────────────────────────────────

function calibrate(job: JobTelemetry): CalibrationResult {
  const issues: string[] = [];
  const recs:   string[] = [];
  const scenes  = job.scenes ?? [];
  const n       = scenes.length || 1;

  // ── 1. Motion model accuracy ────────────────────────────────────────────────
  const misroutedHighMotion = scenes.filter(
    s => s.success && s.motion_intensity >= HIGH_MOTION_THRESHOLD && s.provider_used === "smart_motion",
  );
  const misroutedLowMotion = scenes.filter(
    s => s.success && s.motion_intensity < LOW_MOTION_THRESHOLD && s.provider_used === "kling",
  );

  const motionErrorRate = (misroutedHighMotion.length + misroutedLowMotion.length) / n;
  let motionAccuracy: CalibrationResult["motion_model_accuracy"];
  if (motionErrorRate < 0.05)      motionAccuracy = "high";
  else if (motionErrorRate < 0.20) motionAccuracy = "medium";
  else                             motionAccuracy = "low";

  if (misroutedHighMotion.length > 0) {
    issues.push(`${misroutedHighMotion.length} high-motion scene(s) routed to smart_motion — intensity threshold may be too low`);
    recs.push("Raise HIGH_MOTION_THRESHOLD or review scene_type base scores for affected types");
  }
  if (misroutedLowMotion.length > 0) {
    issues.push(`${misroutedLowMotion.length} low-motion scene(s) routed to Kling — wasted premium allocation`);
    recs.push("Lower LOW_MOTION_THRESHOLD or reduce base scores for static scene types");
  }

  // ── 2. Provider routing health ──────────────────────────────────────────────
  const klingRatio = job.provider_mix.kling / Math.max(1, job.scene_count);
  let routingHealth: CalibrationResult["provider_routing_health"] = "stable";

  if (klingRatio < KLING_MIN_EXPECTED) {
    routingHealth = "drifting";
    issues.push(`Kling underutilized: ${Math.round(klingRatio * 100)}% of scenes (expected ≥ ${KLING_MIN_EXPECTED * 100}%)`);
    recs.push("Check if motion_intensity scores are systematically low — base scores may need upward adjustment");
  } else if (klingRatio > KLING_MAX_EXPECTED) {
    routingHealth = "drifting";
    issues.push(`Kling over-allocated: ${Math.round(klingRatio * 100)}% of scenes — cost pressure risk`);
    recs.push("Review motion budget cap (maxPremium) — may need to lower for high scene counts");
  }

  // Failed Kling scenes with successful SM scenes in same job → possible Kling degradation
  const klingFailures = scenes.filter(s => s.provider_used === "kling" && !s.success);
  if (klingFailures.length > 1) {
    routingHealth = "broken";
    issues.push(`${klingFailures.length} Kling scenes failed — possible provider outage or API key issue`);
    recs.push("Temporarily increase smart_motion allocation via BASE_SCORES adjustment");
  }

  // ── 3. SLA health ───────────────────────────────────────────────────────────
  const slaRatio        = job.total_runtime_ms / SLA_TOTAL_MS;
  const skipRate        = job.skipped_due_to_latency / Math.max(1, job.scene_count);
  let slaHealth: CalibrationResult["sla_health"] = "safe";

  if (!job.sla_compliant || skipRate > LATENCY_SKIP_RATE_THRESHOLD) {
    slaHealth = "violating";
    issues.push(`SLA violated: runtime=${Math.round(job.total_runtime_ms / 1000)}s, skipped=${job.skipped_due_to_latency} scenes`);
    recs.push("Reduce scene count limit or lower maxPremium Kling allocation for large jobs");
  } else if (slaRatio > SLA_AT_RISK_PCT) {
    slaHealth = "at_risk";
    issues.push(`Runtime at ${Math.round(slaRatio * 100)}% of SLA budget — within 15% of ceiling`);
    recs.push("Enable SLA escalation at lower threshold (currently 80%) to provide more headroom");
  }

  // Long-running Kling scenes (>90s) are a latency risk signal
  const slowKling = scenes.filter(s => s.provider_used === "kling" && s.render_time_ms > 90_000);
  if (slowKling.length > 0) {
    issues.push(`${slowKling.length} Kling scene(s) exceeded 90s render time — provider queue pressure`);
    recs.push("Reduce Kling scene count or pre-qualify provider availability before large jobs");
  }

  // ── 4. Cost efficiency ──────────────────────────────────────────────────────
  const costWasteScenes = misroutedLowMotion.length;
  const retryOverhead   = scenes.filter(s => s.render_time_ms > 120_000).length; // proxy for retries
  let costEfficiency: CalibrationResult["cost_efficiency"] = "optimal";

  if (costWasteScenes > 0 || retryOverhead > 0) {
    const wasteRate = (costWasteScenes + retryOverhead) / n;
    costEfficiency  = wasteRate > 0.20 ? "wasteful" : "suboptimal";
    if (retryOverhead > 0) {
      issues.push(`${retryOverhead} scene(s) had extended render times (>120s) — retry overhead suspected`);
      recs.push("Reduce per-clip retry budget to 45s to limit retry-induced cost bloat");
    }
  }

  // ── 5. Overall status ───────────────────────────────────────────────────────
  let status: CalibrationResult["status"] = "healthy";
  if (
    slaHealth === "violating" ||
    routingHealth === "broken" ||
    motionAccuracy === "low"
  ) {
    status = "unstable";
  } else if (
    slaHealth === "at_risk" ||
    routingHealth === "drifting" ||
    motionAccuracy === "medium" ||
    costEfficiency !== "optimal"
  ) {
    status = "degraded";
  }

  return {
    status,
    motion_model_accuracy:   motionAccuracy,
    provider_routing_health: routingHealth,
    sla_health:              slaHealth,
    cost_efficiency:         costEfficiency,
    key_issues:              issues,
    recommendations:         recs,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  let body: JobTelemetry;
  try {
    body = await req.json() as JobTelemetry;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (
    typeof body.total_runtime_ms !== "number" ||
    typeof body.scene_count      !== "number" ||
    !Array.isArray(body.scenes)
  ) {
    return Response.json({ error: "missing_required_fields" }, { status: 400 });
  }

  const result = calibrate(body);
  return Response.json(result);
}
