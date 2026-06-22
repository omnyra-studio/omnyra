/**
 * Whitelist-based TTS script filter.
 * Keeps only sentences that read like spoken narration.
 * Drops camera directions, scene headers, and keyword-soup lines entirely.
 */

// Sentences that START with these words are direction/tech content, not narration.
const DIRECTION_START_RE = /^(?:camera|zoom|pan|tilt|cut|fade|wide|close(?:\s*-\s*up)?|tight|tracking|dolly|aerial|overhead|pov|establishing|angle|lens|focus|rack|handheld|steady|shot|b-roll|slow\s+push|pull\s+back|smash\s+cut|cross\s+dissolve|match\s+cut|time\s+lapse|montage|cinematic|dramatic|4k|photorealistic|film\s+grain|bokeh|volumetric|ultra(?:wide)?|epic|scene\s+\d|int\.|ext\.|int\/ext|ext\/int|fade\s+in|fade\s+out|dissolve|wipe|title\s+card)\b/i;

function isNarration(sentence: string): boolean {
  const s = sentence.trim();
  if (!s) return false;

  // Reject pure camera / direction sentences
  if (DIRECTION_START_RE.test(s)) return false;

  // Reject lines that are still inside bracket blocks
  if (/^\[/.test(s)) return false;

  // Reject very short fragments without terminal punctuation (likely a header or label)
  if (s.length < 15 && !/[.!?]$/.test(s)) return false;

  // Reject comma-separated keyword lists with no verb structure
  // e.g. "olive drab wool shirt, dog tags, leather boots, metal cot"
  const commaCount = (s.match(/,/g) ?? []).length;
  const wordCount = s.split(/\s+/).filter(Boolean).length;
  if (commaCount >= 4 && wordCount < 18) return false;

  return true;
}

export function stripVisualDirections(script: string): string {
  // Strip bracket blocks and parentheticals first
  const cleaned = script
    .replace(/\[(?:(?!\[).)*?\]/gi, '')
    .replace(/\([^)]{0,120}\)/g, '');

  // Split on sentence boundaries (.!? followed by whitespace or end of string)
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  const spoken = sentences.filter(isNarration);

  // Safety: if stripping removed everything, return bracket-cleaned original
  if (spoken.length === 0) {
    return cleaned.replace(/\s{2,}/g, ' ').trim();
  }

  return spoken.join(' ').trim();
}

/**
 * Prepare script text for TTS with full untruncated before/after logging.
 * Used at all ElevenLabs call sites.
 */
export function prepareScriptForTts(script: string): string {
  const before = script.trim();
  console.log('[TTS_FULL_BEFORE]', before);

  let after = stripVisualDirections(before);

  if (after.length < 40) {
    console.warn(`[TTS_STRIP_WARNING] result too short (${after.length} chars) — bracket-only fallback`);
    after = before
      .replace(/\[(?:(?!\[).)*?\]/gi, '')
      .replace(/\([^)]{0,120}\)/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  console.log('[TTS_FULL_AFTER]', after);
  return after;
}
