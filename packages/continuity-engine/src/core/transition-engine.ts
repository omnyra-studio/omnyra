import type {
  ContinuitySnapshot,
  NarrativeRole,
  CameraState,
  EnvironmentState,
  CharacterStateV2,
} from "../types";

const NARRATIVE_ORDER: NarrativeRole[] = ["hook", "development", "climax", "resolution"];

const TENSION_CURVE: Record<NarrativeRole, number> = {
  hook:        0.30,
  development: 0.55,
  climax:      0.85,
  resolution:  0.20,
};

const VELOCITY_MAP: Record<NarrativeRole, string> = {
  hook:        "stationary, slight breathing motion",
  development: "slow walk forward",
  climax:      "emotionally charged, forward lean",
  resolution:  "slowing to stillness",
};

/**
 * Core state machine function.
 *
 * Takes the current snapshot and returns the NEXT scene's snapshot.
 * NEVER mutates the input — always clones first.
 * All state carries forward unless explicitly evolved.
 */
export function buildNextScene(
  snapshot:      ContinuitySnapshot,
  nextBeat?:     string,
  nextEmotion?:  string,
  lastFrameUrl?: string,
): ContinuitySnapshot {
  const next = structuredClone(snapshot) as ContinuitySnapshot;

  const nextRole: NarrativeRole = NARRATIVE_ORDER[(snapshot.sceneIndex + 1) % 4];

  // 1. Advance indexes
  next.sceneIndex       += 1;
  next.story.sceneIndex += 1;
  next.story.arcPosition = Math.min(1, (next.sceneIndex) / 4);

  // 2. Evolve narrative state
  next.story.tension    = TENSION_CURVE[nextRole];
  next.story.emotion    = nextEmotion ?? defaultEmotion(nextRole);
  next.story.activeBeat = nextBeat    ?? defaultBeat(nextRole);
  next.story.nextIntent = defaultIntent(nextRole);

  // 3. Evolve characters — appearance LOCKED, expression/pose evolves
  for (const charId of Object.keys(next.characters)) {
    const prev = snapshot.characters[charId];
    if (!prev) continue;
    const evolved: CharacterStateV2 = {
      ...prev,
      expression: next.story.emotion,
      pose:       nextRole === "climax" ? intensifyPose(prev.pose) : prev.pose,
      velocity:   VELOCITY_MAP[nextRole],
    };
    next.characters[charId] = evolved;
  }

  // 4. Inherit camera with role-based progression — never reset
  next.camera = evolveCamera(snapshot.camera, nextRole);

  // 5. Evolve environment — all flags carry forward, only atmosphere shifts
  next.environment = evolveEnvironment(snapshot.environment, nextRole);

  // 6. Objects carry forward unchanged (use removeObject() to remove)
  // (already cloned via structuredClone above)

  // 7. First-frame anchor for this new scene
  next.firstFrame = {
    inheritsFromScene: snapshot.sceneIndex,
    imageUrl:          lastFrameUrl ?? null,
    mustMatchExactly: {
      characterPoses: lastFrameUrl !== null,
      cameraState:    lastFrameUrl !== null,
      lighting:       true,
      environment:    true,
      objects:        true,
    },
    freezeDurationSeconds: 2,
  };

  next.timestamps = { createdAt: Date.now() };

  return next;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function evolveCamera(prev: CameraState, role: NarrativeRole): CameraState {
  const cam = structuredClone(prev) as CameraState;
  switch (role) {
    case "development":
      cam.movement = `Continue ${prev.movement}, slight acceleration`;
      cam.distance = Math.max(1.5, prev.distance - 0.3);
      break;
    case "climax":
      cam.type     = "dolly";
      cam.lens     = "50mm";
      cam.movement = "slow dolly forward — intimate framing, subject fills frame";
      cam.distance = Math.max(1.0, prev.distance - 0.5);
      break;
    case "resolution":
      cam.movement = "slow pull-back, widening to reveal full environment";
      cam.distance = prev.distance + 0.8;
      break;
    default: break;
  }
  return cam;
}

function evolveEnvironment(prev: EnvironmentState, role: NarrativeRole): EnvironmentState {
  const env = structuredClone(prev) as EnvironmentState;
  if (role === "climax") {
    env.atmosphere = `${prev.atmosphere}, heightened emotional intensity`;
  } else if (role === "resolution") {
    env.atmosphere = `${prev.atmosphere}, softening, release`;
  }
  return env;
}

function intensifyPose(pose: string): string {
  return pose.includes("leaning") ? pose : `${pose}, leaning slightly forward`;
}

function defaultEmotion(role: NarrativeRole): string {
  const map: Record<NarrativeRole, string> = {
    hook:        "curious, slightly uncertain",
    development: "engaged, building conviction",
    climax:      "fully committed, emotionally open",
    resolution:  "settled, quietly satisfied",
  };
  return map[role];
}

function defaultBeat(role: NarrativeRole): string {
  const map: Record<NarrativeRole, string> = {
    hook:        "establish character and world — pull viewer in",
    development: "raise the stakes — deepen engagement",
    climax:      "peak emotional or narrative moment",
    resolution:  "earned release — character transformed",
  };
  return map[role];
}

function defaultIntent(role: NarrativeRole): string {
  const map: Record<NarrativeRole, string> = {
    hook:        "hook viewer in first 2 seconds",
    development: "build momentum toward climax",
    climax:      "deliver the emotional peak",
    resolution:  "land the payoff and close the arc",
  };
  return map[role];
}
