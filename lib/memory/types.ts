// Shared TypeScript types for the Character Memory system.
// Consumed by character-memory.ts, consistency-scorer.ts, video-quality-scorer.ts,
// and kling-worker.ts.

export type ReferenceSource = "flux_sheet" | "kling_frame" | "user_upload" | "video_ref";

export type ReferencePoseLabel =
  | "front"
  | "side"
  | "three_quarter"
  | "emotional"
  | "tender"
  | "fullbody"
  | "generated"
  | (string & NonNullable<unknown>); // allow free-form labels

export interface CharacterReference {
  id:               string;
  character_id:     string;
  user_id:          string;
  image_url:        string;
  source:           ReferenceSource;
  pose_label:       ReferencePoseLabel | null;
  is_primary:       boolean;
  quality_score:    number;           // 0.0–1.0
  is_video_reference: boolean;
  source_video_url: string | null;
  frame_count:      number | null;
  is_approved:      boolean;
  approved_at:      string | null;
  created_at:       string;
}

export interface ReferenceQualityMetrics {
  clarity:       number;  // 0-1 — how sharp and clear the character is
  pose_utility:  number;  // 0-1 — usefulness as Kling i2v input (front-facing, good angle)
  lighting:      number;  // 0-1 — lighting quality for generation
  artifact:      number;  // 0-1 — absence of AI artifacts (higher = fewer artifacts)
  overall:       number;  // weighted average
}

export interface ReferenceQualityResult {
  imageUrl:   string;
  score:      number;                   // 0.0–1.0 (mirrors ReferenceQualityMetrics.overall)
  metrics:    ReferenceQualityMetrics;
  isApproved: boolean;                  // true when score >= AUTO_APPROVE_THRESHOLD
  reason:     string;                   // human-readable assessment
}

export interface ConsistencyResult {
  score:          number;
  shouldRetry:    boolean;
  referenceCount: number;
  characterId:    string;
  detail:         string;
}

export interface CharacterMemoryContext {
  id:               string;
  name:             string;
  ref_frame_url:    string | null;
  core_prompt:      string;
  visual_signature: string;
  neg_prompt:       string;
  voice_id:         string | null;
  hasImage:         boolean;
  is_stylized:      boolean;
}
