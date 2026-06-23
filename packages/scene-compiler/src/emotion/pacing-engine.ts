import type { NarrativeRole } from "@omnyra/continuity-engine";
import { getTensionPoint } from "./tension-curve";

export interface PacingSpec {
  sceneIndex:    number;
  role:          NarrativeRole;
  emotion:       string;
  tension:       number;
  pacing:        string;
  intensity:     string;
  durationSecs:  number;
  requiresEscalation: boolean;
}

const DURATION_MAP: Record<NarrativeRole, number> = {
  hook:        10,
  development: 10,
  climax:      10,
  resolution:  10,
};

/**
 * Build full pacing specs for all scenes.
 * Pure function — deterministic given the same inputs.
 */
export function buildPacingSpecs(
  roles:     NarrativeRole[],
  arcParts:  string[],   // e.g. ["curious", "determined", "committed", "relieved"]
): PacingSpec[] {
  return roles.map((role, i) => {
    const tp   = getTensionPoint(role);
    const prev = i > 0 ? getTensionPoint(roles[i - 1]!) : null;
    const delta = prev ? Math.abs(tp.tension - prev.tension) : 0.3;
    return {
      sceneIndex:         i,
      role,
      emotion:            arcParts[i] ?? tp.pacing,
      tension:            tp.tension,
      pacing:             tp.pacing,
      intensity:          tp.intensity,
      durationSecs:       DURATION_MAP[role],
      requiresEscalation: delta < 0.10 && i > 0 && i < roles.length - 1,
    };
  });
}
