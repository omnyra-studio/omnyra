/**
 * Viral Optimizer — post-compile pass that scores a CinematicPlan for retention
 * quality and produces rewrite instructions for weak scenes.
 *
 * Pipeline position: Director → Scene Compiler → [Viral Optimizer] → Render
 *
 * Scores 0–100. Threshold < 60 triggers a rewrite recommendation.
 * All output is INTERNAL — never surfaced to the user.
 */

import type { CinematicPlan, RetentionPoint } from "@/lib/services/ai-director";

export interface ViralAnalysis {
  score:           number;   // 0–100
  grade:           'S' | 'A' | 'B' | 'C' | 'F';
  weakPoints:      string[];
  strengths:       string[];
  compilerHints:   string;   // injected into Scene Compiler context
  shouldRewrite:   boolean;
}

// ── Scoring sub-components ─────────────────────────────────────────────────────

/** Hook quality: visual contradiction and emotional tension score highest */
function scoreHook(plan: CinematicPlan): number {
  const hookScores: Record<string, number> = {
    'visual contradiction': 100,
    'emotional tension':    90,
    'unexpected action':    80,
    'curiosity gap':        85,
  };
  return hookScores[plan.hook_type] ?? 60;
}

/** Retention curve quality: punish flat segments > 12s */
function scoreRetentionCurve(curve: RetentionPoint[]): number {
  if (!curve || curve.length < 2) return 50;

  let score       = 100;
  let flatSeconds = 0;

  for (let i = 1; i < curve.length; i++) {
    const delta = Math.abs(curve[i].intensity - curve[i - 1].intensity);
    const timeDelta = (curve[i].time - curve[i - 1].time);

    if (delta < 0.08) {
      flatSeconds += timeDelta;
      if (flatSeconds > 12) score -= 15;  // flat segment penalty
    } else {
      flatSeconds = 0;
    }

    // Drop in first 5 seconds below 0.5 = bad hook
    if (curve[i].time <= 5 && curve[i].intensity < 0.5) score -= 20;
  }

  // Opening intensity should be ≥ 0.8
  if (curve[0]?.intensity < 0.8) score -= 10;

  return Math.max(0, Math.min(100, score));
}

/** Emotional arc quality: must have at least 3 stages, no repeated states */
function scoreEmotionalArc(arc: string[]): number {
  if (!arc || arc.length < 2) return 40;
  const unique = new Set(arc.map(e => e.toLowerCase().trim()));
  if (unique.size < arc.length * 0.7) return 50; // too many repeated emotions
  if (arc.length >= 3) return 90;
  return 70;
}

/** Shot diversity: no two consecutive shots should have the same distance */
function scoreShotDiversity(plan: CinematicPlan): number {
  const shots = plan.shot_plan ?? [];
  if (shots.length < 2) return 70;
  let sameInRow = 0;
  for (let i = 1; i < shots.length; i++) {
    if (shots[i].shot_type === shots[i - 1].shot_type) sameInRow++;
  }
  return Math.max(40, 100 - sameInRow * 20);
}

// ── Main analysis ──────────────────────────────────────────────────────────────

export function analyzeViralPotential(plan: CinematicPlan): ViralAnalysis {
  const hookScore      = scoreHook(plan);
  const retentionScore = scoreRetentionCurve(plan.retention_curve ?? []);
  const arcScore       = scoreEmotionalArc(plan.emotional_arc ?? []);
  const diversityScore = scoreShotDiversity(plan);

  // Weighted composite: hook = 35%, retention = 30%, arc = 20%, diversity = 15%
  const score = Math.round(
    hookScore * 0.35 +
    retentionScore * 0.30 +
    arcScore * 0.20 +
    diversityScore * 0.15,
  );

  const grade: ViralAnalysis['grade'] =
    score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'F';

  const weakPoints: string[] = [];
  const strengths: string[]  = [];

  if (hookScore < 75)       weakPoints.push("Weak hook — consider visual contradiction or curiosity gap instead");
  else                      strengths.push(`Strong ${plan.hook_type} hook`);

  if (retentionScore < 70)  weakPoints.push("Flat retention curve — add visual change every 8–12 seconds");
  else                      strengths.push("Good retention pacing");

  if (arcScore < 60)        weakPoints.push("Emotional arc too flat — needs at least 3 distinct emotional states");
  else                      strengths.push(`Clear arc: ${(plan.emotional_arc ?? []).join(" → ")}`);

  if (diversityScore < 70)  weakPoints.push("Consecutive shots too similar — alternate wide/close more aggressively");
  else                      strengths.push("Good shot diversity");

  // Build hints for the Scene Compiler
  const hints = [
    weakPoints.length > 0 ? `VIRAL OPTIMIZER NOTES (apply to scenes):\n${weakPoints.map(w => `- ${w}`).join("\n")}` : "",
    `Viral score: ${score}/100 (${grade})`,
    score < 60 ? "REWRITE PRIORITY: increase hook tension, shorten flat visual segments, diversify shot distances" : "",
  ].filter(Boolean).join("\n");

  console.log(`[VIRAL_OPT] score=${score} grade=${grade} hook=${hookScore} retention=${retentionScore} arc=${arcScore} diversity=${diversityScore}`);

  return {
    score,
    grade,
    weakPoints,
    strengths,
    compilerHints: hints,
    shouldRewrite: score < 60,
  };
}

/** Build the compiler hint block to prepend to Scene Compiler context */
export function buildViralCompilerHints(analysis: ViralAnalysis): string {
  if (!analysis.compilerHints) return '';
  return `\n=== VIRAL OPTIMIZER (apply to scene generation) ===\n${analysis.compilerHints}\n=== END VIRAL OPTIMIZER ===\n`;
}

/** Quick pass to check if an opening prompt creates enough tension */
export function scorePromptHookTension(prompt: string): number {
  const TENSION_WORDS = /\b(silence|stillness|breath|hesit|pause|stare|tremble|grip|fear|alone|dark|waits|stands)\b/i;
  const VISUAL_WORDS  = /\b(extreme close-up|close-up|tight|push.in|slow)\b/i;
  const ACTION_WORDS  = /\b(run|chase|fall|break|crash|confront|reveal|shatter)\b/i;

  let score = 50;
  if (TENSION_WORDS.test(prompt))  score += 25;
  if (VISUAL_WORDS.test(prompt))   score += 15;
  if (ACTION_WORDS.test(prompt))   score += 10;
  return Math.min(100, score);
}
