import type {
  ContinuitySnapshot,
  BrandMemoryV2,
  CharacterStateV2,
  ObjectState,
  TimeOfDay,
} from "../types";

/**
 * Factory — creates the initial snapshot for scene 0 (hook).
 * Called ONCE per project before rendering begins.
 */
export function createInitialSnapshot(
  projectId:        string,
  brand:            BrandMemoryV2,
  location:         string,
  emotion:          string,
  objects:          ObjectState[] = [],
  timeOfDay:        TimeOfDay = "golden_hour",
): ContinuitySnapshot {
  const characterStates: Record<string, CharacterStateV2> = {};
  for (const char of brand.characters) {
    characterStates[char.id] = {
      characterId: char.id,
      position:    "center frame",
      pose:        "standing, neutral weight",
      expression:  char.id === brand.characters[0]?.id ? emotion : "neutral",
      gaze:        "direct camera contact",
      velocity:    "stationary",
    };
  }

  const objectMap: Record<string, ObjectState> = {};
  for (const obj of objects) objectMap[obj.id] = obj;

  return {
    projectId,
    sceneIndex: 0,
    brand,
    story: {
      sceneIndex:       0,
      emotion,
      tension:          0.30,
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
      timeOfDay,
      weather:           "clear",
      lightingDirection: "45° left, top-light, Roger Deakins style",
      atmosphere:        "warm, naturalistic, cinematic",
      continuityFlags:   { roadWet: false, crowdDensity: 0.3, fogLevel: 0 },
    },
    objects: objectMap,
    firstFrame: {
      inheritsFromScene:    -1,
      imageUrl:             null,
      mustMatchExactly:     { characterPoses: false, cameraState: false, lighting: true, environment: true, objects: true },
      freezeDurationSeconds: 2,
    },
    validation: { passed: true, driftScore: 0, errors: [], warnings: [] },
    timestamps: { createdAt: Date.now() },
  };
}

/**
 * Attach the extracted last-frame URL to a snapshot after a clip renders.
 * Enables hard first-frame lock on the next scene.
 */
export function attachLastFrameToSnapshot(
  snapshot: ContinuitySnapshot,
  imageUrl: string,
): ContinuitySnapshot {
  return {
    ...snapshot,
    firstFrame: {
      ...snapshot.firstFrame,
      imageUrl,
      mustMatchExactly: {
        characterPoses: true,
        cameraState:    true,
        lighting:       true,
        environment:    true,
        objects:        true,
      },
    },
  };
}

/**
 * Explicit object removal — objects NEVER disappear unless this is called.
 */
export function removeObject(snapshot: ContinuitySnapshot, objectId: string): ContinuitySnapshot {
  const updated = structuredClone(snapshot) as ContinuitySnapshot;
  delete updated.objects[objectId];
  return updated;
}
