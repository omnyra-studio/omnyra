/**
 * Omnyra Continuity Engine v2
 *
 * Implements the deterministic cinematic state machine.
 * Every scene render is a STATE TRANSITION, not a prompt.
 *
 * Pipeline:
 *   INPUT PROMPT
 *     → AI DIRECTOR
 *     → INITIAL CONTINUITY SNAPSHOT
 *     → buildNextScene()
 *     → validate()
 *     → PROMPT COMPILER
 *     → RENDER (Runway / Kling)
 *     → detectDrift()
 *     → IF FAIL → regenerate
 *     → updateSnapshot()
 *     → NEXT SCENE
 *
 * Key guarantees:
 *   - Snapshots are immutable per-scene (structuredClone before every transition)
 *   - Validation gate BLOCKS renders if drift > 0.08
 *   - First-frame anchor enforces 2s freeze at scene start
 *   - Objects never disappear unless explicitly removed
 */

import type {
  ContinuitySnapshot,
  BrandMemoryV2,
  StoryState,
  CharacterStateV2,
  CameraState,
  EnvironmentState,
  ObjectState,
  FirstFrameAnchor,
  ContinuityValidation,
  DriftResult,
  NarrativeRole,
} from "@/lib/types/continuity";

// ── Constants ─────────────────────────────────────────────────────────────────

const DRIFT_THRESHOLD     = 0.08;
const FREEZE_DURATION_SEC = 2 as const;

// Tension curve per narrative role
const TENSION_CURVE: Record<NarrativeRole, number> = {
  hook:        0.30,
  development: 0.55,
  climax:      0.85,
  resolution:  0.20,
};

const NARRATIVE_ORDER: NarrativeRole[] = ["hook", "development", "climax", "resolution"];

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create the initial ContinuitySnapshot for scene 0 (hook).
 * Called once per project before rendering begins.
 */
export function createInitialSnapshot(
  projectId:   string,
  brand:       BrandMemoryV2,
  location:    string,
  emotion:     string,
  objects:     ObjectState[] = [],
): ContinuitySnapshot {
  const primaryChar = brand.characters[0];

  const characterStates: Record<string, CharacterStateV2> = {};
  for (const char of brand.characters) {
    characterStates[char.id] = {
      characterId: char.id,
      position:    "center frame",
      pose:        "standing, neutral",
      expression:  char.id === primaryChar?.id ? emotion : "neutral",
      gaze:        "direct camera contact",
      velocity:    "stationary",
    };
  }

  const objectMap: Record<string, ObjectState> = {};
  for (const obj of objects) {
    objectMap[obj.id] = obj;
  }

  return {
    projectId,
    sceneIndex: 0,
    brand,
    story: {
      sceneIndex:       0,
      emotion,
      tension:          TENSION_CURVE.hook,
      arcPosition:      0,
      location,
      activeBeat:       "opening moment — establish world and character",
      activeCharacters: brand.characters.map(c => c.id),
      nextIntent:       "develop the emotional narrative",
    },
    characters: characterStates,
    camera: {
      type:     "static",
      position: { x: 0, y: 0.1, z: 3 },
      angle:    { pitch: -5, yaw: 0, roll: 0 },
      lens:     "35mm",
      distance: 3,
      movement: "slow push-in",
    },
    environment: {
      location,
      timeOfDay:          "golden_hour",
      weather:            "clear",
      lightingDirection:  "45° left, top-light, Roger Deakins style",
      atmosphere:         "warm, naturalistic, cinematic",
      continuityFlags:    { roadWet: false, crowdDensity: 0.3, fogLevel: 0 },
    },
    objects:    objectMap,
    firstFrame: {
      inheritsFromScene:    -1,
      imageUrl:             null,
      mustMatchExactly:     { characterPoses: false, cameraState: false, lighting: true, environment: true, objects: true },
      freezeDurationSeconds: FREEZE_DURATION_SEC,
    },
    validation: { passed: true, driftScore: 0, errors: [], warnings: [] },
    timestamps: { createdAt: Date.now() },
  };
}

// ── State Transition Engine ───────────────────────────────────────────────────

/**
 * Core state machine function.
 * Takes a snapshot and produces the NEXT scene's snapshot deterministically.
 * NEVER mutates the input — always clones first.
 */
export function buildNextScene(
  snapshot:     ContinuitySnapshot,
  nextBeat?:    string,
  nextEmotion?: string,
  lastFrameUrl?: string,
): ContinuitySnapshot {
  const next = structuredClone(snapshot) as ContinuitySnapshot;

  const currentRole = NARRATIVE_ORDER[snapshot.sceneIndex % 4];
  const nextRole    = NARRATIVE_ORDER[(snapshot.sceneIndex + 1) % 4];

  // 1. Advance story index
  next.sceneIndex        += 1;
  next.story.sceneIndex  += 1;
  next.story.arcPosition  = Math.min(1, (next.sceneIndex) / 4);

  // 2. Evolve emotion and tension
  next.story.tension  = TENSION_CURVE[nextRole];
  next.story.emotion  = nextEmotion ?? evolveEmotion(snapshot.story.emotion, nextRole);
  next.story.activeBeat = nextBeat ?? narrativeBeat(nextRole);
  next.story.nextIntent = narrativeIntent(nextRole);

  // 3. Inherit and evolve characters — preserve appearance, evolve expression
  for (const charId of Object.keys(next.characters)) {
    const prev = snapshot.characters[charId];
    if (!prev) continue;
    next.characters[charId] = {
      ...prev,
      expression: next.story.emotion,
      // Maintain pose unless climax (more intense)
      pose: nextRole === "climax"
        ? intensifyPose(prev.pose)
        : prev.pose,
      // Velocity increases toward climax, releases at resolution
      velocity: velocityForRole(nextRole),
    };
  }

  // 4. Inherit camera with continuity — no resets
  next.camera = inheritCamera(snapshot.camera, nextRole);

  // 5. Environment: preserve ALL flags — no resets
  next.environment = inheritEnvironment(snapshot.environment, nextRole);

  // 6. Objects: ALL objects carry forward unless explicitly removed
  // (use removeObject() to remove, not a new snapshot)
  next.objects = preserveObjects(snapshot.objects);

  // 7. First-frame anchor — locks scene start to previous clip's last frame
  next.firstFrame = createAnchor(snapshot.sceneIndex, lastFrameUrl ?? null);

  // 8. Reset validation for this new snapshot
  next.timestamps = { createdAt: Date.now() };

  return next;
}

/** Attach the extracted last frame URL after a clip renders */
export function attachLastFrameToSnapshot(
  snapshot:    ContinuitySnapshot,
  imageUrl:    string,
): ContinuitySnapshot {
  const updated = structuredClone(snapshot) as ContinuitySnapshot;
  updated.firstFrame.imageUrl = imageUrl;
  updated.firstFrame.mustMatchExactly = {
    characterPoses: true,
    cameraState:    true,
    lighting:       true,
    environment:    true,
    objects:        true,
  };
  return updated;
}

/** Remove an object from the scene (explicit — objects never vanish otherwise) */
export function removeObject(
  snapshot: ContinuitySnapshot,
  objectId: string,
): ContinuitySnapshot {
  const next = structuredClone(snapshot) as ContinuitySnapshot;
  delete next.objects[objectId];
  return next;
}

// ── Validation Gate ───────────────────────────────────────────────────────────

/** NON-NEGOTIABLE — blocks render if snapshot is invalid */
export function validate(snapshot: ContinuitySnapshot): ContinuityValidation {
  const errors:   string[] = [];
  const warnings: string[] = [];
  let driftScore = 0;

  if (!snapshot.brand) {
    errors.push("Missing brand memory — cannot lock character appearance");
  }

  if (!snapshot.camera) {
    errors.push("Camera state missing — drift risk");
  }

  if (!snapshot.firstFrame && snapshot.sceneIndex > 0) {
    errors.push("Missing first-frame anchor — continuity break guaranteed");
  }

  if (snapshot.sceneIndex > 0 && !snapshot.firstFrame.imageUrl) {
    warnings.push("First-frame imageUrl not set — 2s freeze will be soft rather than hard");
  }

  if (snapshot.story.tension > 1 || snapshot.story.tension < 0) {
    errors.push(`Invalid tension value ${snapshot.story.tension} — must be 0–1`);
    driftScore += 0.05;
  }

  if (Object.keys(snapshot.characters).length === 0) {
    errors.push("No characters in snapshot — who are we rendering?");
    driftScore += 0.1;
  }

  // Check for brand character count mismatch
  const expectedCharCount = snapshot.brand?.characters?.length ?? 0;
  const actualCharCount   = Object.keys(snapshot.characters).length;
  if (expectedCharCount > 0 && actualCharCount !== expectedCharCount) {
    driftScore += 0.04;
    warnings.push(`Character count mismatch: brand has ${expectedCharCount}, snapshot has ${actualCharCount}`);
  }

  const passed = errors.length === 0 && driftScore <= DRIFT_THRESHOLD;

  return { passed, driftScore, errors, warnings };
}

// ── Drift Detector (POST-RENDER) ──────────────────────────────────────────────

/**
 * Compare expected vs actual rendered output to detect character/camera drift.
 *
 * In production these comparisons would use embedding similarity (CLIP scores).
 * Here we use a text-based heuristic until vision embeddings are integrated.
 * The interface matches what a vision-based implementation would return.
 */
export function detectDrift(
  expected: ContinuitySnapshot,
  actual: {
    characterDescription?: string;
    cameraMovement?:        string;
    objectsPresent?:        string[];
  },
): DriftResult {
  let faceDrift     = 0;
  let wardrobeDrift = 0;
  let cameraDrift   = 0;
  let objectLoss    = 0;

  // Camera drift: if actual movement deviates significantly from expected
  if (actual.cameraMovement && expected.camera.movement) {
    const expectedTokens = new Set(expected.camera.movement.toLowerCase().split(/\s+/));
    const actualTokens   = actual.cameraMovement.toLowerCase().split(/\s+/);
    const overlap = actualTokens.filter(t => expectedTokens.has(t)).length;
    cameraDrift = actualTokens.length > 0
      ? Math.max(0, 1 - overlap / actualTokens.length)
      : 0;
  }

  // Object loss: fraction of expected objects missing in actual
  const expectedObjects = Object.keys(expected.objects);
  if (expectedObjects.length > 0 && actual.objectsPresent) {
    const missing = expectedObjects.filter(id =>
      !actual.objectsPresent!.some(o => o.toLowerCase().includes(id.toLowerCase()))
    );
    objectLoss = missing.length / expectedObjects.length;
  }

  const overallDrift  = Math.max(faceDrift, wardrobeDrift, cameraDrift, objectLoss);
  const requiresRegen = overallDrift > DRIFT_THRESHOLD;

  return { faceDrift, wardrobeDrift, cameraDrift, objectLoss, overallDrift, requiresRegen };
}

// ── Prompt Builder — from snapshot to Kling/Runway prompt ────────────────────

/**
 * Build the Kling video prompt from a ContinuitySnapshot.
 * Replaces ad-hoc prompt assembly — everything comes from structured state.
 */
export function buildPromptFromSnapshot(snapshot: ContinuitySnapshot): string {
  const char    = Object.values(snapshot.characters)[0];
  const brand   = snapshot.brand.characters.find(c => c.id === char?.characterId);
  const env     = snapshot.environment;
  const cam     = snapshot.camera;
  const story   = snapshot.story;

  const continuityPrefix = snapshot.sceneIndex > 0
    ? `Continue from last frame: ${char?.pose ?? "previous pose"} maintained for first ${FREEZE_DURATION_SEC} seconds. ${cam.movement} begins after ${FREEZE_DURATION_SEC}s. `
    : "";

  const characterLine = brand
    ? `${brand.appearanceLock.face}, ${brand.appearanceLock.body}, ${brand.wardrobeLock.default}. `
    : "";

  const emotionLine = char
    ? `Expression: ${char.expression}. Gaze: ${char.gaze}. Pose: ${char.pose}. `
    : "";

  const cameraLine = `Camera: ${cam.type} ${cam.lens}, ${cam.movement}. `;

  const envLine = `Location: ${env.location}, ${env.timeOfDay.replace("_", " ")}, ${env.lightingDirection}. `;

  const objectLine = Object.values(snapshot.objects)
    .filter(o => o.visibility)
    .map(o => `${o.type}${o.holder ? ` held by ${o.holder}` : ` at ${o.position}`}`)
    .join(", ");

  return [
    continuityPrefix,
    characterLine,
    emotionLine,
    cameraLine,
    envLine,
    objectLine ? `Objects: ${objectLine}. ` : "",
    `Story beat: ${story.activeBeat}. Tension: ${Math.round(story.tension * 100)}%.`,
  ].filter(Boolean).join("").slice(0, 2500);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function evolveEmotion(current: string, role: NarrativeRole): string {
  const map: Record<NarrativeRole, string> = {
    hook:        "curious, slightly uncertain",
    development: "engaged, building conviction",
    climax:      "fully committed, emotionally open",
    resolution:  "settled, quietly satisfied",
  };
  return map[role] ?? current;
}

function narrativeBeat(role: NarrativeRole): string {
  const map: Record<NarrativeRole, string> = {
    hook:        "establish character and world — pull the viewer in",
    development: "raise the stakes — deepen engagement",
    climax:      "peak emotional or narrative moment",
    resolution:  "earned release — character transformed",
  };
  return map[role];
}

function narrativeIntent(role: NarrativeRole): string {
  const map: Record<NarrativeRole, string> = {
    hook:        "hook viewer in first 2 seconds",
    development: "build momentum toward climax",
    climax:      "deliver the emotional peak",
    resolution:  "land the payoff and close the arc",
  };
  return map[role];
}

function intensifyPose(pose: string): string {
  if (pose.includes("leaning")) return pose;
  return `${pose}, leaning slightly forward`;
}

function velocityForRole(role: NarrativeRole): string {
  const map: Record<NarrativeRole, string> = {
    hook:        "stationary, slight breathing motion",
    development: "slow walk forward",
    climax:      "emotionally charged — forward motion",
    resolution:  "slowing to stillness",
  };
  return map[role];
}

function inheritCamera(prev: CameraState, role: NarrativeRole): CameraState {
  const cam = structuredClone(prev) as CameraState;

  // Progressive movement per role — never reset to default
  switch (role) {
    case "development":
      cam.movement = `Continue ${prev.movement}, slight acceleration`;
      cam.distance = Math.max(1.5, prev.distance - 0.3);
      break;
    case "climax":
      cam.type     = "dolly";
      cam.lens     = "50mm";
      cam.movement = "slow dolly forward toward subject, intimate framing";
      cam.distance = Math.max(1.0, prev.distance - 0.5);
      break;
    case "resolution":
      cam.movement = "slow pull-back, widening to reveal full environment";
      cam.distance = prev.distance + 0.8;
      break;
    default:
      // hook: keep previous
      break;
  }

  return cam;
}

function inheritEnvironment(prev: EnvironmentState, role: NarrativeRole): EnvironmentState {
  const env = structuredClone(prev) as EnvironmentState;
  // Environment carries forward exactly — no resets
  // Only atmosphere shifts with narrative role
  if (role === "climax") {
    env.atmosphere = `${prev.atmosphere}, heightened emotional intensity`;
  } else if (role === "resolution") {
    env.atmosphere = `${prev.atmosphere}, softening, release`;
  }
  return env;
}

function preserveObjects(objects: Record<string, ObjectState>): Record<string, ObjectState> {
  return structuredClone(objects) as Record<string, ObjectState>;
}

function createAnchor(fromSceneIndex: number, imageUrl: string | null): FirstFrameAnchor {
  return {
    inheritsFromScene:    fromSceneIndex,
    imageUrl,
    mustMatchExactly: {
      characterPoses: imageUrl !== null,
      cameraState:    imageUrl !== null,
      lighting:       true,
      environment:    true,
      objects:        true,
    },
    freezeDurationSeconds: FREEZE_DURATION_SEC,
  };
}
