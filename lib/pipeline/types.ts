/**
 * Omnyra Pipeline — Canonical Type System
 *
 * INVARIANT: No artifact defines its own downstream structure.
 *   Voice cannot define scenes.
 *   Scenes cannot redefine DirectorPlan.
 *   Video cannot redefine SceneContracts.
 *   Everything compiles downward. Nothing is inferred sideways.
 *
 * Compile order:
 *   DirectorPlan → SceneSkeletons → VoiceTiming → SceneContracts → Execution
 */

// ── Primitives ────────────────────────────────────────────────────────────────

export type NarrativeRole = "hook" | "development" | "climax" | "resolution";
export type TransitionType = "cut" | "fade" | "match_cut" | "l_cut" | "j_cut";
export type StageStatus   = "pending" | "running" | "done" | "failed";

// ── Cinematic grammar — locked by DirectorPlan ────────────────────────────────

export interface CameraSpec {
  lens:      string;  // "50mm" — never "cinematic"
  shotSize:  string;  // "medium close-up"
  movement:  string;  // "slow push in"
  dof:       string;  // "shallow, background blurred"
  height:    string;  // "eye level"
  framing:   string;  // "subject left third, window right"
}

// ── Character Bible — locked at DirectorPlan, never mutated ──────────────────

export interface CharacterSpec {
  name:           string;
  age:            string;   // "woman in her early 30s"
  sex:            string;
  hair:           string;   // "shoulder-length wavy auburn hair"
  eyes:           string;
  skinTone:       string;
  clothing:       string;   // LOCKED — exact clothing, never changes
  accessories:    string;   // "none" or exact item list
  facialFeatures: string;
  bodyType:       string;
  promptFragment: string;   // verbatim 30-40 word block — injected into EVERY prompt
}

// ── Location Bible — locked at DirectorPlan ───────────────────────────────────

export interface LocationSpec {
  name:           string;
  environment:    string;
  lighting:       string;   // "golden hour side-lighting, warm orange, soft shadows"
  weather:        string;
  timeOfDay:      string;
  colors:         string;
  promptFragment: string;   // verbatim 20-30 word block for prompts
}

// ── Layer 1: DirectorPlan — global production constraints ─────────────────────
// Created first. Nothing downstream may contradict it.

export interface DirectorPlan {
  title:        string;
  logline:      string;
  emotionalArc: string;
  characters:   CharacterSpec[];
  locations:    LocationSpec[];
  cameraLanguage: {
    dominantLens:    string;
    colorGrade:      string;
    lightingApproach: string;
    motionStyle:     string;
  };
  voiceId:     string;
  niche:       string;
  sceneCount:  number;
}

// ── Layer 2: SceneSkeleton — visual intent without timing ─────────────────────
// Defines WHAT each scene IS.
// NO duration field — that is the Voice Engine's authority.

export type MotionClass = "cinematic" | "fast" | "standard";

export interface SceneSkeleton {
  index:            number;
  narrativeRole:    NarrativeRole;
  narrationBeat:    string;       // words spoken in this visual unit (from script)
  actionUnit:       string;       // ONE action only — "turns slowly to face camera"
  emotionalState:   string;       // single word
  motion:           MotionClass;  // routing hint: cinematic→gen4_turbo, fast→kling, standard→gen4_turbo
  characterIndices: number[];     // indices into DirectorPlan.characters
  locationIndex:    number;       // index into DirectorPlan.locations
  requiredProps:    string[];
  forbiddenElements: string[];
  cameraOverride?:  Partial<CameraSpec>; // per-scene deviation from plan defaults
  transitionOut:    TransitionType;
}

// ── Layer 3: VoiceTiming — temporal authority from ElevenLabs ─────────────────
// Generated from SceneSkeletons. Voice Engine owns duration.
// SceneSkeletons CONSTRAIN the voice. Voice FINALIZES timing.

export interface VoiceTiming {
  sceneIndex:          number;
  startMs:             number;
  endMs:               number;
  durationMs:          number;
  pauseAfterMs:        number;    // silence before next scene clip starts
  wordCount:           number;
  inflectionMarkers:   string[];  // emotional cues (e.g. "pause", "emphasis")
}

export interface VoiceEngineResult {
  audioUrl:    string;
  totalDurationMs: number;
  timings:     VoiceTiming[];  // one per scene skeleton, ordered
}

// ── Layer 4: SceneContract — compiled artifact, NOT a creative output ─────────
// Built by the ContractCompiler from: SceneSkeleton + VoiceTiming + DirectorPlan
// Immutable once compiled. Downstream stages READ ONLY.

export interface SceneContract {
  // Identity
  index:         number;
  narrativeRole: NarrativeRole;

  // Timing (from VoiceTiming — authoritative)
  durationSec:    number;        // rounded up to nearest 5 or 10 for Runway
  clipDurationSec: 5 | 10;       // actual Runway clip request duration
  voiceStartMs:   number;
  voiceEndMs:     number;

  // Content (from SceneSkeleton)
  narrationText:    string;
  action:           string;
  emotion:          string;
  motion:           MotionClass;
  requiredProps:    string[];
  forbiddenElements: string[];
  transitionOut:    TransitionType;

  // Resolved references (from DirectorPlan)
  characters:       CharacterSpec[];
  location:         LocationSpec;
  camera:           CameraSpec;

  // Locked generation prompts (compiled, never regenerated)
  imagePrompt: string;   // Flux prompt — includes verbatim character + location fragments
  videoPrompt: string;   // Runway prompt — ONE motion, camera spec, 30-40 words
  negativePrompt: string;
}

// ── Layer 5: TemporalLedger — global sync tracking ───────────────────────────
// Tracks every millisecond of overhead. Applied during assembly to achieve
// deterministic audio-video sync. Eliminates "almost correct but slightly off".

export interface TemporalLedgerEntry {
  sceneIndex:           number;
  voiceStartMs:         number;
  voiceEndMs:           number;
  voiceDurationMs:      number;
  clipRequestedDurationMs: number;  // what we ask Runway for
  clipActualDurationMs?:   number;  // measured after generation
  transitionDurationMs: number;
  syncOffsetMs:         number;     // drift: clipActual - voiceDuration
  correctedDurationMs:  number;     // after ledger correction applied
}

export interface TemporalLedger {
  totalVoiceDurationMs:         number;
  totalClipDurationMs:          number;
  totalTransitionOverheadMs:    number;
  cumulativeDriftMs:            number;  // positive = video runs long, negative = short
  entries:                      TemporalLedgerEntry[];
  assemblyStrategy: "trim_last" | "extend_last" | "pad_silence" | "exact";
}

// ── Pipeline I/O ──────────────────────────────────────────────────────────────

export interface PipelineInput {
  script:             string;
  voiceId:            string;
  niche:              string;
  referenceImageUrl?: string;
  userId:             string;
  targetDuration:     30 | 60 | 90;
  speedMode:          "fast" | "quality";
  aspectRatio?:       "9:16" | "16:9";
}

export interface SceneOutput {
  index:          number;
  imageUrl:       string;
  clipUrl:        string | null;
  durationSec:    number;
  provider:       string;
  imageAttempts:  number;
  clipAttempts:   number;
  passed:         boolean;
  visionScore?:   number;   // 0–1 from vision validator; undefined if check skipped
  visionIssues?:  string[]; // violations detected; empty if clean
}

export interface PipelineResult {
  videoUrl:        string;
  audioUrl:        string;
  durationSeconds: number;
  sceneCount:      number;
  scenes:          SceneOutput[];
  qualityScore:    number;
}

// ── Continuity Memory — last-scene state threaded through the loop ────────────
// No databases. No bibles. Just the previous scene's locked state.
// Passed to the vision validator for continuity checks.

export interface ContinuityMemory {
  lastScene: {
    sceneIndex:   number;
    characters:   string[];   // character names
    props:        string[];   // requiredProps
    location:     string;     // location name
    emotion:      string;
    clothing:     string;     // locked clothing description — must not change
  } | null;
}

export function createMemory(): ContinuityMemory {
  return { lastScene: null };
}

export function updateMemory(memory: ContinuityMemory, contract: SceneContract): ContinuityMemory {
  return {
    lastScene: {
      sceneIndex: contract.index,
      characters: contract.characters.map(c => c.name),
      props:      contract.requiredProps,
      location:   contract.location.name,
      emotion:    contract.emotion,
      clothing:   contract.characters[0]?.clothing ?? "",
    },
  };
}

// ── Provider routing — deterministic, no AI logic ─────────────────────────────
// Simple if/else. Never scoring, never fuzzy.

export type MediaProvider = "flux" | "gen4_turbo" | "seedance2" | "kling" | "elevenlabs";

export function selectProvider(
  task:      "image" | "video" | "voice",
  contract?: Pick<SceneContract, "narrativeRole" | "action" | "motion">,
): MediaProvider {
  if (task === "voice") return "elevenlabs";
  if (task === "image") return "flux";

  // Video: route by motion class first, then narrative role
  // fast      → Kling (reactive, fast motion)
  // cinematic → gen4_turbo (stable, locked camera)
  // climax    → Seedance2 (high motion fidelity, longer continuity)
  // default   → gen4_turbo
  if (task === "video") {
    if (contract?.motion === "fast") return "kling";
    if (contract?.narrativeRole === "climax") return "seedance2";
    return "gen4_turbo";
  }

  return "gen4_turbo";
}

// ── Retry policy ──────────────────────────────────────────────────────────────

export type RetryCategory =
  | "transient_network"
  | "rate_limit"
  | "provider_error"
  | "content_policy"
  | "validation_failed"
  | "unrecoverable";

export interface RetryDecision {
  shouldRetry:   boolean;
  delayMs:       number;
  maxAttempts:   number;
  category:      RetryCategory;
  switchProvider: boolean;
  reason:        string;
}
