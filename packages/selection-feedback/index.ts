// Selection Feedback — Session-Only Preference Biasing
// Adjusts variant ranking within a single session based on what the user selects.
// NO persistent memory. NO cross-session storage. NO user profiling.
// This is lightweight session bias, not a learning system.

import type { PsychologicalStrategy, HookVariant } from "../viral-strategy";

// ── Session preference state ──────────────────────────────────────────────────
// Caller owns this object and passes it between calls within the session.
// Discard it when the session ends.

export interface SessionPreferences {
  selectedStrategies: PsychologicalStrategy[];  // strategies picked so far this session
  scrollHoldBias: number;    // additive offset, -5 to +5
  sharePotentialBias: number;
  messageStrengthBias: number;
}

export function createSessionPreferences(): SessionPreferences {
  return { selectedStrategies: [], scrollHoldBias: 0, sharePotentialBias: 0, messageStrengthBias: 0 };
}

// ── Record a selection within the current session ─────────────────────────────

export function recordSessionSelection(
  prefs: SessionPreferences,
  strategy: PsychologicalStrategy,
): SessionPreferences {
  const selected = [...prefs.selectedStrategies, strategy];

  // Count strategy frequency this session
  const counts = new Map<PsychologicalStrategy, number>();
  for (const s of selected) counts.set(s, (counts.get(s) ?? 0) + 1);

  // Strategies leaning toward high-retention → boost scroll hold
  const retentionStrategies: PsychologicalStrategy[] = ["emotional_confession", "relatable_frustration"];
  // Strategies leaning toward high-virality → boost share potential
  const viralStrategies: PsychologicalStrategy[] = ["shock_reversal", "unexpected_twist"];
  // Strategies leaning toward clarity → boost message strength
  const clarityStrategies: PsychologicalStrategy[] = ["curiosity_gap", "authority_insight"];

  const retentionPicks = retentionStrategies.reduce((n, s) => n + (counts.get(s) ?? 0), 0);
  const viralPicks = viralStrategies.reduce((n, s) => n + (counts.get(s) ?? 0), 0);
  const clarityPicks = clarityStrategies.reduce((n, s) => n + (counts.get(s) ?? 0), 0);

  const clamp = (n: number) => Math.max(-5, Math.min(5, n));

  return {
    selectedStrategies: selected,
    scrollHoldBias: clamp(retentionPicks - viralPicks * 0.5),
    sharePotentialBias: clamp(viralPicks - clarityPicks * 0.5),
    messageStrengthBias: clamp(clarityPicks - retentionPicks * 0.5),
  };
}

// ── Apply session bias to a variant's scores ──────────────────────────────────

export function applySessionBias(variant: HookVariant, prefs: SessionPreferences): HookVariant {
  const clamp100 = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
  const adjusted = {
    ...variant.scores,
    scrollHold: clamp100(variant.scores.scrollHold + prefs.scrollHoldBias),
    sharePotential: clamp100(variant.scores.sharePotential + prefs.sharePotentialBias),
    messageStrength: clamp100(variant.scores.messageStrength + prefs.messageStrengthBias),
  };
  const finalScore = Math.round(
    (adjusted.scrollHold * 0.4) + (adjusted.sharePotential * 0.3) + (adjusted.messageStrength * 0.3),
  );
  return { ...variant, scores: adjusted, finalScore };
}

// ── Rank 6 variants into display positions ────────────────────────────────────

export type DisplayRole = "recommended" | "close_competitor" | "high_risk_reward" | "supporting";

export interface RankedVariant {
  variant: HookVariant;
  displayPosition: number;   // 1–6
  displayRole: DisplayRole;
  isRecommended: boolean;
}

export function rankVariants(
  variants: HookVariant[],
  prefs?: SessionPreferences,
): RankedVariant[] {
  const weighted = prefs
    ? variants.map(v => applySessionBias(v, prefs))
    : variants;

  const byScore = [...weighted].sort((a, b) => b.finalScore - a.finalScore);

  // Position 3 = highest share potential among 3rd–6th (high risk / high reward)
  const rest = byScore.slice(2);
  const highRiskIdx = rest.reduce(
    (best, v, i) => v.scores.sharePotential > rest[best]!.scores.sharePotential ? i : best,
    0,
  );
  const highRisk = rest.splice(highRiskIdx, 1)[0]!;

  const ordered = [byScore[0]!, byScore[1]!, highRisk, ...rest];

  return ordered.map((variant, i) => ({
    variant,
    displayPosition: i + 1,
    displayRole: (i === 0 ? "recommended" : i === 1 ? "close_competitor" : i === 2 ? "high_risk_reward" : "supporting") as DisplayRole,
    isRecommended: i === 0,
  }));
}
