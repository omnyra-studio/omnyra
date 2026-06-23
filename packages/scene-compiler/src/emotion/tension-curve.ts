import type { NarrativeRole } from "@omnyra/continuity-engine";

export interface TensionPoint {
  role:        NarrativeRole;
  tension:     number;   // 0.0–1.0
  pacing:      "slow" | "accelerating" | "peak" | "release";
  intensity:   "subtle" | "moderate" | "intense";
}

const CURVE: TensionPoint[] = [
  { role: "hook",        tension: 0.30, pacing: "slow",         intensity: "subtle"   },
  { role: "development", tension: 0.55, pacing: "accelerating", intensity: "moderate" },
  { role: "climax",      tension: 0.85, pacing: "peak",         intensity: "intense"  },
  { role: "resolution",  tension: 0.20, pacing: "release",      intensity: "subtle"   },
];

export function getTensionPoint(role: NarrativeRole): TensionPoint {
  return CURVE.find(c => c.role === role) ?? CURVE[0]!;
}

/**
 * Returns true if the emotion has been flat for too long.
 * Rule: absolute tension delta < 0.10 for any mid-story scene = must escalate.
 */
export function requiresEscalation(
  scenes: Array<{ role: NarrativeRole; index: number }>,
  currentIndex: number,
): boolean {
  const sceneCount = scenes.length;
  if (currentIndex === 0 || currentIndex === sceneCount - 1) return false;
  const prev = scenes[currentIndex - 1];
  if (!prev) return false;
  const delta = Math.abs(getTensionPoint(scenes[currentIndex]!.role).tension - getTensionPoint(prev.role).tension);
  return delta < 0.10;
}
