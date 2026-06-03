// Auto-Viral Strategy Engine — Ship-Ready v1
// Generates exactly 6 hook + script variants, scores, ranks, recommends.
// Session-only preference biasing — no persistent memory, no cross-session storage.

import type { NicheCategory, Platform } from "../distribution-intelligence";
import { classifyNiche } from "../distribution-intelligence";
import {
  rankVariants,
  recordSessionSelection,
  type RankedVariant,
  type SessionPreferences,
} from "../selection-feedback";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PsychologicalStrategy =
  | "curiosity_gap"
  | "shock_reversal"
  | "emotional_confession"
  | "authority_insight"
  | "relatable_frustration"
  | "unexpected_twist";

export type VideoFormat = "talking_head" | "cinematic" | "meme" | "story" | "documentary" | "tutorial" | "text_overlay";

export interface HookVariant {
  id: number;                        // 1–6
  hook: string;                      // < 18 words
  script: string;                    // 1–3 line script direction
  format: VideoFormat;
  platforms: Platform[];
  psychologicalStrategy: PsychologicalStrategy;
  scores: {
    scrollHold: number;              // 0–100 (Retention)
    sharePotential: number;          // 0–100 (Virality)
    messageStrength: number;         // 0–100 (Clarity)
    platformFit: Record<Platform, number>; // display only, not in formula
  };
  finalScore: number;                // scrollHold*0.4 + sharePotential*0.3 + messageStrength*0.3
}

export interface ContentStrategyOutputContract {
  sessionId: string;
  niche: NicheCategory;
  topic: string;
  variants: HookVariant[];           // always exactly 6
  rankedVariants: RankedVariant[];   // display-ordered with roles
  recommendedVariantId: number;      // 1–6
  recommendationReason: string;      // 1–2 sentences
  userSelectedVariantId: number | null;
}

// ── Score formula ─────────────────────────────────────────────────────────────

function computeScore(scores: Pick<HookVariant["scores"], "scrollHold" | "sharePotential" | "messageStrength">): number {
  return Math.round((scores.scrollHold * 0.4) + (scores.sharePotential * 0.3) + (scores.messageStrength * 0.3));
}

// ── Hook + Script templates ───────────────────────────────────────────────────

interface HookTemplate {
  strategy: PsychologicalStrategy;
  hook: (topic: string) => string;
  script: (topic: string) => string;
  format: VideoFormat;
  baseScores: Omit<HookVariant["scores"], "platformFit">;
  platformFit: Record<Platform, number>;
}

const TEMPLATES: HookTemplate[] = [
  {
    strategy: "curiosity_gap",
    hook: (t) => `What nobody tells you about ${t} — until it's too late`,
    script: (t) => `Open with a provocative statement about ${t}. Tease the hidden insight in 1 sentence. Reveal it at the 15-second mark.`,
    format: "talking_head",
    baseScores: { scrollHold: 82, sharePotential: 76, messageStrength: 80 },
    platformFit: { tiktok: 85, instagram_reels: 82, youtube_shorts: 78, youtube_longform: 60, linkedin: 55, twitter: 65 },
  },
  {
    strategy: "shock_reversal",
    hook: (t) => `I tried ${t} for 30 days. Here's what actually happened`,
    script: (t) => `Cut to the unexpected result immediately. Build tension by showing the before. Land the reversal at the midpoint.`,
    format: "story",
    baseScores: { scrollHold: 78, sharePotential: 84, messageStrength: 85 },
    platformFit: { tiktok: 90, instagram_reels: 85, youtube_shorts: 80, youtube_longform: 55, linkedin: 40, twitter: 70 },
  },
  {
    strategy: "emotional_confession",
    hook: (t) => `I'm embarrassed it took me this long to figure out ${t}`,
    script: (t) => `Admit the failure or blind spot directly. Make it specific and personal. Pivot to what changed — keep it under 30 seconds.`,
    format: "talking_head",
    baseScores: { scrollHold: 85, sharePotential: 72, messageStrength: 88 },
    platformFit: { tiktok: 88, instagram_reels: 84, youtube_shorts: 75, youtube_longform: 50, linkedin: 60, twitter: 65 },
  },
  {
    strategy: "authority_insight",
    hook: (t) => `After looking at 100+ cases — here's the real pattern behind ${t}`,
    script: (t) => `State your data or observation upfront. Walk through the pattern in 2–3 beats. Close with the implication.`,
    format: "documentary",
    baseScores: { scrollHold: 76, sharePotential: 70, messageStrength: 82 },
    platformFit: { tiktok: 70, instagram_reels: 72, youtube_shorts: 82, youtube_longform: 88, linkedin: 90, twitter: 75 },
  },
  {
    strategy: "relatable_frustration",
    hook: (t) => `Why does ${t} feel impossible until you know this one thing`,
    script: (t) => `Name the exact frustration in the first 3 seconds. Validate it. Deliver the reframe or solution by second 20.`,
    format: "tutorial",
    baseScores: { scrollHold: 80, sharePotential: 74, messageStrength: 87 },
    platformFit: { tiktok: 84, instagram_reels: 80, youtube_shorts: 85, youtube_longform: 65, linkedin: 62, twitter: 68 },
  },
  {
    strategy: "unexpected_twist",
    hook: (t) => `${t} and [completely unrelated thing] have one thing in common`,
    script: (t) => `Set up the familiar premise. Introduce the unexpected comparison. Let the analogy do the work — don't over-explain.`,
    format: "cinematic",
    baseScores: { scrollHold: 74, sharePotential: 88, messageStrength: 72 },
    platformFit: { tiktok: 92, instagram_reels: 86, youtube_shorts: 78, youtube_longform: 58, linkedin: 45, twitter: 80 },
  },
];

// ── Niche score adjustments ───────────────────────────────────────────────────

const NICHE_BOOSTS: Partial<Record<NicheCategory, Partial<Omit<HookVariant["scores"], "platformFit">>>> = {
  finance_investing:        { sharePotential: 6, scrollHold: 4 },
  psychology_mental_health: { scrollHold: 8, messageStrength: 5 },
  fitness_wellness:         { sharePotential: 5, scrollHold: 4 },
  entertainment_storytelling: { sharePotential: 8, scrollHold: 5 },
  marketing_creator_economy: { messageStrength: 6, sharePotential: 4 },
  business_entrepreneurship: { messageStrength: 5, scrollHold: 3 },
};

function applyNicheBoost(
  scores: Omit<HookVariant["scores"], "platformFit">,
  niche: NicheCategory,
): Omit<HookVariant["scores"], "platformFit"> {
  const boost = NICHE_BOOSTS[niche] ?? {};
  return {
    scrollHold:      Math.min(100, scores.scrollHold      + (boost.scrollHold      ?? 0)),
    sharePotential:  Math.min(100, scores.sharePotential  + (boost.sharePotential  ?? 0)),
    messageStrength: Math.min(100, scores.messageStrength + (boost.messageStrength ?? 0)),
  };
}

// ── Variant builder ───────────────────────────────────────────────────────────

function buildVariant(id: number, template: HookTemplate, topic: string, niche: NicheCategory): HookVariant {
  const scores = applyNicheBoost({ ...template.baseScores }, niche);
  return {
    id,
    hook: template.hook(topic),
    script: template.script(topic),
    format: template.format,
    platforms: Object.keys(template.platformFit) as Platform[],
    psychologicalStrategy: template.strategy,
    scores: { ...scores, platformFit: template.platformFit },
    finalScore: computeScore(scores),
  };
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function generateViralStrategy(
  topic: string,
  nicheOverride?: NicheCategory,
  sessionPreferences?: SessionPreferences,
): ContentStrategyOutputContract {
  const niche = nicheOverride ?? classifyNiche(topic);

  const variants: HookVariant[] = TEMPLATES.map((t, i) => buildVariant(i + 1, t, topic, niche));

  const rankedVariants = rankVariants(variants, sessionPreferences);
  const recommended = rankedVariants[0]!.variant;

  const recommendationReason =
    `Hook #${recommended.id} leads with ${recommended.psychologicalStrategy.replace(/_/g, " ")} — ` +
    `highest scroll-stop potential for ${niche.replace(/_/g, " ")} content ` +
    `(scroll hold ${recommended.scores.scrollHold}/100, share potential ${recommended.scores.sharePotential}/100).`;

  return {
    sessionId: `vs_${Date.now()}`,
    niche,
    topic,
    variants,
    rankedVariants,
    recommendedVariantId: recommended.id,
    recommendationReason,
    userSelectedVariantId: null,
  };
}

// ── User selection ────────────────────────────────────────────────────────────

export function selectVariant(
  output: ContentStrategyOutputContract,
  variantId: number,
  currentSessionPrefs?: SessionPreferences,
): { output: ContentStrategyOutputContract; updatedPrefs: SessionPreferences | undefined } {
  if (variantId < 1 || variantId > 6) throw new Error(`variantId must be 1–6, got ${variantId}`);

  const selected = output.variants.find(v => v.id === variantId);
  if (!selected) throw new Error(`variantId ${variantId} not found`);

  const updatedPrefs = currentSessionPrefs
    ? recordSessionSelection(currentSessionPrefs, selected.psychologicalStrategy)
    : undefined;

  return {
    output: { ...output, userSelectedVariantId: variantId },
    updatedPrefs,
  };
}

export function getSelectedVariant(output: ContentStrategyOutputContract): HookVariant | null {
  if (!output.userSelectedVariantId) return null;
  return output.variants.find(v => v.id === output.userSelectedVariantId) ?? null;
}
