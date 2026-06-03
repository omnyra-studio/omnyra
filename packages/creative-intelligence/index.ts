// Autonomous Creative Intelligence Layer v3
// Observes generation patterns → mines visual grammar → evolves cinematic language

import type { PromptAST } from "../prompt-compiler/ast";

// ── Visual Grammar Types ──────────────────────────────────────────────────────

export type CompositionRule =
  | "rule_of_thirds"
  | "center_frame_dominance"
  | "depth_layering"
  | "negative_space"
  | "symmetry_balance";

export type NarrativeArc =
  | "problem_solution"
  | "transformation"
  | "day_in_life"
  | "revelation"
  | "journey"
  | "contrast";

export type SceneCluster =
  | "product_showcase"
  | "lifestyle_broll"
  | "talking_head"
  | "documentary"
  | "cinematic_sequence"
  | "tutorial"
  | "emotional_story";

export interface VisualGrammarRule {
  id: string;
  composition: CompositionRule;
  motionProfile: "static" | "dynamic" | "rhythmic" | "flowing";
  colorTemperature: "warm" | "cool" | "neutral" | "high_contrast";
  depthField: "shallow" | "deep" | "variable";
  paceRhythm: "fast_cut" | "slow_burn" | "pulse" | "continuous";
  observedSuccessRate: number; // 0-100
  associatedClusters: SceneCluster[];
}

export interface NarrativePattern {
  id: string;
  arc: NarrativeArc;
  sceneCount: number;
  emotionalBeats: string[];
  openingHook: string;
  resolutionType: "definitive" | "open" | "cliffhanger" | "inspiring";
  avgRetentionBoost: number; // percentage improvement over baseline
  usageCount: number;
}

export interface VisualObservation {
  jobId: string;
  sceneCluster: SceneCluster;
  compositionDetected: CompositionRule;
  retentionScore: number;
  viralitySignal: number;
  timestamp: number;
}

// ── In-Memory Pattern Store ───────────────────────────────────────────────────

const observationHistory: VisualObservation[] = [];
const MAX_OBSERVATIONS = 2_000;

const GRAMMAR_RULES: VisualGrammarRule[] = [
  {
    id: "rule_thirds_dynamic",
    composition: "rule_of_thirds",
    motionProfile: "dynamic",
    colorTemperature: "warm",
    depthField: "shallow",
    paceRhythm: "pulse",
    observedSuccessRate: 78,
    associatedClusters: ["lifestyle_broll", "emotional_story", "product_showcase"],
  },
  {
    id: "center_dominance_static",
    composition: "center_frame_dominance",
    motionProfile: "static",
    colorTemperature: "neutral",
    depthField: "shallow",
    paceRhythm: "slow_burn",
    observedSuccessRate: 82,
    associatedClusters: ["talking_head", "tutorial"],
  },
  {
    id: "depth_flowing_cinematic",
    composition: "depth_layering",
    motionProfile: "flowing",
    colorTemperature: "cool",
    depthField: "deep",
    paceRhythm: "continuous",
    observedSuccessRate: 71,
    associatedClusters: ["cinematic_sequence", "documentary", "lifestyle_broll"],
  },
  {
    id: "negative_space_rhythmic",
    composition: "negative_space",
    motionProfile: "rhythmic",
    colorTemperature: "high_contrast",
    depthField: "variable",
    paceRhythm: "fast_cut",
    observedSuccessRate: 85,
    associatedClusters: ["product_showcase", "lifestyle_broll"],
  },
];

const NARRATIVE_PATTERNS: NarrativePattern[] = [
  {
    id: "problem_solution_3act",
    arc: "problem_solution",
    sceneCount: 3,
    emotionalBeats: ["tension", "struggle", "relief"],
    openingHook: "Lead with the pain — show not tell",
    resolutionType: "definitive",
    avgRetentionBoost: 24,
    usageCount: 0,
  },
  {
    id: "transformation_5beat",
    arc: "transformation",
    sceneCount: 5,
    emotionalBeats: ["before", "inciting_moment", "journey", "breakthrough", "after"],
    openingHook: "Contrast before/after in opening 3 seconds",
    resolutionType: "inspiring",
    avgRetentionBoost: 31,
    usageCount: 0,
  },
  {
    id: "revelation_2act",
    arc: "revelation",
    sceneCount: 2,
    emotionalBeats: ["curiosity_build", "payoff"],
    openingHook: "Open with the unexpected fact or visual",
    resolutionType: "open",
    avgRetentionBoost: 18,
    usageCount: 0,
  },
  {
    id: "contrast_burst",
    arc: "contrast",
    sceneCount: 4,
    emotionalBeats: ["familiar", "subversion", "familiar_again", "twist"],
    openingHook: "Start with what they expect, break it immediately",
    resolutionType: "cliffhanger",
    avgRetentionBoost: 27,
    usageCount: 0,
  },
];

// ── Observation Engine ────────────────────────────────────────────────────────

export function recordObservation(obs: VisualObservation): void {
  observationHistory.unshift(obs);
  if (observationHistory.length > MAX_OBSERVATIONS) observationHistory.length = MAX_OBSERVATIONS;
}

export function clusterScene(sceneDescription: string): SceneCluster {
  const lower = sceneDescription.toLowerCase();
  if (lower.includes("product") || lower.includes("showcase") || lower.includes("unboxing")) return "product_showcase";
  if (lower.includes("tutorial") || lower.includes("how to") || lower.includes("step")) return "tutorial";
  if (lower.includes("talking") || lower.includes("speaking") || lower.includes("face to camera")) return "talking_head";
  if (lower.includes("documentary") || lower.includes("interview")) return "documentary";
  if (lower.includes("cinematic") || lower.includes("film")) return "cinematic_sequence";
  if (lower.includes("story") || lower.includes("journey") || lower.includes("personal")) return "emotional_story";
  return "lifestyle_broll";
}

// ── Visual Grammar Miner ──────────────────────────────────────────────────────

export function mineVisualGrammar(cluster: SceneCluster): VisualGrammarRule {
  // Find the best performing rule for this cluster
  const candidates = GRAMMAR_RULES.filter(r => r.associatedClusters.includes(cluster));

  // Boost score based on observed success in history
  const recent = observationHistory.slice(0, 200);
  const scored = candidates.map(rule => {
    const observations = recent.filter(o => o.sceneCluster === cluster);
    const avgRetention = observations.length
      ? observations.reduce((s, o) => s + o.retentionScore, 0) / observations.length
      : rule.observedSuccessRate;
    return { rule, score: (rule.observedSuccessRate + avgRetention) / 2 };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.rule ?? GRAMMAR_RULES[0]!;
}

// ── Narrative Pattern Database ────────────────────────────────────────────────

export function selectNarrativePattern(
  cluster: SceneCluster,
  targetEmotion: "tension" | "inspiration" | "curiosity" | "trust" | "surprise",
): NarrativePattern {
  const emotionMap: Record<typeof targetEmotion, NarrativeArc[]> = {
    tension: ["problem_solution", "contrast"],
    inspiration: ["transformation", "journey"],
    curiosity: ["revelation", "contrast"],
    trust: ["day_in_life", "transformation"],
    surprise: ["revelation", "contrast"],
  };

  const preferredArcs = emotionMap[targetEmotion];
  const candidates = NARRATIVE_PATTERNS.filter(p => preferredArcs.includes(p.arc));
  const best = candidates.sort((a, b) => b.avgRetentionBoost - a.avgRetentionBoost)[0];
  return best ?? NARRATIVE_PATTERNS[0]!;
}

export function getAllNarrativePatterns(): NarrativePattern[] {
  return NARRATIVE_PATTERNS.slice();
}

// ── Cinematic Evolution Engine ────────────────────────────────────────────────

export interface CinematicEvolutionResult {
  cluster: SceneCluster;
  selectedGrammar: VisualGrammarRule;
  selectedNarrative: NarrativePattern;
  evolutionDirective: string;
  confidenceScore: number;
}

export function evolveCinematicStrategy(
  sceneDescription: string,
  targetEmotion: "tension" | "inspiration" | "curiosity" | "trust" | "surprise" = "curiosity",
  retentionTarget = 75,
): CinematicEvolutionResult {
  const cluster = clusterScene(sceneDescription);
  const grammar = mineVisualGrammar(cluster);
  const narrative = selectNarrativePattern(cluster, targetEmotion);

  const directive = [
    `COMPOSITION: ${grammar.composition.replace(/_/g, " ")} with ${grammar.depthField} depth.`,
    `MOTION: ${grammar.motionProfile} movement, ${grammar.paceRhythm.replace(/_/g, " ")} pace.`,
    `COLOR: ${grammar.colorTemperature.replace(/_/g, " ")} temperature palette.`,
    `NARRATIVE: ${narrative.arc.replace(/_/g, " ")} arc — ${narrative.openingHook}.`,
    `BEATS: ${narrative.emotionalBeats.join(" → ")}.`,
    `RESOLUTION: ${narrative.resolutionType}.`,
  ].join(" ");

  const confidenceScore = Math.min(
    100,
    Math.round((grammar.observedSuccessRate + narrative.avgRetentionBoost + retentionTarget) / 3),
  );

  narrative.usageCount++;

  return { cluster, selectedGrammar: grammar, selectedNarrative: narrative, evolutionDirective: directive, confidenceScore };
}
