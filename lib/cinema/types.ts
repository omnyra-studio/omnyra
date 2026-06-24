// ── Core type contracts for the cinematic planning pipeline ──────────────────
// These types flow from Beat Director → Shot Planner → Scene Graph → Prompt Compiler.
// The RenderContract is the ONLY thing Kling/Runway ever receives — never raw script.

export type ShotType =
  | 'wide'
  | 'medium'
  | 'close-up'
  | 'over-shoulder'
  | 'pov'
  | 'tracking'
  | 'drone'
  | 'insert'
  | 'reaction';

export type CameraMovement =
  | 'static'
  | 'slow push in'
  | 'slow pull back'
  | 'slow pan left'
  | 'slow pan right'
  | 'tracking left'
  | 'tracking right'
  | 'handheld'
  | 'tilt up'
  | 'tilt down';

export type NarrativeRole =
  | 'establish'
  | 'introduce'
  | 'conflict'
  | 'reaction'
  | 'development'
  | 'climax'
  | 'resolution';

export type PacingStyle = 'slow' | 'moderate' | 'intense' | 'still';

// ── Beat ─────────────────────────────────────────────────────────────────────

export interface CinematicBeat {
  index:               number;
  purpose:             string;
  emotion:             string;
  visualObjective:     string;
  characterAction:     string;     // single, filmable action completable in 5-10s
  cameraIntention:     string;
  transitionTarget:    string;
  objectsIntroduced:   string[];
  objectsRemoved:      string[];
  environment:         string;
  lighting:            string;
  narrativeProgression: string;
  narrativeRole:       NarrativeRole;
  pacing:              PacingStyle;
  narration:           string;     // punchy per-beat voiceover (not full script paragraph)
}

// ── Shot Plan ─────────────────────────────────────────────────────────────────

export interface ShotPlan {
  beatIndex:    number;
  shotType:     ShotType;
  movement:     CameraMovement;
  focalLength:  string;     // e.g. '35mm wide', '85mm portrait'
  framing:      string;     // e.g. 'subject centered', 'rule of thirds left'
  lensNote:     string;     // visual quality note, e.g. 'shallow depth of field'
}

// ── Narration ─────────────────────────────────────────────────────────────────

export interface NarrationBeat {
  beatIndex:   number;
  text:        string;
  pauseAfter:  number;    // ms of silence after this line
}

// ── Scene Graph Node (source of truth) ───────────────────────────────────────

export interface SceneGraphNode {
  index:            number;
  beat:             CinematicBeat;
  shot:             ShotPlan;
  narration:        NarrationBeat;
  previousIndex:    number | null;
  nextIndex:        number | null;
  renderContract:   RenderContract | null;
  validationStatus: 'pending' | 'passed' | 'rejected' | 'repaired';
  rejectionReason?: string;
}

// ── Render Contract (the ONLY input Kling/Runway accepts) ────────────────────
// Never contains raw screenplay text, dialogue, or paragraph narration.

export interface RenderContract {
  nodeIndex:      number;
  prompt:         string;         // ≤500 chars, structured cinematic instruction
  negativePrompt: string;
  characterState: string;
  cameraState:    string;
  environment:    string;
  lighting:       string;
  shotPurpose:    string;
  action:         string;
  emotion:        string;
  transition:     string;
  continuityLock: string;
  narrativeRole:  NarrativeRole;
}

// ── Pipeline Output ───────────────────────────────────────────────────────────

export interface CinemaPipelineResult {
  beats:              CinematicBeat[];
  shots:              ShotPlan[];
  narrations:         NarrationBeat[];
  sceneGraph:         SceneGraphNode[];
  renderContracts:    RenderContract[];
  compositeNarration: string;    // per-beat narrations joined for ElevenLabs
  validationReport:   string[];
  // Studio Grade additions — all optional for backwards compatibility
  intent?:            DirectorIntent;
  rhythms?:           SceneRhythm[];
  motifs?:            VisualMotif[];
  editingPlan?:       EditingPlan;
  continuityScores?:  ContinuityConfidence[];
}

// ── Repetition flags ──────────────────────────────────────────────────────────

export interface RepetitionFlag {
  nodeIndex:    number;
  dimension:    'action' | 'framing' | 'emotion' | 'purpose';
  description:  string;
}

// ── Director Intent ───────────────────────────────────────────────────────────

export type FilmPace    = 'slow' | 'medium' | 'fast' | 'slow-then-fast' | 'fast-then-slow';
export type FilmEnding  = 'hopeful' | 'bittersweet' | 'triumphant' | 'open' | 'resolved' | 'ambiguous';

export interface DirectorIntent {
  theme:             string;   // e.g. "unexpected kindness"
  genre:             string;   // e.g. "cinematic realism"
  pace:              FilmPace;
  audience:          string;
  emotionalCurve:    string;   // e.g. "isolation → connection → quiet hope"
  visualLanguage:    string;   // e.g. "naturalistic, handheld, close observation"
  editingRhythm:     string;   // e.g. "long takes first half, faster cuts second half"
  colourLanguage:    string;   // e.g. "desaturated blues warming to golden"
  cameraPhilosophy:  string;   // e.g. "observational — camera discovers, doesn't lead"
  ending:            FilmEnding;
  dominantTexture:   string;   // e.g. "grain, soft focus, warm practical light"
}

// ── Film Rhythm ───────────────────────────────────────────────────────────────

export type RhythmPace = 'still' | 'slow' | 'medium' | 'fast' | 'hold';

export interface SceneRhythm {
  beatIndex:        number;
  pace:             RhythmPace;
  holdSeconds:      number;    // how long to breathe before cutting
  cutTiming:        'immediate' | 'on-beat' | 'delayed';
  narrativePressure: number;   // 0–1, rises toward climax
}

// ── Visual Motif ──────────────────────────────────────────────────────────────

export interface VisualMotif {
  object:           string;
  firstAppears:     number;    // beat index
  reappears:        number[];
  emotionalMeaning: string;
  isAnchor:         boolean;   // true = recurring emotional symbol
  transformsAt:     number | null; // beat index where meaning shifts
}

// ── Silent Moment (no narration, only ambience) ───────────────────────────────

// NarrationBeat extended with silence support
// (NarrationBeat is extended not replaced — backwards compatible)
export interface NarrationBeatFull extends NarrationBeat {
  isSilent:     boolean;
  ambienceNote: string;
}

// ── Continuity Confidence ─────────────────────────────────────────────────────

export interface ContinuityConfidence {
  beatIndex:   number;
  character:   number;   // 0–100
  camera:      number;   // 0–100
  emotion:     number;   // 0–100
  objects:     number;   // 0–100
  lighting:    number;   // 0–100
  composite:   number;   // weighted average
  pass:        boolean;  // composite >= CONFIDENCE_THRESHOLD
  failReason?: string;
}

// ── Editing Plan ──────────────────────────────────────────────────────────────

export type CutType =
  | 'hard-cut'
  | 'match-cut'
  | 'l-cut'
  | 'j-cut'
  | 'crossfade'
  | 'fade-in'
  | 'fade-out'
  | 'hold'
  | 'smash-cut';

export interface EditingInstruction {
  fromBeatIndex:  number;
  toBeatIndex:    number | null;  // null = last scene (end)
  cutType:        CutType;
  transitionMs:   number;         // duration of transition
  audioHandling:  'hard' | 'blend' | 'carry-over' | 'silence';
  note:           string;
}

export interface EditingPlan {
  instructions:   EditingInstruction[];
  openingFadeMs:  number;
  closingFadeMs:  number;
  totalDurationMs: number;
}
