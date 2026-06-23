import type { NarrativeRole } from "@omnyra/continuity-engine";

export interface EmotionFrame {
  sceneIndex:  number;
  role:        NarrativeRole;
  emotion:     string;
  tension:     number;
  timestamp:   number;
}

export interface EmotionTracker {
  projectId:   string;
  frames:      EmotionFrame[];
  currentArc:  string;
}

export function createEmotionTracker(projectId: string, arc: string): EmotionTracker {
  return { projectId, frames: [], currentArc: arc };
}

export function recordEmotionFrame(
  tracker:    EmotionTracker,
  sceneIndex: number,
  role:       NarrativeRole,
  emotion:    string,
  tension:    number,
): EmotionTracker {
  return {
    ...tracker,
    frames: [
      ...tracker.frames,
      { sceneIndex, role, emotion, tension, timestamp: Date.now() },
    ],
  };
}

/** Returns true if emotion has been flat for >2 consecutive mid-story scenes */
export function isEmotionFlat(tracker: EmotionTracker): boolean {
  const frames = tracker.frames;
  if (frames.length < 3) return false;
  const last3 = frames.slice(-3);
  const first = last3[0]!;
  const last  = last3[2]!;
  // Both mid-story (not hook or resolution)
  const bothMid = first.role !== "hook" && last.role !== "resolution";
  return bothMid && Math.abs(last.tension - first.tension) < 0.10;
}
