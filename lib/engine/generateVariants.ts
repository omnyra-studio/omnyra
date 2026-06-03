// Omnyra Generation Engine — production adapter
// Wraps packages/viral-strategy with the canonical GenerateInput/GenerateOutput
// interface. Adds trend fingerprint influence without altering core scoring logic.
// No external API calls. Deterministic. Always returns exactly 6 variants.

import {
  generateViralStrategy,
  type HookVariant,
} from "@/packages/viral-strategy";
import type { NicheCategory } from "@/packages/distribution-intelligence";
import type { SessionPreferences } from "@/packages/selection-feedback";
import type { TrendFingerprint } from "@/lib/trends/trendAggregator";

// ── IO Types ──────────────────────────────────────────────────────────────────

export interface BrandMemory {
  tone?: string;
  style?: string;
  doNotUse?: string[];
}

export interface GenerateInput {
  idea: string;
  niche: string;
  platform: "tiktok" | "instagram" | "youtube";
  brandMemory?: BrandMemory;
  trendFingerprint?: TrendFingerprint;
  sessionPreferences?: SessionPreferences;
}

export interface VariantOutput {
  id: string;
  hook: string;
  script: string;
  format: string;
  scores: {
    scrollHold:      number;
    sharePotential:  number;
    messageStrength: number;
    finalScore:      number;
  };
}

export interface GenerateOutput {
  variants: VariantOutput[];
  recommendedVariantId: string;
  niche: string;
  sessionId: string;
}

// ── Trend influence — score nudges only (max ±5 per metric) ──────────────────

function applyTrendInfluence(
  variant: HookVariant,
  fingerprint: TrendFingerprint | undefined,
): HookVariant["scores"] {
  if (!fingerprint) return variant.scores;

  const { emotionalSignals } = fingerprint;
  const s = { ...variant.scores };
  const strategy = variant.psychologicalStrategy;

  if (strategy === "curiosity_gap" && emotionalSignals.curiosity > 60) {
    s.scrollHold = Math.min(100, s.scrollHold + 3);
  }
  if (strategy === "emotional_confession" && emotionalSignals.emotion > 60) {
    s.sharePotential = Math.min(100, s.sharePotential + 4);
  }
  if (strategy === "authority_insight" && emotionalSignals.authority > 60) {
    s.messageStrength = Math.min(100, s.messageStrength + 5);
  }
  if (strategy === "shock_reversal" && emotionalSignals.shock > 60) {
    s.scrollHold = Math.min(100, s.scrollHold + 4);
    s.sharePotential = Math.min(100, s.sharePotential + 3);
  }
  if (strategy === "unexpected_twist" && emotionalSignals.storytelling > 60) {
    s.sharePotential = Math.min(100, s.sharePotential + 4);
  }

  return s;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generateVariants(input: GenerateInput): GenerateOutput {
  const { idea, niche, trendFingerprint, sessionPreferences } = input;

  const result = generateViralStrategy(
    idea,
    niche as NicheCategory | undefined,
    sessionPreferences,
  );

  const variants: VariantOutput[] = result.variants.map(v => {
    const adjustedScores = applyTrendInfluence(v, trendFingerprint);
    const finalScore = Math.round(
      adjustedScores.scrollHold * 0.4 +
      adjustedScores.sharePotential * 0.3 +
      adjustedScores.messageStrength * 0.3,
    );

    return {
      id:     `v${v.id}`,
      hook:   v.hook,
      script: v.script,
      format: v.format,
      scores: {
        scrollHold:      adjustedScores.scrollHold,
        sharePotential:  adjustedScores.sharePotential,
        messageStrength: adjustedScores.messageStrength,
        finalScore,
      },
    };
  });

  // Enforce exactly 6
  if (variants.length !== 6) {
    throw new Error(`[generateVariants] Expected 6 variants, got ${variants.length}`);
  }

  const recommended = variants
    .slice()
    .sort((a, b) => b.scores.finalScore - a.scores.finalScore)[0]!;

  return {
    variants,
    recommendedVariantId: recommended.id,
    niche: result.niche,
    sessionId: result.sessionId,
  };
}
