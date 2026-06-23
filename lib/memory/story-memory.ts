/**
 * Story Memory — Layer 2 of the 3-layer memory system.
 *
 * Layer model:
 *   Layer 1 — Brand Memory  = WHO   — permanent identity, characters, visual rules
 *   Layer 2 — Story Memory  = WHAT  — per-project narrative arc and scene state
 *   Layer 3 — First Frame   = HOW   — render anchor (extractLastFrame in route)
 *
 * RULE: Story Memory is updated AFTER each scene renders, NOT before.
 * It is ephemeral — lives for one video generation, never persisted to DB.
 * It NEVER affects the front-end UI. Only video generation inputs.
 */

import type { StoryBeat } from "@/lib/storyboard-planner";

// ── Story Memory schema (matches system design doc) ───────────────────────────

export interface SceneProgressionEntry {
  scene_id: string;
  event:    string;
  emotion:  string;
}

export interface CurrentState {
  emotion:         string;
  tension_level:   number;   // 0.0 – 1.0
  location_state:  string;
}

export interface StoryMemory {
  project_id:                string;
  story_arc:                 string;    // "isolation → connection → transformation"
  scene_progression:         SceneProgressionEntry[];
  current_state:             CurrentState;
  active_continuity_objects: string[];  // objects/props that must persist
  // Internal tracking
  lightingVector:            string;
  cameraVector:              string;
  scenesSoFar:               number;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function initStoryMemory(
  projectId: string,
  beat: StoryBeat | null,
  arc: string,
): StoryMemory {
  return {
    project_id:   projectId,
    story_arc:    arc || "challenge → effort → resolution",
    scene_progression: beat ? [{
      scene_id: "scene_01",
      event:    beat.keyAction ?? "opening scene",
      emotion:  beat.emotion   ?? "neutral",
    }] : [],
    current_state: {
      emotion:        beat?.emotion ?? "neutral",
      tension_level:  0.3,
      location_state: beat?.environmentFocus ?? "establishing",
    },
    active_continuity_objects: beat?.environmentFocus ? [beat.environmentFocus] : [],
    lightingVector: beat?.lighting  ?? "natural cinematic",
    cameraVector:   beat?.cameraShot ?? "static",
    scenesSoFar:    0,
  };
}

// ── Advance after each clip renders ──────────────────────────────────────────

export function advanceStoryMemory(
  mem: StoryMemory,
  beat: StoryBeat | null,
  clipUrl: string | null,
): StoryMemory {
  void clipUrl; // reserved for future frame-analysis integration
  if (!beat) return { ...mem, scenesSoFar: mem.scenesSoFar + 1 };

  const sceneId = `scene_0${mem.scenesSoFar + 2}`; // +2 because 0-indexed after advance
  const newEntry: SceneProgressionEntry = {
    scene_id: sceneId,
    event:    beat.keyAction,
    emotion:  beat.emotion,
  };

  // Tension arc: rises through development/climax, drops at resolution
  const tensionMap: Record<string, number> = {
    hook: 0.3, development: 0.5, climax: 0.8, resolution: 0.2,
  };
  const newTension = tensionMap[beat.purpose ?? ""] ?? mem.current_state.tension_level;

  return {
    ...mem,
    scene_progression: [...mem.scene_progression, newEntry],
    current_state: {
      emotion:        beat.emotion,
      tension_level:  newTension,
      location_state: beat.environmentFocus ?? mem.current_state.location_state,
    },
    active_continuity_objects: beat.environmentFocus
      ? [...new Set([...mem.active_continuity_objects, beat.environmentFocus])].slice(-5)
      : mem.active_continuity_objects,
    scenesSoFar:    mem.scenesSoFar + 1,
    lightingVector: beat.lighting  || mem.lightingVector,
    cameraVector:   beat.cameraShot || mem.cameraVector,
  };
}

// ── Prompt injection ──────────────────────────────────────────────────────────
// Build the Story Context block prepended to Scene N+1's Kling/Runway prompt.
// Hard cap 300 chars — leaves room for scene direction in 500-char Kling limit.

export function buildStoryContextPrefix(mem: StoryMemory): string {
  const lastScene  = mem.scene_progression.at(-1);
  const objects    = mem.active_continuity_objects.slice(-3).join(", ");
  const tensionPct = Math.round(mem.current_state.tension_level * 100);

  return [
    lastScene ? `Story: ${lastScene.event}.` : "",
    `Emotion: ${mem.current_state.emotion} (tension ${tensionPct}%).`,
    objects ? `Keep in scene: ${objects}.` : "",
    `Lighting: ${mem.lightingVector}.`,
  ].filter(Boolean).join(" ").slice(0, 280) + "\n";
}

// ── Full Story Memory injection (for Claude scene compiler context) ───────────

export function buildStoryMemoryInjection(mem: StoryMemory): string {
  const progression = mem.scene_progression
    .map(s => `  ${s.scene_id}: ${s.event} [${s.emotion}]`)
    .join("\n");

  return [
    `STORY ARC: ${mem.story_arc}`,
    progression ? `SCENES SO FAR:\n${progression}` : "",
    `CURRENT STATE: emotion=${mem.current_state.emotion} tension=${mem.current_state.tension_level} location=${mem.current_state.location_state}`,
    mem.active_continuity_objects.length
      ? `CONTINUITY OBJECTS: ${mem.active_continuity_objects.join(", ")}`
      : "",
  ].filter(Boolean).join("\n");
}
