// Generative Cinematic Physics Engine v4
// Force-field scene simulation: character stability + environment drift + camera + attention + emotion

// ── Force Types ───────────────────────────────────────────────────────────────

export interface Vector2D {
  x: number;
  y: number;
}

export interface ForceField {
  type: "character_stability" | "environment_drift" | "camera_attraction" | "attention" | "emotion_gradient";
  strength: number;       // 0.0-1.0
  direction: Vector2D;
  decayRate: number;      // how fast the force diminishes (0.0-1.0)
  affectedRadius: number; // 0-100 (normalized scene units)
}

export interface ScenePhysicsState {
  frameIndex: number;
  characterStabilityScore: number; // 0-100 (100 = fully stable identity)
  environmentDriftScore: number;   // 0-100 (0 = maximum drift)
  cameraCoherence: number;         // 0-100
  attentionFocus: number;          // 0-100 (where viewer attention concentrates)
  emotionIntensity: number;        // 0-100
  activeForces: ForceField[];
  constraintViolations: string[];
}

export interface PhysicsConstraint {
  name: string;
  threshold: number;
  penaltyStrength: number;
  correctionForce: ForceField;
}

// ── Force Field Factories ─────────────────────────────────────────────────────

export function characterStabilityForce(
  identityScore: number,
  enforcementStrength = 0.9,
): ForceField {
  const deficit = Math.max(0, 100 - identityScore);
  return {
    type: "character_stability",
    strength: (deficit / 100) * enforcementStrength,
    direction: { x: 0, y: 1 }, // pushes toward stability
    decayRate: 0.05,
    affectedRadius: 80,
  };
}

export function environmentDriftForce(
  environmentScore: number,
  driftTolerance = 0.3,
): ForceField {
  const drift = Math.max(0, 100 - environmentScore) / 100;
  return {
    type: "environment_drift",
    strength: drift * (1 - driftTolerance),
    direction: { x: -1, y: 0 }, // resists environment change
    decayRate: 0.1,
    affectedRadius: 100,
  };
}

export function cameraAttractionField(
  targetCoherence: number,
  currentCoherence: number,
): ForceField {
  const delta = (targetCoherence - currentCoherence) / 100;
  return {
    type: "camera_attraction",
    strength: Math.abs(delta),
    direction: { x: delta > 0 ? 1 : -1, y: 0 },
    decayRate: 0.08,
    affectedRadius: 60,
  };
}

export function attentionField(
  subjectSaliency: number, // 0-100, how salient the primary subject is
): ForceField {
  return {
    type: "attention",
    strength: subjectSaliency / 100,
    direction: { x: 0, y: 0 }, // radial — pulls toward subject
    decayRate: 0.15,
    affectedRadius: 50,
  };
}

export function emotionGradientField(
  emotionIntensity: number,
  emotionType: "positive" | "negative" | "neutral" = "neutral",
): ForceField {
  const directionMap = {
    positive: { x: 1, y: 1 },
    negative: { x: -1, y: -1 },
    neutral: { x: 0, y: 0 },
  };
  return {
    type: "emotion_gradient",
    strength: emotionIntensity / 100,
    direction: directionMap[emotionType],
    decayRate: 0.2,
    affectedRadius: 70,
  };
}

// ── Physics Constraints ───────────────────────────────────────────────────────

const PHYSICS_CONSTRAINTS: PhysicsConstraint[] = [
  {
    name: "character_identity_floor",
    threshold: 70,
    penaltyStrength: 0.8,
    correctionForce: characterStabilityForce(0, 1.0),
  },
  {
    name: "environment_stability_floor",
    threshold: 65,
    penaltyStrength: 0.6,
    correctionForce: environmentDriftForce(0, 0.0),
  },
  {
    name: "camera_coherence_floor",
    threshold: 60,
    penaltyStrength: 0.5,
    correctionForce: cameraAttractionField(80, 0),
  },
];

// ── Constraint Solver ─────────────────────────────────────────────────────────

export function solveConstraints(state: ScenePhysicsState): ScenePhysicsState {
  const violations: string[] = [];
  const correctionForces: ForceField[] = [];

  for (const constraint of PHYSICS_CONSTRAINTS) {
    let score: number;
    switch (constraint.name) {
      case "character_identity_floor": score = state.characterStabilityScore; break;
      case "environment_stability_floor": score = 100 - state.environmentDriftScore; break;
      case "camera_coherence_floor": score = state.cameraCoherence; break;
      default: score = 100;
    }

    if (score < constraint.threshold) {
      violations.push(`${constraint.name}: score ${score} below threshold ${constraint.threshold}`);
      correctionForces.push({
        ...constraint.correctionForce,
        strength: constraint.correctionForce.strength * constraint.penaltyStrength,
      });
    }
  }

  // Apply correction forces
  let newCharScore = state.characterStabilityScore;
  let newEnvScore = state.environmentDriftScore;
  let newCamCoherence = state.cameraCoherence;

  for (const force of correctionForces) {
    if (force.type === "character_stability") {
      newCharScore = Math.min(100, newCharScore + force.strength * 20);
    }
    if (force.type === "environment_drift") {
      newEnvScore = Math.max(0, newEnvScore - force.strength * 15);
    }
    if (force.type === "camera_attraction") {
      newCamCoherence = Math.min(100, newCamCoherence + force.strength * 10);
    }
  }

  return {
    ...state,
    characterStabilityScore: Math.round(newCharScore),
    environmentDriftScore: Math.round(newEnvScore),
    cameraCoherence: Math.round(newCamCoherence),
    activeForces: [...state.activeForces, ...correctionForces],
    constraintViolations: violations,
  };
}

// ── Scene State Initializer ───────────────────────────────────────────────────

export function initScenePhysicsState(
  frameIndex: number,
  characterScore = 100,
  environmentScore = 100,
  emotionIntensity = 50,
): ScenePhysicsState {
  const forces: ForceField[] = [
    characterStabilityForce(characterScore),
    environmentDriftForce(environmentScore),
    cameraAttractionField(80, 70),
    attentionField(characterScore),
    emotionGradientField(emotionIntensity),
  ];

  return {
    frameIndex,
    characterStabilityScore: characterScore,
    environmentDriftScore: 100 - environmentScore,
    cameraCoherence: 75,
    attentionFocus: Math.round((characterScore + emotionIntensity) / 2),
    emotionIntensity,
    activeForces: forces,
    constraintViolations: [],
  };
}

// ── Frame Render Compiler ─────────────────────────────────────────────────────

export interface PhysicsFrameDirective {
  frameIndex: number;
  stabilityAnnotation: string;
  attentionDirective: string;
  emotionDirective: string;
  correctionNotes: string[];
  physicsScore: number; // 0-100 composite
}

export function compileFrameDirective(state: ScenePhysicsState): PhysicsFrameDirective {
  const physicsScore = Math.round(
    (state.characterStabilityScore * 0.4) +
    ((100 - state.environmentDriftScore) * 0.3) +
    (state.cameraCoherence * 0.2) +
    (state.attentionFocus * 0.1),
  );

  const stabilityLabel = state.characterStabilityScore >= 85 ? "STABLE"
    : state.characterStabilityScore >= 70 ? "MODERATE"
    : "CRITICAL";

  const attentionLabel = state.attentionFocus >= 75 ? "HIGH FOCUS"
    : state.attentionFocus >= 50 ? "MODERATE FOCUS"
    : "LOW FOCUS";

  return {
    frameIndex: state.frameIndex,
    stabilityAnnotation: `CHARACTER_STABILITY: ${stabilityLabel} (${state.characterStabilityScore}/100)`,
    attentionDirective: `ATTENTION: ${attentionLabel} (${state.attentionFocus}/100)`,
    emotionDirective: `EMOTION_INTENSITY: ${state.emotionIntensity}/100`,
    correctionNotes: state.constraintViolations,
    physicsScore,
  };
}

// ── Multi-Frame Simulation ────────────────────────────────────────────────────

export interface PhysicsSimulationResult {
  frames: PhysicsFrameDirective[];
  avgPhysicsScore: number;
  criticalFrames: number[];
  summary: string;
}

export function simulateScenePhysics(
  sceneCount: number,
  initialCharScore = 100,
  initialEnvScore = 100,
  initialEmotion = 50,
): PhysicsSimulationResult {
  const frames: PhysicsFrameDirective[] = [];
  const criticalFrames: number[] = [];

  let charScore = initialCharScore;
  let envScore = initialEnvScore;

  for (let i = 0; i < sceneCount; i++) {
    // Natural drift each frame
    charScore = Math.max(0, charScore - Math.random() * 5);
    envScore = Math.max(0, envScore - Math.random() * 3);
    const emotion = Math.min(100, initialEmotion + i * 3);

    let state = initScenePhysicsState(i, charScore, envScore, emotion);
    state = solveConstraints(state);

    const directive = compileFrameDirective(state);
    frames.push(directive);

    if (directive.physicsScore < 60) criticalFrames.push(i);

    // Post-solve update scores for next frame
    charScore = state.characterStabilityScore;
    envScore = 100 - state.environmentDriftScore;
  }

  const avgScore = Math.round(frames.reduce((s, f) => s + f.physicsScore, 0) / frames.length);

  return {
    frames,
    avgPhysicsScore: avgScore,
    criticalFrames,
    summary: `${sceneCount} scenes simulated. Avg physics score: ${avgScore}/100. Critical frames: ${criticalFrames.length}.`,
  };
}
