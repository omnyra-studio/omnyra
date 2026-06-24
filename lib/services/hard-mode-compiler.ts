/**
 * Hard Mode Prompt Compiler
 *
 * Converts a ContinuitySnapshot into a serialized execution contract for
 * Runway / Kling. The prompt is structured as a locked state machine output,
 * not creative prose — the model is forced into constraint execution mode.
 */

import type { ContinuitySnapshot, CharacterStateV2, CameraState, ObjectState, EnvironmentState } from "@/lib/types/continuity";

function formatCharacters(characters: ContinuitySnapshot["characters"]): string {
  const entries = Object.values(characters);
  if (!entries.length) return "No characters defined.";
  return entries.map((c: CharacterStateV2) => [
    `ID: ${c.characterId}`,
    `  pose: ${c.pose}`,
    `  expression: ${c.expression}`,
    `  gaze: ${c.gaze}`,
    `  velocity: ${c.velocity}`,
    `  position: ${c.position}`,
  ].join("\n")).join("\n\n");
}

function formatCamera(camera: CameraState): string {
  return [
    `type: ${camera.type}`,
    `movement: ${camera.movement}`,
    `lens: ${camera.lens}`,
    `distance: ${camera.distance}m`,
    `angle: pitch=${camera.angle.pitch}° yaw=${camera.angle.yaw}° roll=${camera.angle.roll}°`,
    `position: x=${camera.position.x.toFixed(2)} y=${camera.position.y.toFixed(2)} z=${camera.position.z.toFixed(2)}`,
  ].join("\n");
}

function formatObjects(objects: ContinuitySnapshot["objects"]): string {
  const entries = Object.values(objects);
  if (!entries.length) return "No tracked objects.";
  return entries.map((o: ObjectState) =>
    `${o.id} (${o.type}): position="${o.position}" visible=${o.visibility}${o.holder ? ` held_by=${o.holder}` : ""}`,
  ).join("\n");
}

function formatEnvironment(env: EnvironmentState): string {
  return [
    `location: ${env.location}`,
    `time_of_day: ${env.timeOfDay}`,
    `weather: ${env.weather}`,
    `lighting_direction: ${env.lightingDirection}`,
    `atmosphere: ${env.atmosphere}`,
  ].join("\n");
}

/**
 * Build a Hard Mode prompt from a continuity snapshot.
 * This is a deterministic execution contract — no creative interpretation.
 */
export function buildHardModePrompt(snapshot: ContinuitySnapshot): string {
  return `==============================
HARD CONTINUITY CONTRACT
==============================

YOU MUST FOLLOW ALL INSTRUCTIONS EXACTLY.
NO INTERPRETATION. NO IMPROVISATION.
THIS IS A SERIALIZED STATE MACHINE SNAPSHOT — EXECUTE IT.

------------------------------
FRAME LOCK (CRITICAL)
------------------------------
- You are continuing DIRECTLY from the previous frame
- Scene index: ${snapshot.sceneIndex}
- First 2 seconds: ZERO CHANGE IN MOTION
- Must replicate EXACTLY:
  - character pose and expression
  - camera position, angle, and lens
  - lighting direction and color temperature
  - environment layout
  - all object placements

------------------------------
CHARACTER STATE (LOCKED)
------------------------------
${formatCharacters(snapshot.characters)}

------------------------------
CAMERA STATE (LOCKED)
------------------------------
${formatCamera(snapshot.camera)}

------------------------------
OBJECT STATE (LOCKED)
------------------------------
${formatObjects(snapshot.objects)}

------------------------------
ENVIRONMENT STATE (LOCKED)
------------------------------
${formatEnvironment(snapshot.environment)}

------------------------------
SCENE INTENT
------------------------------
Beat: ${snapshot.story.activeBeat ?? "continuation"}
Tension: ${snapshot.story.tension.toFixed(2)}
Emotion: ${snapshot.story.emotion}

------------------------------
STYLE LOCK
------------------------------
- cinematic realism, 35mm film grain
- Roger Deakins golden-hour grade or teal-orange grade
- locked lighting continuity — no sudden brightness shift
- no style drift, no scene reinterpretation
- character identity must be identical to frame 0
- motion must be physically continuous from previous clip endpoint

==============================
END OF CONTRACT
==============================`;
}

/**
 * Builds a transition bridge suffix for Scene 2+ prompts.
 * Injected after the main scene prompt to lock cross-clip continuity.
 */
export function buildTransitionBridge(prevFrameDescription: string): string {
  return `\n\nCONTINUITY LOCK: Use the last frame of the previous scene as the exact reference frame. Continue all motion smoothly — no re-staging, no camera reset. First 2 seconds replicate: ${prevFrameDescription.slice(0, 200)}`;
}
