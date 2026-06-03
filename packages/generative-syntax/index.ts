// Generative Syntax Engine — grammar-to-prompt translation layer.
// Compiles SceneNodes + VisualGrammar + NarrativePatterns → production prompts.

import type { SceneNode, ContinuityLock } from "../scene-language";
import { serializeSceneNode, buildCompositionDirective, resolveMotionDirective } from "../scene-language";
import type { VisualGrammarRule, NarrativePattern, CinematicEvolutionResult } from "../creative-intelligence";

// ── Scene Compiler ────────────────────────────────────────────────────────────

export interface CompiledScene {
  index: number;
  sceneId: string;
  prompt: string;
  estimatedDurationSeconds: number;
  enforcedConstraints: string[];
}

export interface SceneSequenceCompilation {
  totalScenes: number;
  totalEstimatedDuration: number;
  compiledScenes: CompiledScene[];
  globalContinuityDirective: string;
  grammarDirective: string;
  narrativeDirective: string;
}

export function compileScene(
  node: SceneNode,
  grammar: VisualGrammarRule,
  continuity: ContinuityLock,
): CompiledScene {
  const composition = buildCompositionDirective(node.shotType, node.emotionalBeat);
  const motion = resolveMotionDirective(node.emotionalBeat, node.motionIntensity);

  const parts: string[] = [
    serializeSceneNode(node),
    `FRAMING: ${composition.framing.replace(/_/g, " ")}, subject at ${composition.subjectPlacement.replace(/_/g, " ")}.`,
    `DEPTH: ${composition.backgroundDepth.replace(/_/g, " ")}.`,
    `CAMERA: ${motion.primaryMove.replace(/_/g, " ")} at ${motion.intensity}% intensity, ${motion.speedProfile.replace(/_/g, " ")} speed, ${motion.stabilization.replace(/_/g, " ")}.`,
    `PACE: ${grammar.paceRhythm.replace(/_/g, " ")}.`,
    `COLOR TEMP: ${grammar.colorTemperature.replace(/_/g, " ")}.`,
  ];

  // Inject continuity locks
  if (continuity.subjectIdentity.length) {
    parts.push(`MAINTAIN IDENTITY: ${continuity.subjectIdentity.join(", ")}.`);
  }
  if (continuity.colorConsistency) {
    parts.push(`COLOR CONSISTENCY: match ${continuity.lightingAnchors.join(", ")}.`);
  }
  if (node.constraints.length) {
    parts.push(`LOCKED: ${node.constraints.join(", ")}.`);
  }

  // Negative constraints from grammar
  const negatives: string[] = [];
  if (grammar.depthField === "shallow") negatives.push("deep background focus");
  if (grammar.motionProfile === "static") negatives.push("camera shake", "handheld wobble");
  if (negatives.length) parts.push(`NO: ${negatives.join(", ")}.`);

  return {
    index: node.index,
    sceneId: node.id,
    prompt: parts.join(" "),
    estimatedDurationSeconds: node.duration,
    enforcedConstraints: [...continuity.subjectIdentity, ...node.constraints],
  };
}

// ── Grammar-to-Prompt Translator ──────────────────────────────────────────────

export function buildGrammarDirective(grammar: VisualGrammarRule): string {
  return [
    `VISUAL GRAMMAR: ${grammar.composition.replace(/_/g, " ")} composition.`,
    `MOTION PROFILE: ${grammar.motionProfile}.`,
    `DEPTH: ${grammar.depthField} field.`,
    `SUCCESS RATE: ${grammar.observedSuccessRate}%.`,
  ].join(" ");
}

export function buildNarrativeDirective(pattern: NarrativePattern): string {
  return [
    `NARRATIVE: ${pattern.arc.replace(/_/g, " ")} arc.`,
    `OPENING: ${pattern.openingHook}.`,
    `EMOTIONAL FLOW: ${pattern.emotionalBeats.join(" → ")}.`,
    `RESOLUTION: ${pattern.resolutionType}.`,
  ].join(" ");
}

export function buildContinuityDirective(lock: ContinuityLock): string {
  const parts: string[] = [];
  if (lock.subjectIdentity.length) parts.push(`IDENTITY LOCKS: ${lock.subjectIdentity.join(", ")}`);
  if (lock.environmentAnchors.length) parts.push(`ENV LOCKS: ${lock.environmentAnchors.join(", ")}`);
  if (lock.matchCutCandidates.length) parts.push(`MATCH CUTS: ${lock.matchCutCandidates.join(", ")}`);
  if (lock.colorConsistency) parts.push("COLOR CONTINUITY: enforced");
  return parts.join(". ") || "No continuity locks.";
}

// ── Full Scene Sequence Compiler ──────────────────────────────────────────────

export function compileSceneSequence(
  scenes: SceneNode[],
  evolution: CinematicEvolutionResult,
  continuity: ContinuityLock,
): SceneSequenceCompilation {
  const compiledScenes = scenes.map(node =>
    compileScene(node, evolution.selectedGrammar, continuity),
  );

  const totalDuration = compiledScenes.reduce((s, c) => s + c.estimatedDurationSeconds, 0);

  return {
    totalScenes: scenes.length,
    totalEstimatedDuration: totalDuration,
    compiledScenes,
    globalContinuityDirective: buildContinuityDirective(continuity),
    grammarDirective: buildGrammarDirective(evolution.selectedGrammar),
    narrativeDirective: buildNarrativeDirective(evolution.selectedNarrative),
  };
}

// ── Prompt Export ─────────────────────────────────────────────────────────────

export function exportToPromptArray(compilation: SceneSequenceCompilation): string[] {
  return compilation.compiledScenes.map(c => c.prompt);
}
