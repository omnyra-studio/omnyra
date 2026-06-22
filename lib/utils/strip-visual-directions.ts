/**
 * Strip ALL camera directions, stage directions, scene headers, and shot labels
 * from a script before passing it to ElevenLabs TTS.
 *
 * The original script (with directions) still goes to video prompts — this
 * function only touches what goes to the voice engine.
 */

// Lines that are PURE directions with no narration content — drop the whole line.
// Matches screenplay sluglines, shot labels, action headers, etc.
const PURE_DIRECTION_LINE_RE = new RegExp(
  [
    // Screenplay sluglines: INT. BARRACKS - NIGHT / EXT. FIELD - DAY
    "^(?:INT|EXT|INT\\/EXT|EXT\\/INT)\\s*[.:]",
    // FADE IN / FADE OUT / CUT TO / SMASH CUT / MATCH CUT / DISSOLVE
    "^(?:FADE\\s+(?:IN|OUT|TO\\s+BLACK)|CUT\\s+TO|SMASH\\s+CUT|MATCH\\s+CUT|DISSOLVE\\s+TO|WIPE\\s+TO)",
    // SCENE N: / Scene N / Scene N - / Scene N (
    "^(?:SCENE|Scene)\\s+\\d+\\s*[:\\-–—(]",
    // Shot N: / SHOT N:
    "^(?:SHOT|Shot)\\s+\\d+",
    // [00:00-00:10] or [00:00] timestamp lines
    "^\\[\\d+:\\d+",
    // Stand-alone camera directions: WIDE SHOT: / CLOSE-UP: / MEDIUM SHOT: / etc.
    "^(?:WIDE\\s+(?:SHOT|ANGLE)|CLOSE\\s*(?:-\\s*UP|UP)|MEDIUM\\s+SHOT|LOW\\s+ANGLE|HIGH\\s+ANGLE|OVER\\s+SHOULDER|BIRD'S\\s+EYE|ESTABLISHING\\s+SHOT|TWO\\s+SHOT|REACTION\\s+SHOT|INSERT\\s+SHOT)\\s*[:\\-–—.]?\\s*$",
    // Plain camera directions (pure, no trailing narration)
    "^(?:CAMERA|camera)\\s+(?:PULLS?|PUSHES?|PANS?|TILTS?|TRACKS?|HOLDS?|RISES?|DROPS?)\\s*(?:[:\\-–—.]?\\s*$|\\bto\\b|\\bon\\b)",
    // Action-only lines like "A beat." / "Silence." / "He waits." (optional — keep these)
  ].join("|"),
  "i"
);

// Direction phrases that can appear INLINE mid-sentence — strip the phrase, keep rest.
const INLINE_DIRECTION_RE =
  /,?\s*(?:zoom(?:s)?\s+(?:in|out)|camera\s+(?:pulls?\s+back|pushes?\s+in|holds?|follows?|tracks?|pans?(?:\s+left|\s+right)?|tilts?(?:\s+up|\s+down)?|rises?|drops?)|slowly\s+zooms?|smash\s+cut|rack\s+focus|pull(?:s)?\s+back|push(?:es)?\s+in|pan(?:s)?\s+(?:left|right)|tilt(?:s)?\s+(?:up|down)|tracking\s+shot|dolly\s+(?:in|out)|aerial\s+(?:shot|view)|overhead\s+shot|pov\s+shot|crane\s+shot|steadicam)[^,.!?]*/gi;

// Prefixes to strip from the START of lines (direction label then narration follows).
const DIRECTION_PREFIX_RE =
  /^(?:(?:SHOT\s+\d+\s*[-–—:(]?|Scene\s+\d+\s*[-–—:(]?|Shot\s+\d+\s*[-–—:(]?)\s*(?:\([^)]*\)\s*)?|(?:INT|EXT|INT\/EXT)\s*[.:][^:]*:\s*|(?:WIDE\s+(?:SHOT|ANGLE)|CLOSE\s*-?\s*UP|MEDIUM\s+SHOT|LOW\s+ANGLE|HIGH\s+ANGLE|OVER\s+SHOULDER|ESTABLISHING\s+SHOT)\s*[:\-–—.]\s*|(?:V\.O\.|V\/O|voiceover|NARRATOR|VO)\s*[:(]?\s*)/i;

export function stripVisualDirections(script: string): string {
  // Phase 1: Remove all [bracket] blocks (scene markers, cut notes, timestamps)
  let cleaned = script.replace(/\[(?:(?!\[).)*?\]/gi, "");

  // Phase 2: Remove all (parenthetical) blocks
  cleaned = cleaned.replace(/\([^)]{0,120}\)/g, "");

  // Phase 3: Inline direction phrase removal
  cleaned = cleaned.replace(INLINE_DIRECTION_RE, "");

  // Phase 4: Line-by-line pass
  const lines = cleaned.split("\n").map(line => {
    const t = line.trim();
    if (!t) return "";

    // Drop pure direction lines entirely
    if (PURE_DIRECTION_LINE_RE.test(t)) return "";

    // Strip direction PREFIX from lines that start with a label then have narration
    const stripped = t.replace(DIRECTION_PREFIX_RE, "").trim();

    // If stripping a prefix left meaningful content (≥5 words), keep it
    if (stripped !== t && stripped.split(/\s+/).filter(Boolean).length >= 5) {
      return stripped;
    }
    if (stripped !== t && stripped.split(/\s+/).filter(Boolean).length < 5) {
      return ""; // too short after stripping — was a pure direction
    }

    return t;
  });

  // Phase 5: Cleanup artifacts
  const result = lines
    .filter(l => l.trim().length > 0)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/\.\s*\./g, ".")
    .replace(/^\s*[,;.]\s*/, "")
    .trim();

  return result;
}

/**
 * Strip visual directions with logging and safety fallback.
 * Use this at all TTS call sites.
 */
export function prepareScriptForTts(script: string): string {
  const before = script.trim();
  console.log(`[TTS_SCRIPT_BEFORE] length=${before.length} preview="${before.substring(0, 120).replace(/\n/g, "↵")}"`);

  let after = stripVisualDirections(before);

  if (after.length < 40) {
    // Stripping was too aggressive — fall back to bracket-only strip
    console.warn(`[TTS_STRIP_WARNING] result too short (${after.length} chars) — bracket-only fallback`);
    after = before
      .replace(/\[(?:(?!\[).)*?\]/gi, "")
      .replace(/\([^)]{0,120}\)/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  console.log(`[TTS_SCRIPT_AFTER] length=${after.length} preview="${after.substring(0, 120).replace(/\n/g, "↵")}"`);
  return after;
}
