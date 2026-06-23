import type { NarrativeRole } from "@omnyra/continuity-engine";

export interface SceneBreakdown {
  sceneIndex:      number;
  role:            NarrativeRole;
  scriptPortion:   string;
  emotionalBeat:   string;
  continuesFromPrevious: boolean;
  priority:        number;
}

/**
 * Splits a script into N scene breakdowns using a simple sentence-boundary heuristic.
 * The LLM (ai-director.ts) produces a richer version — this is the deterministic fallback.
 */
export function splitScriptIntoScenes(
  script:     string,
  sceneCount: number,
): SceneBreakdown[] {
  const roles: NarrativeRole[] = ["hook", "development", "climax", "resolution"];
  const sentences = script
    .replace(/([.!?])\s+/g, "$1\n")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);

  const perScene  = Math.ceil(sentences.length / sceneCount);

  return Array.from({ length: sceneCount }, (_, i) => {
    const chunk      = sentences.slice(i * perScene, (i + 1) * perScene).join(" ");
    const role       = roles[i % 4]!;
    return {
      sceneIndex:            i,
      role,
      scriptPortion:         chunk || `Scene ${i + 1} of ${sceneCount}`,
      emotionalBeat:         defaultBeat(role, i),
      continuesFromPrevious: i > 0,
      priority:              role === "climax" ? 1 : 2,
    };
  });
}

function defaultBeat(role: NarrativeRole, index: number): string {
  const beats: Record<NarrativeRole, string> = {
    hook:        "establish character in world, create intrigue",
    development: "build stakes, reveal challenge",
    climax:      "peak emotional moment — transformation begins",
    resolution:  "earned outcome — viewer leaves changed",
  };
  return beats[role] ?? `Scene ${index + 1}`;
}
