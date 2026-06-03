// Post-Generation Quality Scorer
// Evaluates a completed generation job against minimum quality thresholds.
// Runs AFTER the model returns — before the result is stored or returned to caller.

import { validateAsset, type AssetKind } from "./asset-validator";

export interface QualityScore {
  ok:              boolean;
  score:           number;    // 0–100
  checks: {
    video_reachable:  boolean;
    video_min_size:   boolean;
    mime_correct:     boolean;
    url_integrity:    boolean;
  };
  issues:  string[];
  url:     string;            // signed URL (possibly refreshed)
}

// ── Main scorer ───────────────────────────────────────────────────────────────

export async function scoreGenerationOutput(
  videoUrl:   string,
  kind:       AssetKind = "video",
): Promise<QualityScore> {
  const validation = await validateAsset(videoUrl, kind);

  const checks = {
    url_integrity:   videoUrl.length >= 30 && videoUrl.startsWith("https://"),
    video_reachable: validation.ok || validation.error_class !== "FETCH_FAILED",
    video_min_size:  validation.ok || validation.error_class !== "TRUNCATION_ERROR",
    mime_correct:    validation.ok || validation.error_class !== "MIME_MISMATCH",
  };

  const issues: string[] = [];

  if (!checks.url_integrity)    issues.push("URL integrity failure — too short or missing https");
  if (!checks.video_reachable)  issues.push(`Video unreachable: ${validation.error}`);
  if (!checks.video_min_size)   issues.push(`Output below minimum size: ${validation.error}`);
  if (!checks.mime_correct)     issues.push(`MIME mismatch: ${validation.error}`);

  // Weighted score (each check carries equal weight in quality gate)
  const passedCount = Object.values(checks).filter(Boolean).length;
  const score = Math.round((passedCount / 4) * 100);

  const ok = validation.ok;

  console.info("[quality-scorer]", {
    ok,
    score,
    url: validation.url.substring(0, 80),
    issues: issues.length > 0 ? issues : "none",
  });

  return { ok, score, checks, issues, url: validation.url };
}
