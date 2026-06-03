// OMNYRA FINAL PRODUCTION ARCHITECTURE — 7 Typed Layer Contracts v1.0
// These contracts are the canonical type definitions across all system layers.
// Every layer boundary MUST use these types — no raw objects, no ad-hoc shapes.

// ────────────────────────────────────────────────────────────────────────────
// Layer 1: Brand State Contract
// Owns: character identity, environment bible, object registry
// ────────────────────────────────────────────────────────────────────────────

export interface CharacterIdentityContract {
  name: string;
  raw: string;                  // original brand description
  clothingLock: string[];       // items that must persist across frames
  accessoriesLock: string[];
  forbiddenDrift: string[];     // traits that must never change
  enforcementStrength: number;  // 0.0-1.0
}

export interface EnvironmentBibleContract {
  locationType: string;
  lightingRules: string[];
  atmosphere: string;
  forbiddenElements: string[];
  colorPalette?: string[];
}

export interface ObjectRegistryContract {
  persistentObjects: Array<{
    name: string;
    count: number;
    required: boolean;
    placementHint?: string;
  }>;
}

export interface BrandStateContract {
  brandId: string;
  version: string;
  character: CharacterIdentityContract | null;
  environment: EnvironmentBibleContract | null;
  objects: ObjectRegistryContract;
  lastUpdated: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Layer 2: Scene Grammar Contract
// Owns: visual grammar, narrative arc, composition rules
// ────────────────────────────────────────────────────────────────────────────

export interface SceneGrammarContract {
  cluster: string;              // scene cluster type
  compositionRule: string;      // visual grammar rule id
  motionProfile: "static" | "dynamic" | "rhythmic" | "flowing";
  colorTemperature: "warm" | "cool" | "neutral" | "high_contrast";
  paceRhythm: "fast_cut" | "slow_burn" | "pulse" | "continuous";
  narrativeArc: string;
  emotionalBeats: string[];
  openingHook: string;
  resolutionType: "definitive" | "open" | "cliffhanger" | "inspiring";
  confidenceScore: number;      // 0-100
}

// ────────────────────────────────────────────────────────────────────────────
// Layer 3: Physics Scene Contract
// Owns: force field simulation state per frame
// ────────────────────────────────────────────────────────────────────────────

export interface PhysicsFrameContract {
  frameIndex: number;
  characterStabilityScore: number;   // 0-100
  environmentDriftScore: number;     // 0-100 (higher = more drift)
  cameraCoherence: number;           // 0-100
  attentionFocus: number;            // 0-100
  emotionIntensity: number;          // 0-100
  constraintViolations: string[];
  physicsScore: number;              // 0-100 composite
}

export interface PhysicsSceneContract {
  totalFrames: number;
  frames: PhysicsFrameContract[];
  avgPhysicsScore: number;
  criticalFrames: number[];
  simulationSummary: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Layer 4: Prompt Execution Contract
// Owns: compiled prompts, AST version, enforcement config
// ────────────────────────────────────────────────────────────────────────────

export interface PromptExecutionContract {
  jobId: string;
  promptVersion: string;
  compiledPrompts: string[];          // one per scene
  globalConstraintSuffix: string;
  enforcementLevel: "low" | "medium" | "high" | "strict";
  continuityLocks: string[];
  estimatedRuntimeSeconds: number;
  optimizationsApplied: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Layer 5: Generation Output Contract
// Owns: provider results, asset URLs, timing metadata
// ────────────────────────────────────────────────────────────────────────────

export interface GeneratedClipContract {
  sceneIndex: number;
  assetUrl: string;
  provider: string;
  modelTier: string;
  generationTimeMs: number;
  durationSeconds: number;
  approved: boolean;
  retryCount: number;
}

export interface GenerationOutputContract {
  jobId: string;
  totalClips: number;
  clips: GeneratedClipContract[];
  totalGenerationTimeMs: number;
  totalCreditCost: number;
  completedAt: number;
  hardCapBreached: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Layer 6: Validation Report Contract
// Owns: Zero-Critic output, drift flags, recommendation
// ────────────────────────────────────────────────────────────────────────────

export interface ValidationScoresContract {
  characterConsistency: number;    // 0-100
  environmentConsistency: number;  // 0-100
  objectConsistency: number;       // 0-100
  motionQuality: number;           // 0-100
  overallScore: number;            // 0-100 weighted
}

export interface ValidationReportContract {
  jobId: string;
  sceneIndex: number;
  scores: ValidationScoresContract;
  driftFlags: string[];
  failureModes: Array<"character_drift" | "environment_shift" | "object_missing" | "motion_freeze" | "generation_failure">;
  recommendation: {
    action: "accept" | "retry" | "regenerate" | "tighten_constraints";
    notes: string;
    confidence: number;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Layer 7: Self-Heal Event Contract
// Owns: mutation description, A/B test state, promotion outcome
// ────────────────────────────────────────────────────────────────────────────

export interface SelfHealEventContract {
  trigger: "drift_detected";
  jobId: string;
  timestamp: number;
  analysis: {
    rootCause: string;
    affectedLayer: "brand" | "grammar" | "physics" | "prompt" | "generation";
    driftClusterType: string | null;
    driftClusterFrequency: string | null;
  };
  mutation: {
    type: "strengthen_constraint" | "add_negative_constraint" | "narrow_constraint" | "reorder_priority" | "reduce_ambiguity";
    previousVersion: string;
    targetVersion: string;
    description: string;
    expectedImprovementPct: number;
  };
  abTest: {
    testId: string;
    controlVersion: string;
    challengerVersion: string;
  } | null;
  outcome: "promoted" | "rolled_back" | "pending_ab_test";
}

// ────────────────────────────────────────────────────────────────────────────
// Cross-layer Pipeline Context
// ────────────────────────────────────────────────────────────────────────────

export interface OmnyraPipelineContext {
  jobId: string;
  userId: string;
  brandState: BrandStateContract;
  sceneGrammar: SceneGrammarContract;
  physicsScene: PhysicsSceneContract;
  promptExecution: PromptExecutionContract;
  generationOutput: GenerationOutputContract | null;
  validationReports: ValidationReportContract[];
  selfHealEvents: SelfHealEventContract[];
  pipelineStartedAt: number;
  pipelineStatus: "pending" | "generating" | "validating" | "healing" | "complete" | "failed";
}
