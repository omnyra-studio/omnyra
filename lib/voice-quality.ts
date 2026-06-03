// Voice cloning quality validation and TTS script optimization

export type VoiceQualityScore = "Poor" | "Fair" | "Good" | "Excellent";

export interface VoiceValidationResult {
  valid: boolean;
  qualityScore: VoiceQualityScore;
  estimatedDurationSec: number;
  warnings: string[];
  errors: string[];
}

// ── Audio size → duration constants (128 kbps MP3 baseline) ──────────────────
const BYTES_PER_SEC = 16_000;

const THRESHOLD_30S  = 30 * BYTES_PER_SEC;   // 480 KB minimum
const THRESHOLD_90S  = 90 * BYTES_PER_SEC;   // 1.44 MB recommended
const THRESHOLD_180S = 180 * BYTES_PER_SEC;  // 2.88 MB ideal (3 min)
const MAX_BYTES      = 25 * 1_000_000;       // 25 MB hard cap

const ALLOWED_MIME = new Set([
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav",
  "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/webm", "audio/ogg",
]);
const ALLOWED_EXT = /\.(mp3|wav|m4a|ogg|webm)$/i;

// ── Sample validation ─────────────────────────────────────────────────────────

export function validateVoiceSample(file: File): VoiceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Format check
  const validFormat = ALLOWED_MIME.has(file.type) || ALLOWED_EXT.test(file.name);
  if (!validFormat) {
    errors.push("Unsupported format. Use MP3, WAV, or M4A for best results.");
  }

  // Size / duration estimate
  const estimatedDurationSec = Math.round(file.size / BYTES_PER_SEC);

  if (file.size > MAX_BYTES) {
    errors.push(`File too large (${Math.round(file.size / 1_000_000)}MB). Maximum 25MB per sample.`);
  } else if (file.size < THRESHOLD_30S) {
    errors.push(
      `Sample too short (~${estimatedDurationSec}s). Minimum 30 seconds required for ElevenLabs cloning. ` +
      `Record yourself speaking naturally for 1–3 minutes for best results.`,
    );
  } else if (file.size < THRESHOLD_90S) {
    warnings.push(
      `Short sample (~${estimatedDurationSec}s). ElevenLabs recommends 90+ seconds for accurate voice capture. ` +
      `The clone may miss nuances of your voice.`,
    );
  } else if (file.size < THRESHOLD_180S) {
    warnings.push(
      `Good sample length (~${estimatedDurationSec}s). For best accuracy, 3 minutes of clear speech is ideal.`,
    );
  }

  // Quality score
  let qualityScore: VoiceQualityScore;
  if (errors.length > 0) {
    qualityScore = "Poor";
  } else if (file.size >= THRESHOLD_180S) {
    qualityScore = "Excellent";
  } else if (file.size >= THRESHOLD_90S) {
    qualityScore = "Good";
  } else {
    qualityScore = "Fair";
  }

  return { valid: errors.length === 0, qualityScore, estimatedDurationSec, warnings, errors };
}

// ── Script optimization for natural TTS delivery ──────────────────────────────
// ElevenLabs responds well to natural punctuation and sentence rhythm.
// We insert natural pause markers (...) at long sentence breaks and
// normalize whitespace/punctuation so the model breathes naturally.

export function optimizeScriptForTTS(text: string): string {
  let s = text.trim();

  // Normalize smart quotes and dashes
  s = s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  s = s.replace(/—/g, " — ").replace(/–/g, " – ");

  // Sentence chunking: insert short pause after sentence-ending punctuation
  // that is followed by a capital letter (start of new sentence)
  s = s.replace(/([.!?])\s+([A-Z])/g, "$1 ... $2");

  // Breathing points at long comma-separated clauses (>40 chars before comma)
  s = s.replace(/([^,]{50,}),\s/g, (match, before) => `${before}, `);

  // Strip redundant whitespace / ellipsis sequences
  s = s.replace(/\.{4,}/g, "...");
  s = s.replace(/ {2,}/g, " ");
  s = s.replace(/(\.\.\. ){2,}/g, "... ");

  return s;
}

// ── Clone quality score for UI display ───────────────────────────────────────

export function qualityScoreLabel(score: VoiceQualityScore): {
  color: string;
  advice: string;
} {
  switch (score) {
    case "Excellent":
      return { color: "green", advice: "Excellent training data. Your clone should sound very accurate." };
    case "Good":
      return { color: "blue", advice: "Good sample. Clone accuracy will be high." };
    case "Fair":
      return { color: "amber", advice: "Short sample. Clone will work but may miss vocal nuances." };
    case "Poor":
      return { color: "red", advice: "Sample rejected. Please record a longer, cleaner audio clip." };
  }
}
