/**
 * Emotion Engine — Agent 4 of 5.
 *
 * Input:  Planned scenes + Director arc
 * Output: Per-scene emotion intensity, pacing beat, tension value
 *
 * Rule: Emotion MUST NOT remain flat for more than 12 seconds.
 * Runs in PARALLEL with Cinematography Agent.
 */

import type { PlannedScene } from "./scene-planner";
import type { DirectorOutput } from "./director";

export interface EmotionBeat {
  scene_id:         string;
  emotion:          string;   // "hesitant", "determined", "relieved"
  tension:          number;   // 0.0–1.0
  pacing_modifier:  "slow" | "normal" | "accelerating" | "peak" | "release";
  action_intensity: "subtle" | "moderate" | "intense";
  // Flat emotion check — enforces the 12s rule
  requires_escalation: boolean;
}

// Deterministic tension curve — no LLM needed, pure math
const TENSION_CURVE: Record<PlannedScene["narrative_role"], number> = {
  hook:        0.30,
  development: 0.55,
  climax:      0.85,
  resolution:  0.20,
};

const PACING_MAP: Record<PlannedScene["narrative_role"], EmotionBeat["pacing_modifier"]> = {
  hook:        "slow",
  development: "accelerating",
  climax:      "peak",
  resolution:  "release",
};

const ACTION_MAP: Record<PlannedScene["narrative_role"], EmotionBeat["action_intensity"]> = {
  hook:        "subtle",
  development: "moderate",
  climax:      "intense",
  resolution:  "subtle",
};

export function runEmotionEngine(
  scenes: PlannedScene[],
  director: DirectorOutput,
): EmotionBeat[] {
  const arcParts = director.emotional_arc.split(/→|->/).map(s => s.trim());

  return scenes.map((scene, i) => {
    const tension         = TENSION_CURVE[scene.narrative_role];
    const prevTension     = i > 0 ? TENSION_CURVE[scenes[i - 1].narrative_role] : 0;
    const tensionDelta    = tension - prevTension;
    // Flag flat emotion: if tension barely changes AND scene is mid-video
    const requiresEscalation = Math.abs(tensionDelta) < 0.1 && i > 0 && i < scenes.length - 1;

    return {
      scene_id:            scene.scene_id,
      emotion:             arcParts[i] ?? scene.emotional_beat,
      tension,
      pacing_modifier:     PACING_MAP[scene.narrative_role],
      action_intensity:    ACTION_MAP[scene.narrative_role],
      requires_escalation: requiresEscalation,
    };
  });
}

/** Build the emotion context string injected into the Prompt Compiler */
export function buildEmotionContext(beat: EmotionBeat): string {
  const escalation = beat.requires_escalation
    ? " ESCALATE intensity — emotion must not be flat."
    : "";
  return `Emotion: ${beat.emotion} (tension ${Math.round(beat.tension * 100)}%). ` +
    `Pacing: ${beat.pacing_modifier}. Action: ${beat.action_intensity}.${escalation}`;
}
